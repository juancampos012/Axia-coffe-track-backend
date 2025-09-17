const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();
const logger = require('../config/logger');

/**
 * Crear una nueva PurchaseInvoice
 */
const createPurchaseInvoice = async (req, res) => {
  try {
    const {
      tenantId,
      supplierId,
      date,
      totalPrice
    } = req.body;

    const invoiceCompany = await prisma.company.findUnique({
      where: {id: tenantId}
    })
  
    if (!invoiceCompany) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    
    const newPurchaseInvoice = await prisma.purchaseInvoice.create({
      data: {
        date: new Date(date),
        totalPrice,
        tenant: {
          connect: { id: tenantId}
        },
        supplier: { 
          connect: { id: supplierId}
        }
      },
    });

    logger.info(`Factura de compra creada exitosamente: ${newPurchaseInvoice.id}`);
    return res.status(201).json(newPurchaseInvoice);
  } catch (error) {
    logger.error('Error al crear PurchaseInvoice:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
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
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          stock: {
            decrement: item.quantity,
          },
        },
      });
    }

    // 3. Borra los productos anteriores
    await prisma.purchaseProductInvoice.deleteMany({
      where: { purchaseInvoiceId: id },
    });

    // 4. Agrega nuevos productos y actualiza el stock
    for (const item of products) {
      await prisma.purchaseProductInvoice.create({
        data: {
          purchaseInvoice: { connect: { id: id}},
          tenant: { connect: { id: existingPurchaseInvoice.tenantId}},
          product: { connect: { id: item.productId}},
          quantity: item.quantity,
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

    const existingPurchaseInvoice = await prisma.purchaseInvoice.findUnique({
      where: { id },
      select: { tenantId: true }
    });
    
    if (!existingPurchaseInvoice) {
      return res.status(404).json({ error: 'Factura de compra no encontrada' });
    }
    
    if (req.user.role !== 'SUPERADMIN' && existingPurchaseInvoice.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de eliminación no autorizado. Usuario: ${req.user.id}, Factura de compra: ${id}`);
      return res.status(403).json({ error: 'No autorizado para eliminar esta Factura de compra' });
    }

    // Obtener los productos vinculados a la factura
    const invoiceProducts = await prisma.purchaseProductInvoice.findMany({
      where: { purchaseInvoiceId: id },
      select: {
        productId: true,
        quantity: true
      }
    });

    // Actualizar el stock de los productos sumando la cantidad eliminada
    const updateStockPromises = invoiceProducts.map(({ productId, quantity }) =>
      prisma.product.update({
        where: { id: productId },
        data: {
          stock: {
            decrement: quantity
          }
        }
      })
    );

    await Promise.all(updateStockPromises);

    await prisma.purchaseInvoice.delete({
      where: { id },
    });

    logger.info(`Factura de compra eliminada exitosamente: ${id}`);
    return res.status(200).json({ message: 'Factura de compra eliminada con éxito' });
  } catch (error) {
    logger.error('Error al eliminar la Factura de compra:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {createPurchaseInvoice, getPurchaseInvoices, getPurchaseInvoiceById, updatePurchaseInvoice, deletePurchaseInvoice, getPublicPurchaseInvoices}