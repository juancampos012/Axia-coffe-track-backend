const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();
const logger = require('../config/logger');
const { jsPDF } = require('jspdf');
require('jspdf-autotable'); 
const { generarXMLFactura } = require('../utils/facturacionElectronica');
const fs = require('fs');
const path = require('path');
const DEFAULT_LOGO_BASE64 = require('../assets/logoBase64');

/** Lee el logo subido por la empresa desde disco y lo convierte a base64 para el PDF.
 * Si la empresa no tiene logo propio, usa el logo genérico por defecto. */
/** Detecta el formato real de una imagen por sus primeros bytes (magic numbers),
 * en vez de confiar en la extensión del archivo (que puede no coincidir). */
function detectImageFormat(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: 'png', format: 'PNG' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpeg', format: 'JPEG' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: 'webp', format: 'WEBP' };
  }
  return null;
}

function resolveCompanyLogo(logoUrl) {
  if (!logoUrl) return { base64: DEFAULT_LOGO_BASE64, format: 'PNG' };
  try {
    const relativePath = logoUrl.replace(/^\/?uploads\//, '');
    const fullPath = path.join(__dirname, '..', 'uploads', relativePath);
    const buffer = fs.readFileSync(fullPath);

    const detected = detectImageFormat(buffer);
    const extRaw = detected?.ext || (path.extname(fullPath).slice(1).toLowerCase() || 'png');
    const format = detected?.format || (extRaw === 'jpg' ? 'JPEG' : extRaw.toUpperCase());

    return { base64: `data:image/${extRaw};base64,${buffer.toString('base64')}`, format };
  } catch (error) {
    logger.warn(`No se pudo cargar el logo de la empresa (${logoUrl}), usando logo por defecto`);
    return { base64: DEFAULT_LOGO_BASE64, format: 'PNG' };
  }
}

function getCompanyQuantityField(productName) {
  const name = (productName || '').toLowerCase();
  if (name.includes("mojado")) return "wetCoffeeQuantity";
  if (name.includes("cafe") || name.includes("café")) return "coffeeQuantity";
  if (name.includes("frijol") || name.includes("almendra") || name.includes("bean")) return "beanQuantity";
  if (name.includes("pasilla")) return "pasillaQuantity";
  if (name.includes("cacao")) return "cacaoQuantity";
  return null;
}

/**
 * Crear SaleInvoice ajustando inventarios específicos (Café, Pasilla, Cacao, etc.)
 */
const createSaleInvoice = async (req, res) => {
  try {
    const { tenantId, clientId, totalPrice, electronicBill, products = [] } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Crear la factura
      const newSaleInvoice = await tx.saleInvoice.create({
        data: {
          date: new Date(),
          totalPrice,
          electronicBill,
          tenant: { connect: { id: tenantId } },
          client: { connect: { id: clientId } },
        }
      });

      // 2. Procesar productos
      for (const p of products) {
        await tx.saleProductInvoice.create({
          data: {
            invoiceId: newSaleInvoice.id,
            productId: p.productId,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            remainingQuantity: p.quantity, // Lote nuevo: todavía no se ha entregado nada de él
            tenantId: tenantId,
            announcementId: p.announcementId || null // AHORA SÍ FUNCIONARÁ
          }
        });

        // 3. Lógica de Inventario en la tabla Company (según tu Schema)
        const productInfo = await tx.product.findUnique({ where: { id: p.productId } });
        const name = productInfo.name.toLowerCase();
        
        let updateField = "stock"; // por defecto
        if (name.includes("cafe") && !name.includes("mojado")) updateField = "coffeeQuantity";
        else if (name.includes("mojado")) updateField = "wetCoffeeQuantity";
        else if (name.includes("frijol") || name.includes("almendra")) updateField = "beanQuantity";
        else if (name.includes("pasilla")) updateField = "pasillaQuantity";
        else if (name.includes("cacao")) updateField = "cacaoQuantity";

        // Actualizar inventario global de la empresa
        await tx.company.update({
          where: { id: tenantId },
          data: { [updateField]: { increment: p.quantity } }
        });

        // Actualizar stock individual del producto
        await tx.product.update({
          where: { id: p.productId },
          data: { stock: { increment: p.quantity } }
        });

        // 4. DESCUENTO DEL ANUNCIO (FIJACIÓN)
        if (p.announcementId) {
          const ann = await tx.announcement.findUnique({ where: { id: p.announcementId } });
          if (ann) {
            const newRemant = Number(ann.remantQuantity) - Number(p.quantity);
            await tx.announcement.update({
              where: { id: p.announcementId },
              data: { 
                remantQuantity: newRemant, 
                isActive: newRemant > 0 
              }
            });
          }
        }
      }

      // 5. Aumentar balance de dinero
      await tx.company.update({
        where: { id: tenantId },
        data: { currentBalance: { decrement: totalPrice } }
      });

      return newSaleInvoice;
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Eliminar SaleInvoice y REVERSAR los 5 tipos de inventario
 */
const deleteSaleInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.saleInvoice.findUnique({
        where: { id },
        include: { invoiceProducts: { include: { product: true } } }
      });

      if (!invoice) throw new Error('Factura no encontrada');

      for (const item of invoice.invoiceProducts) {
        // Si una entrega (FIFO) ya consumió kilos de este lote, no se puede borrar sin
        // dejar esa entrega sin respaldo de costo. Hay que revertir esa entrega primero.
        const consumptionCount = await tx.deliveryConsumption.count({
          where: { saleProductInvoiceId: item.id }
        });
        if (consumptionCount > 0) {
          throw new Error(
            `No se puede eliminar: el lote de "${item.product.name}" ya fue consumido por una o más entregas. Elimina primero esas entregas.`
          );
        }

        const name = item.product.name.toLowerCase();
        let companyField = null;
        if (name.includes("mojado")) companyField = "wetCoffeeQuantity";
        else if (name.includes("cafe") || name.includes("café")) companyField = "coffeeQuantity";
        else if (name.includes("frijol") || name.includes("almendra") || name.includes("bean")) companyField = "beanQuantity";
        else if (name.includes("pasilla")) companyField = "pasillaQuantity";
        else if (name.includes("cacao")) companyField = "cacaoQuantity";

        // Solo se revierte lo que el lote realmente aporta hoy al stock (remainingQuantity),
        // no la cantidad original de la factura.
        const stockToReverse = item.remainingQuantity;

        if (companyField) {
          await tx.company.update({
            where: { id: invoice.tenantId },
            data: { [companyField]: { decrement: stockToReverse } }
          });
        }

        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: stockToReverse } }
        });

        if (item.announcementId) {
          await tx.announcement.update({
            where: { id: item.announcementId },
            data: { remantQuantity: { increment: item.quantity }, isActive: true }
          });
        }
      }

      // Reversar dinero: al crear la factura se resta (se le paga al productor),
      // así que al eliminarla hay que devolver ese dinero al balance.
      await tx.company.update({
        where: { id: invoice.tenantId },
        data: { currentBalance: { increment: invoice.totalPrice } }
      });

      await tx.saleProductInvoice.deleteMany({ where: { invoiceId: id } });
      await tx.saleInvoice.delete({ where: { id } });
    });

    return res.status(200).json({ message: 'Venta eliminada y stock específico restaurado' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};


/**
 * Obtener todas las SaleInvoices
 */
const getSaleInvoices = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN'
    ? {}
    : { tenantId: tenantId };

    const saleInvoices = await prisma.saleInvoice.findMany({
      where,
      include: {
        tenant: true,
        client: true,
        invoiceProducts: true,
        payment: true,
      },
    });
    logger.info(`Se obtuvieron ${saleInvoices.length} facturas de venta`);
    return res.status(200).json(saleInvoices);
  } catch (error) {
    logger.error('Error al obtener SaleInvoices:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener todas las SaleInvoices publicas
 */
const getPublicSaleInvoices = async (req, res) => {
  try {
    const saleInvoices = await prisma.saleInvoice.findMany({
      include: {
        tenant: true,
        client: true,
        invoiceProducts: true,
        payment: true,
      },
      take: 20 
    });

    logger.info(`Se obtuvieron ${saleInvoices.length} facturas de venta`);
    return res.status(200).json(saleInvoices);
  } catch (error) {
    logger.error('Error al obtener SaleInvoices:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener PDF de SaleInvoice (mismo formato de recibo térmico de 80mm
 * que se genera al completar la venta en el frontend)
 */
const getSaleInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params;

    const saleInvoice = await prisma.saleInvoice.findUnique({
      where: { id },
      include: {
        tenant: true,
        client: true,
        invoiceProducts: {
          include: {
            product: true
          }
        },
        payment: true,
      },
    });

    if (!saleInvoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const client = saleInvoice.client || {};
    const company = saleInvoice.tenant || {};
    const items = (saleInvoice.invoiceProducts || []).map((item) => {
      const unitPrice = Number(item.unitPrice ?? item.product?.salePrice ?? 0);
      const tax = Number(item.product?.tax ?? 0);
      const basePrice = unitPrice / (1 + tax / 100);
      return {
        name: item.product?.name || 'Producto',
        quantity: Number(item.quantity || 0),
        price: unitPrice,
        basePrice,
      };
    });

    const subtotal = items.reduce((s, i) => s + i.quantity * i.basePrice, 0);
    const taxTotal = items.reduce((s, i) => s + i.quantity * (i.price - i.basePrice), 0);
    const total = Number(saleInvoice.totalPrice) || (subtotal + taxTotal);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, (items.length * 8) + 140],
    });

    let yPosition = 5;
    const pageWidth = 80;
    const margin = 4;
    const contentWidth = pageWidth - margin * 2;

    const centerText = (text, y, fontSize = 10) => {
      doc.setFontSize(fontSize);
      const textWidth = doc.getTextWidth(text);
      doc.text(text, (pageWidth - textWidth) / 2, y);
    };

    const rightAlignText = (text, y, fontSize = 9) => {
      doc.setFontSize(fontSize);
      const textWidth = doc.getTextWidth(text);
      doc.text(text, pageWidth - margin - textWidth, y);
    };

    // === ENCABEZADO CON LOGO ===
    try {
      const logo = resolveCompanyLogo(company.logoUrl);
      doc.addImage(logo.base64, logo.format, (pageWidth - 16) / 2, yPosition, 16, 16);
      yPosition += 20;
    } catch (error) {
      yPosition += 3;
    }

    if (company.name) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      centerText(company.name.toUpperCase(), yPosition);
      yPosition += 5.5;
    }

    doc.setLineWidth(0.9);
    doc.setDrawColor(0, 0, 0);
    doc.line(margin + 15, yPosition, pageWidth - margin - 15, yPosition);
    yPosition += 5.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    if (company.address) { centerText(company.address, yPosition); yPosition += 3.5; }
    if (company.nit) { centerText(`NIT: ${company.nit}`, yPosition); yPosition += 3.5; }
    if (company.phone) { centerText(`Tel: ${company.phone}`, yPosition); yPosition += 3.5; }
    if (!company.address && !company.nit && !company.phone) yPosition += 3.5;
    yPosition += 6;

    // Caja para factura con fondo gris suave
    doc.setFillColor(245, 245, 246);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, yPosition, contentWidth, 10, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    centerText('FACTURA DE COMPRA', yPosition + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(90, 90, 90);
    centerText(`Fecha: ${new Date(saleInvoice.date).toLocaleDateString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })}`, yPosition + 8);
    yPosition += 15;

    // === INFORMACIÓN DEL CLIENTE ===
    doc.setFillColor(250, 250, 251);
    doc.setDrawColor(220, 222, 230);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, yPosition, contentWidth, 12, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text('CLIENTE', margin + 2.5, yPosition + 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(20, 20, 20);
    const clientName = `${client.firstName || ''} ${client.lastName || ''}`.toUpperCase();
    const clientLines = doc.splitTextToSize(clientName, contentWidth - 5);
    doc.text(clientLines, margin + 2.5, yPosition + 8.5);
    yPosition += 17;

    // === ENCABEZADO DE PRODUCTOS ===
    doc.setFillColor(0, 0, 0);
    doc.roundedRect(margin, yPosition, contentWidth, 7, 1.5, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    centerText('PRODUCTOS', yPosition + 4.5);
    yPosition += 11.5;

    // === LISTA DE PRODUCTOS ===
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    items.forEach((item, index) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      const productName = item.name.length > 24 ? item.name.substring(0, 24) + '...' : item.name;
      doc.text(productName, margin + 1, yPosition);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(7);
      const unitPrice = item.price.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      doc.text(`${item.quantity}kg x $${unitPrice}`, margin + 1, yPosition + 3.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      const totalItem = (item.quantity * item.price).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      rightAlignText(`$${totalItem}`, yPosition, 8);

      yPosition += 5.5;
      if (index < items.length - 1) {
        doc.setDrawColor(230, 232, 238);
        doc.setLineWidth(0.2);
        doc.line(margin + 1, yPosition, pageWidth - margin - 1, yPosition);
      }
      yPosition += 1.5;
    });

    // === TOTALES ===
    yPosition += 1.5;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.6);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 5;

    doc.setFillColor(0, 0, 0);
    doc.roundedRect(margin, yPosition - 2, contentWidth, 10, 2, 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text('TOTAL', margin + 3, yPosition + 4);

    const totalText = `$${Math.round(total).toLocaleString('es-CO')}`;
    doc.setFontSize(13);
    const totalWidth = doc.getTextWidth(totalText);
    doc.text(totalText, pageWidth - margin - totalWidth - 3, yPosition + 4);

    yPosition += 14;

    // === MENSAJE FINAL ===
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(margin + 15, yPosition, pageWidth - margin - 15, yPosition);
    yPosition += 4.5;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    centerText('¡Gracias por su compra!', yPosition);
    yPosition += 4;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 140);
    centerText('Lo esperamos pronto', yPosition);

    const pdfBuffer = doc.output('arraybuffer');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Factura_${saleInvoice.id}.pdf"`);
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    logger.error('Error al generar PDF:', error);
    res.status(500).json({ error: 'Error interno del servidor al generar PDF' });
  }
};

/**
 * Obtener SaleInvoice por ID
 */
const getSaleInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN'
    ? { id }
    : { id, tenantId: tenantId };

    const saleInvoice = await prisma.saleInvoice.findUnique({
      where,
      include: {
        tenant: true,
        client: true,
        invoiceProducts: {
          include: {
            product: true,
          },
        },
        payment: true,
      },
    });

    if (!saleInvoice) {
      logger.error(`Factura de venta no encontrada con ID: ${id}`);
      return res.status(404).json({ error: 'SaleInvoice no encontrada' });
    }
    logger.info(`Se obtuvo factura de venta con ID: ${id}`);
    return res.status(200).json(saleInvoice);
  } catch (error) {
    logger.error('Error al obtener SaleInvoice:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Actualizar SaleInvoice
 */
const updateSaleInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      clientId,
      date,
      totalPrice,
      electronicBill,
      items, // [{ id: saleProductInvoiceId, productId?, quantity?, unitPrice? }]
    } = req.body;

    const existingSaleInvoice = await prisma.saleInvoice.findUnique({
      where: { id },
      include: { invoiceProducts: { include: { product: true } } }
    });

    if (!existingSaleInvoice) {
      return res.status(404).json({ error: 'Factura de venta no encontrada' });
    }

    if (req.user.role !== 'SUPERADMIN' && existingSaleInvoice.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de actualización no autorizado. Usuario: ${req.user.id}, Factura de venta: ${id}`);
      return res.status(403).json({ error: 'No autorizado para modificar esta Factura de venta' });
    }

    let newTotalPrice = totalPrice;

    // Editar uno o varios ítems de la factura: producto, cantidad y/o precio unitario,
    // ajustando stock, balance y el lote FIFO en consecuencia.
    if (Array.isArray(items) && items.length > 0) {
      const itemsById = new Map(existingSaleInvoice.invoiceProducts.map((p) => [p.id, p]));

      // Validar todos antes de tocar nada: cada ítem debe existir y no haber sido consumido por una entrega
      for (const edit of items) {
        const item = itemsById.get(edit.id);
        if (!item) {
          return res.status(404).json({ error: `Ítem de factura no encontrado: ${edit.id}` });
        }
        const consumptionCount = await prisma.deliveryConsumption.count({
          where: { saleProductInvoiceId: item.id }
        });
        if (consumptionCount > 0) {
          return res.status(400).json({
            error: `No se puede editar "${item.product.name}": ya fue consumido por una entrega. Elimina primero esa entrega.`
          });
        }
      }

      await prisma.$transaction(async (tx) => {
        for (const edit of items) {
          const item = itemsById.get(edit.id);
          const oldQty = Number(item.quantity);
          const oldUnitPrice = Number(item.unitPrice || 0);
          const newQty = edit.quantity !== undefined ? Number(edit.quantity) : oldQty;
          const newUnitPrice = edit.unitPrice !== undefined ? Number(edit.unitPrice) : oldUnitPrice;
          const newProductId = edit.productId || item.productId;
          const productChanged = newProductId !== item.productId;

          await tx.saleProductInvoice.update({
            where: { id: item.id },
            data: {
              productId: newProductId,
              quantity: newQty,
              unitPrice: newUnitPrice,
              remainingQuantity: newQty,
            },
          });

          if (productChanged) {
            const newProduct = await tx.product.findUnique({ where: { id: newProductId } });

            // Revertir stock/categoría del producto anterior por completo
            const oldField = getCompanyQuantityField(item.product.name);
            if (oldField) {
              await tx.company.update({
                where: { id: existingSaleInvoice.tenantId },
                data: { [oldField]: { decrement: oldQty } },
              });
            }
            await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: oldQty } } });

            // Aplicar stock/categoría al producto nuevo por completo
            const newField = getCompanyQuantityField(newProduct.name);
            if (newField) {
              await tx.company.update({
                where: { id: existingSaleInvoice.tenantId },
                data: { [newField]: { increment: newQty } },
              });
            }
            await tx.product.update({ where: { id: newProductId }, data: { stock: { increment: newQty } } });
          } else {
            const qtyDiff = newQty - oldQty;
            if (qtyDiff !== 0) {
              const companyField = getCompanyQuantityField(item.product.name);
              if (companyField) {
                await tx.company.update({
                  where: { id: existingSaleInvoice.tenantId },
                  data: { [companyField]: { increment: qtyDiff } },
                });
              }
              await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: qtyDiff } } });
            }
          }

          const priceDiff = (newQty * newUnitPrice) - (oldQty * oldUnitPrice);
          if (priceDiff !== 0) {
            await tx.company.update({
              where: { id: existingSaleInvoice.tenantId },
              data: { currentBalance: { decrement: priceDiff } },
            });
          }
        }
      });

      // Recalcular el total de la factura sumando TODOS sus ítems (editados y no editados)
      const refreshedItems = await prisma.saleProductInvoice.findMany({ where: { invoiceId: id } });
      newTotalPrice = refreshedItems.reduce((s, p) => s + Number(p.quantity) * Number(p.unitPrice || 0), 0);
    }

    const updatedSaleInvoice = await prisma.saleInvoice.update({
      where: { id },
      data: {
        clientId,
        date: date ? new Date(date) : undefined,
        totalPrice: newTotalPrice,
        electronicBill
      },
    });

    // Si se está habilitando la facturación electrónica, generar el XML
    if (electronicBill === true && existingSaleInvoice.electronicBill !== true) {
      try {
        // Obtener la factura completa con la información del tenant y cliente
        const invoice = await prisma.saleInvoice.findUnique({
          where: { id },
          include: {
            tenant: true,
            client: true
          }
        });
        
        // Obtener los productos asociados a la factura
        const products = await prisma.saleProductInvoice.findMany({
          where: { invoiceId: id },
          include: { product: true }
        });
        
        if (products.length === 0) {
          logger.warn(`Intento de generar factura electrónica sin productos. Factura ID: ${id}`);
          return res.status(400).json({ 
            warning: 'No se puede generar una factura electrónica sin productos',
            invoice: updatedSaleInvoice
          });
        }
        
        // Generar el XML con los datos completos
        const xmlData = generarXMLFactura({
          tenant: invoice.tenant,
          client: invoice.client,
          invoice: updatedSaleInvoice,
          products
        });
        
        // Guardar el XML en una carpeta
        const invoicesDir = path.join(__dirname, '../../facturas_electronicas');
        
        // Crear directorio si no existe
        if (!fs.existsSync(invoicesDir)) {
          fs.mkdirSync(invoicesDir, { recursive: true });
        }
        
        const xmlFilePath = path.join(invoicesDir, `factura_${id}.xml`);
        fs.writeFileSync(xmlFilePath, xmlData);
        
        logger.info(`Factura electrónica generada para factura actualizada: ${id}`);
      } catch (error) {
        logger.error(`Error al generar factura electrónica en actualización: ${error.message}`);
        // No abortamos la actualización, solo registramos el error
      }
    }
    
    logger.info(`Factura de venta actualizada exitosamente: ${id}`);
    return res.status(200).json(updatedSaleInvoice);
  } catch (error) {
    logger.error('Error al actualizar SaleInvoice:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const searchInvoicesByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const tenantId = req.user?.tenantId;
    const role = req.user?.role;

    // Validación de fechas
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Se requieren las fechas de inicio y fin' });
    }

    // Anclado a hora de Colombia (UTC-5, sin DST) sin importar la zona horaria del servidor,
    // para que una compra hecha en la noche caiga en el día correcto al buscarla.
    const start = new Date(`${startDate}T00:00:00-05:00`);
    const end = new Date(`${endDate}T23:59:59.999-05:00`);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Fechas inválidas' });
    }

    // Construcción del filtro
    const where = {
      date: {
        gte: start,
        lte: end,
      },
      ...(role !== 'SUPERADMIN' && tenantId && { tenantId }),
    };

    const saleInvoices = await prisma.saleInvoice.findMany({
      where,
      include: {
        tenant: true,
        client: true,
        invoiceProducts: {
          include: {
            product: true, 
          },
        },
        payment: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    logger.info(`Búsqueda de facturas por fecha. Se encontraron ${saleInvoices.length} resultados`);
    return res.status(200).json(saleInvoices);

  } catch (error) {
    logger.error('Error al buscar SaleInvoices por rango de fechas:', error.message);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message,
    });
  }
};


const searchInvoicesByClient = async (req, res) => {
  try {
    const { name } = req.query;
    const tenantId = req.user.tenantId;
    
    if (!name) {
      return res.status(400).json({ error: 'El parámetro de búsqueda "name" es requerido' });
    }

    const where = {
      OR: [
        { client: { firstName: { contains: name, mode: 'insensitive' } } },
        { client: { lastName: { contains: name, mode: 'insensitive' } } },
      ],
      ...(req.user.role !== 'SUPERADMIN' && { tenantId: tenantId })
    };

    const saleInvoice = await prisma.saleInvoice.findMany({
      where,
      include: {
        tenant: true,
        client: true,
        invoiceProducts: {
          include: {
            product: true,
          },
        },
        payment: true,
      },
      orderBy: {
        date:'asc', 
      }
    });
    
    logger.info(`Búsqueda de productos por nombre: "${name}". Se encontraron ${saleInvoice.length} resultados`);
    return res.status(200).json(saleInvoice);
  } catch (error) {
    logger.error('Error al buscar productos por nombre:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
  
};

module.exports = { 
  createSaleInvoice, 
  getSaleInvoices, 
  getSaleInvoiceById, 
  updateSaleInvoice, 
  deleteSaleInvoice,
  getSaleInvoicePDF, 
  getPublicSaleInvoices,
  searchInvoicesByClient,
  searchInvoicesByDateRange
}
