const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();
const logger = require('../config/logger');
const { jsPDF } = require('jspdf');
require('jspdf-autotable'); 
const { generarXMLFactura } = require('../utils/facturacionElectronica');
const fs = require('fs');
const path = require('path');

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

        await tx.company.update({
          where: { id: tenantId },
          data: { [updateField]: { increment: p.quantity } }
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
        let reverseData = {};
        
        // Reversamos el valor a la columna correspondiente
        switch (item.product.name.toLowerCase()) {
          case 'cafe': reverseData = { coffeeQuantity: { increment: item.quantity } }; break;
          case 'cafe mojado': reverseData = { wetCoffeeQuantity: { increment: item.quantity } }; break;
          case 'almendra': reverseData = { beanQuantity: { increment: item.quantity } }; break;
          case 'pasilla': reverseData = { pasillaQuantity: { increment: item.quantity } }; break;
          case 'cacao': reverseData = { cacaoQuantity: { increment: item.quantity } }; break;
          default: reverseData = { stock: { increment: item.quantity } };
        }

        await tx.product.update({
          where: { id: item.productId },
          data: reverseData
        });

        if (item.announcementId) {
          await tx.announcement.update({
            where: { id: item.announcementId },
            data: { remantQuantity: { increment: item.quantity }, isActive: true }
          });
        }
      }

      // Reversar dinero
      await tx.company.update({
        where: { id: invoice.tenantId },
        data: { currentBalance: { decrement: invoice.totalPrice } }
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
 * Obtener PDF de SaleInvoice
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

    const doc = new jsPDF();

    // Encabezado
    doc.setFontSize(18);
    doc.text('Factura de Venta', 14, 22);
    doc.setFontSize(12);
    doc.text(`ID Factura: ${saleInvoice.id}`, 14, 32);
    doc.text(`Fecha: ${new Date(saleInvoice.date).toLocaleString()}`, 14, 38);

    // Información del cliente
    const client = saleInvoice.client || {};
    let y = 46;
    doc.text(`Cliente: ${client.firstName} ${client.lastName}`, 14, y);
    if (client.identification) {
      y += 6;
      doc.text(`Identificación: ${client.identification}`, 14, y);
    }
    if (client.phone) {
      y += 6;
      doc.text(`Teléfono: ${client.phone}`, 14, y);
    }
    if (client.email) {
      y += 6;
      doc.text(`Correo: ${client.email}`, 14, y);
    }

    y += 10;

    // Encabezado de tabla
    doc.setFont(undefined, 'bold');
    doc.text('Producto', 14, y);
    doc.text('Cant.', 60, y);
    doc.text('Base', 80, y);
    doc.text('Imp. %', 105, y);
    doc.text('Precio', 125, y);
    doc.text('Total', 150, y);
    doc.setFont(undefined, 'normal');

    y += 6;

    const items = saleInvoice.invoiceProducts || [];

    for (const item of items) {
      const name = item.product?.name || 'Producto';
      const quantity = item.quantity ?? 0;
      const basePrice = item.product?.purchasePrice ?? 0;
      const tax = item.product?.tax ?? 0;
      const price = item.product?.salePrice ?? 0;

      const itemTotal = quantity * price;

      doc.text(name, 14, y);
      doc.text(quantity.toString(), 60, y);
      doc.text(basePrice.toFixed(2), 80, y);
      doc.text(tax.toString(), 105, y);
      doc.text(price.toFixed(2), 125, y);
      doc.text(itemTotal.toFixed(2), 150, y);

      y += 6;
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
    }

    // Total final
    y += 10;
    doc.setFont(undefined, 'bold');
    doc.text(`Total a Pagar: ${saleInvoice.totalPrice.toFixed(2)} COP`, 14, y);

    const pdfBuffer = doc.output('arraybuffer');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Factura_${saleInvoice.id}.pdf"`);
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
      electronicBill
    } = req.body;

    const existingSaleInvoice = await prisma.saleInvoice.findUnique({
      where: { id },
      select: { tenantId: true, electronicBill: true  }
    });
    
    if (!existingSaleInvoice) {
      return res.status(404).json({ error: 'Factura de venta no encontrada' });
    }
    
    if (req.user.role !== 'SUPERADMIN' && existingSaleInvoice.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de actualización no autorizado. Usuario: ${req.user.id}, Factura de venta: ${id}`);
      return res.status(403).json({ error: 'No autorizado para modificar esta Factura de venta' });
    }

    const updatedSaleInvoice = await prisma.saleInvoice.update({
      where: { id },
      data: {
        clientId,
        date: date ? new Date(date) : undefined,
        totalPrice,
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

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59.999`);
    end.setHours(23, 59, 59, 999);

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
