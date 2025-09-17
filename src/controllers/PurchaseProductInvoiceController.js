const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();
const logger = require('../config/logger');
const { Logform, Logger } = require("winston");

/**
 * Crear un nuevo ProductInvoice
 */
const createPurchaseProductInvoice = async (req, res) => {
  try {
    const {
      tenantId,
      productId,
      invoiceId,
      quantity
    } = req.body;

    const purchaseCompany = await prisma.company.findUnique({
      where: {id: tenantId}
    })

    if (!purchaseCompany) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    // Buscar el producto para actualizar su stock
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Crear la factura de compra
    const newPurchaseProductInvoice = await prisma.purchaseProductInvoice.create({
      data: {
        quantity,
        tenant: { connect: { id: tenantId}},
        purchaseInvoice: { connect: { id: invoiceId}},
        product: { connect: { id: productId}}
      },
    });

    // Actualizar el stock del producto (sumar la cantidad comprada)
    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        stock: product.stock + parseInt(quantity)
      }
    });

    logger.info(`Producto de factura de compra creado exitosamente: ${newPurchaseProductInvoice.id}, Stock actualizado a: ${updatedProduct.stock}`);
    return res.status(201).json(newPurchaseProductInvoice);
  } catch (error) {
    logger.error('Error al crear ProductInvoice:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener todos los PurchaseProductInvoices
 */
const getPurchaseProductInvoices = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN' 
    ? {} 
    : { id, tenantId: tenantId };

    const purchaseProductInvoices = await prisma.purchaseProductInvoice.findMany({
      where,
      include: {
        tenant: true,
        product: true,
        invoice: true,
      },
    });
    logger.info(`Productos de factura de compra obtenidos exitosamente: ${purchaseProductInvoices.length}`);
    return res.status(200).json(purchaseProductInvoices);
  } catch (error) {
    logger.error('Error al obtener PurchaseProductInvoices:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener ProductInvoice por ID
 */
const getPurchaseProductInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN'
    ? { id }
    : { id, tenantId: tenantId };

    const purchaseProductInvoice = await prisma.purchaseProductInvoice.findUnique({
      where,
      include: {
        tenant: true,
        product: true,
        invoice: true,
      },
    });

    if (!purchaseProductInvoice) {
      logger.error(`PurchaseProductInvoice no encontrado: ${id}`);
      return res.status(404).json({ error: 'ProductInvoice no encontrado' });
    }
    logger.info(`PurchaseProductInvoice obtenido exitosamente: ${id}`);
    return res.status(200).json(purchaseProductInvoice);
  } catch (error) {
    logger.error('Error al obtener ProductInvoice:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Actualizar ProductInvoice
 */
const updatePurchaseProductInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { productId, invoiceId, quantity } = req.body;

    // Obtener la factura de compra existente
    const existingInvoice = await prisma.purchaseProductInvoice.findUnique({
      where: { id },
      include: { product: true }
    });
    
    if (!existingInvoice) {
      return res.status(404).json({ error: 'Producto de factura de compra no encontrado' });
    }
    
    // Verificación de permisos
    if (req.user.role !== 'SUPERADMIN' && existingInvoice.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de actualización no autorizado. Usuario: ${req.user.id}, Producto de factura: ${id}`);
      return res.status(403).json({ error: 'No autorizado para modificar este producto de factura' });
    }

    // Calcular la diferencia de stock
    const oldQuantity = existingInvoice.quantity;
    const newQuantity = parseInt(quantity);
    const stockDifference = newQuantity - oldQuantity;
    
    // Si cambia el producto, necesitamos actualizar ambos productos
    if (productId && productId !== existingInvoice.productId) {
      // Restar del producto anterior
      await prisma.product.update({
        where: { id: existingInvoice.productId },
        data: { stock: { decrement: oldQuantity } }
      });
      
      // Sumar al nuevo producto
      await prisma.product.update({
        where: { id: productId },
        data: { stock: { increment: newQuantity } }
      });
    } else {
      // Actualizar stock del mismo producto
      await prisma.product.update({
        where: { id: existingInvoice.productId },
        data: { stock: { increment: stockDifference } }
      });
    }

    // Actualizar la factura
    const updatedInvoice = await prisma.purchaseProductInvoice.update({
      where: { id },
      data: {
        productId: productId || existingInvoice.productId,
        invoiceId: invoiceId || existingInvoice.invoiceId,
        quantity: newQuantity,
      },
    });

    logger.info(`Producto de factura actualizado: ${id}, nueva cantidad: ${newQuantity}`);
    return res.status(200).json(updatedInvoice);
  } catch (error) {
    logger.error('Error al actualizar producto de factura:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Eliminar ProductInvoice
 */
const deletePurchaseProductInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener la factura de compra para saber qué stock restar
    const existingInvoice = await prisma.purchaseProductInvoice.findUnique({
      where: { id },
      include: { product: true }
    });
    
    if (!existingInvoice) {
      return res.status(404).json({ error: 'Producto de factura de compra no encontrado' });
    }
    
    // Verificación de permisos
    if (req.user.role !== 'SUPERADMIN' && existingInvoice.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de eliminación no autorizado. Usuario: ${req.user.id}, Producto de factura: ${id}`);
      return res.status(403).json({ error: 'No autorizado para eliminar este producto de factura' });
    }

    // Actualizar stock - restar la cantidad que se había sumado al comprar
    await prisma.product.update({
      where: { id: existingInvoice.productId },
      data: { stock: { decrement: existingInvoice.quantity } }
    });

    // Eliminar la factura
    await prisma.purchaseProductInvoice.delete({
      where: { id },
    });
    
    logger.info(`Producto de factura eliminado: ${id}, stock actualizado`);
    return res.status(200).json({ message: 'Producto de factura eliminado con éxito' });
  } catch (error) {
    logger.error('Error al eliminar producto de factura:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {createPurchaseProductInvoice, getPurchaseProductInvoices, getPurchaseProductInvoiceById, updatePurchaseProductInvoice, deletePurchaseProductInvoice}