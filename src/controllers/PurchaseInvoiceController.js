const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();
const logger = require('../config/logger');

/**
 * Mapea el nombre de un producto al campo de cantidad global en Company
 * (mismo criterio usado en DeliveryController para descontar stock)
 */
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
 * Crear una nueva PurchaseInvoice
 */
const createPurchaseInvoice = async (req, res) => {
  try {
    const { tenantId, supplierId, date, totalPrice, products = [] } = req.body;

    // Usamos una transacción para que todo sea atómico
    const result = await prisma.$transaction(async (tx) => {
      // 1. Crear la factura
      const newInvoice = await tx.purchaseInvoice.create({
        data: {
          date: new Date(date),
          totalPrice,
          tenantId,
          supplierId
        }
      });

      // 2. Procesar productos y anuncios
      for (const item of products) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        const unitPrice = item.unitPrice !== undefined ? item.unitPrice : product?.purchasePrice;

        await tx.purchaseProductInvoice.create({
          data: {
            purchaseInvoiceId: newInvoice.id,
            tenantId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice,
            announcementId: item.announcementId || null // Si viene de un anuncio
          }
        });

        // Actualizar Stock
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } }
        });

        // Actualizar stock global de la empresa por categoría
        const companyField = getCompanyQuantityField(product?.name);
        if (companyField) {
          await tx.company.update({
            where: { id: tenantId },
            data: { [companyField]: { increment: item.quantity } }
          });
        }

        // LÓGICA DE ANUNCIO: Si tiene anuncio, restamos cantidad
        if (item.announcementId) {
          const ann = await tx.announcement.findUnique({ where: { id: item.announcementId } });
          const newRemant = Number(ann.remantQuantity) - Number(item.quantity);
          
          await tx.announcement.update({
            where: { id: item.announcementId },
            data: { 
              remantQuantity: newRemant,
              isActive: newRemant > 0 // Se desactiva si llega a 0
            }
          });
        }
      }
      return newInvoice;
    });

    return res.status(201).json(result);
  } catch (error) {
    logger.error('Error en createPurchaseInvoice:', error);
    return res.status(500).json({ error: 'Error al procesar la compra' });
  }
};

/**
 * Obtener todas las PurchaseInvoices
 */
const getPurchaseInvoices = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN' 
    ? {} 
    : { tenantId: tenantId };

    const purchaseInvoices = await prisma.purchaseInvoice.findMany({
      where,
      include: {
        tenant: true,
        supplier: true,
      },
    });
    logger.info(`Se obtuvieron ${purchaseInvoices.length} facturas de compra`);
    return res.status(200).json(purchaseInvoices);
  } catch (error) {
    logger.error('Error al obtener PurchaseInvoices:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener PurchaseInvoice por ID
 */
const getPurchaseInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN'
    ? { id }
    : { id, tenantId: tenantId };

    const purchaseInvoice = await prisma.purchaseInvoice.findUnique({
      where,
      include: {
        tenant: true,
        supplier: true,
        products:  {
          include: {
            product: {
              include: {supplier: true}
            }
          },
        },
      },
    });

    if (!purchaseInvoice) {
      logger.warn(`Factura de compra no encontrada con id: ${id}`);
      return res.status(404).json({ error: 'PurchaseInvoice no encontrada' });
    }
    logger.info(`Factura de compra obtenida exitosamente: ${id}`);
    return res.status(200).json(purchaseInvoice);
  } catch (error) {
    logger.error('Error al obtener PurchaseInvoice:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Actualizar PurchaseInvoice
 */
const updatePurchaseInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { supplierId, date, totalPrice, products = [] } = req.body;

    const existingPurchaseInvoice = await prisma.purchaseInvoice.findUnique({
      where: { id },
      select: { tenantId: true },
    });

    if (!existingPurchaseInvoice) {
      return res.status(404).json({ error: "Factura no encontrada" });
    }

    if (
      req.user.role !== "SUPERADMIN" &&
      existingPurchaseInvoice.tenantId !== req.user.tenantId
    ) {
      logger.warn(`No autorizado. Usuario: ${req.user.id}, Factura: ${id}`);
      return res.status(403).json({ error: "No autorizado" });
    }

    // 1. Recupera productos anteriores
    const previousProducts = await prisma.purchaseProductInvoice.findMany({
      where: { purchaseInvoiceId: id },
    });

    // 2. Resta cantidades anteriores del stock
    for (const item of previousProducts) {
      const prevProduct = await prisma.product.update({
        where: { id: item.productId },
        data: {
          stock: {
            decrement: item.quantity,
          },
        },
      });

      const prevCompanyField = getCompanyQuantityField(prevProduct?.name);
      if (prevCompanyField) {
        await prisma.company.update({
          where: { id: existingPurchaseInvoice.tenantId },
          data: { [prevCompanyField]: { decrement: item.quantity } },
        });
      }
    }

    // 3. Borra los productos anteriores
    await prisma.purchaseProductInvoice.deleteMany({
      where: { purchaseInvoiceId: id },
    });

    // 4. Agrega nuevos productos y actualiza el stock
    for (const item of products) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      const unitPrice = item.unitPrice !== undefined ? item.unitPrice : product?.purchasePrice;

      await prisma.purchaseProductInvoice.create({
        data: {
          purchaseInvoice: { connect: { id: id}},
          tenant: { connect: { id: existingPurchaseInvoice.tenantId}},
          product: { connect: { id: item.productId}},
          quantity: item.quantity,
          unitPrice,
        },
      });

      await prisma.product.update({
        where: { id: item.productId },
        data: {
          stock: {
            increment: item.quantity,
          },
        },
      });

      const companyField = getCompanyQuantityField(product?.name);
      if (companyField) {
        await prisma.company.update({
          where: { id: existingPurchaseInvoice.tenantId },
          data: { [companyField]: { increment: item.quantity } },
        });
      }
    }

    const updatedInvoice = await prisma.purchaseInvoice.update({
      where: { id },
      data: {
        supplierId,
        date: date ? new Date(date) : undefined,
        totalPrice,
      },
    });

    logger.info(`Factura de compra ${id} actualizada con stock`);
    return res.status(200).json({ message: "Factura actualizada", updatedInvoice });
  } catch (error) {
    logger.error("Error al actualizar la factura de compra:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

/**
 * Obtener todas las PurchaseInvoices publicas
 */
const getPublicPurchaseInvoices = async (req, res) => {
  try {
    const purchaseInvoices = await prisma.purchaseInvoice.findMany({
      include: {
        tenant: true,
        supplier: true,
        products: true
      },
      take: 20 
    });

    logger.info(`Se obtuvieron ${purchaseInvoices.length} facturas de compra`);
    return res.status(200).json(purchaseInvoices);
  } catch (error) {
    logger.error('Error al obtener PurchaseInvoices:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Eliminar PurchaseInvoice
 */
const deletePurchaseInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.purchaseInvoice.findUnique({ where: { id }, select: { tenantId: true } });
      const items = await tx.purchaseProductInvoice.findMany({
        where: { purchaseInvoiceId: id }
      });

      for (const item of items) {
        const product = await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } }
        });

        const companyField = getCompanyQuantityField(product?.name);
        if (companyField && invoice) {
          await tx.company.update({
            where: { id: invoice.tenantId },
            data: { [companyField]: { decrement: item.quantity } }
          });
        }

        if (item.announcementId) {
          await tx.announcement.update({
            where: { id: item.announcementId },
            data: { 
              remantQuantity: { increment: item.quantity },
              isActive: true // Siempre se activa al devolverle kilos
            }
          });
        }
      }

      await tx.purchaseInvoice.delete({ where: { id } });
    });

    return res.status(200).json({ message: 'Eliminado y saldos restaurados' });
  } catch (error) {
    return res.status(500).json({ error: 'Error al eliminar' });
  }
};

module.exports = {createPurchaseInvoice, getPurchaseInvoices, getPurchaseInvoiceById, updatePurchaseInvoice, deletePurchaseInvoice, getPublicPurchaseInvoices}