const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const logger = require('../config/logger');
const e = require("cors");

/**
 * Crear un nuevo ProductInvoice
 */
const createSaleProductInvoice = async (req, res) => {
  try {
    const {
      tenantId,
      productId,
      invoiceId,
      quantity
    } = req.body;

    const invoiceCompany = await prisma.company.findUnique({
      where: {id: tenantId}
    })

    if (!invoiceCompany) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    // Buscar el producto para verificar stock y actualizar
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Verificar si hay stock suficiente
    /* if (product.stock < quantity) {
      return res.status(400).json({ 
        error: 'Stock insuficiente',
        available: product.stock,
        requested: quantity
      });
    } */

    // Crear la factura de venta
    const newSaleProductInvoice = await prisma.saleProductInvoice.create({
      data: {
        quantity,
        tenant: { connect: { id: tenantId}},
        invoice: { connect: { id: invoiceId}},
        product: { connect: { id: productId}}
      },
    });

    // Actualizar el stock del producto (restar la cantidad vendida)
    /* const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        stock: {
          decrement: quantity,
        },
      },
    }); */

    logger.info(`Producto de factura de venta creado exitosamente: ${newSaleProductInvoice.id}`);
    return res.status(201).json(newSaleProductInvoice);
  } catch (error) {
    logger.error('Error al crear ProductInvoice:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener todos los ProductInvoices
 */
const getSaleProductInvoices = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN'
    ? {}
    : { tenant: tenantId };

    const saleProductInvoices = await prisma.saleProductInvoice.findMany({
      include: {
        tenant: true,
        product: true,
        invoice: true,
      },
    });
    logger.info(`Productos de factura de venta obtenidos exitosamente`);
    return res.status(200).json(saleProductInvoices);
  } catch (error) {
    console.error('Error al obtener SaleProductInvoices:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener ProductInvoice por ID
 */
const getSaleProductInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN'
    ? { id }
    : { id, tenantId: tenantId };

    const saleProductInvoice = await prisma.saleProductInvoice.findUnique({
      where,
      include: {
        tenant: true,
        product: true,
        invoice: true,
      },
    });

    if (!saleProductInvoice) {
      logger.error(`SaleProductInvoice no encontrado: ${id}`);
      return res.status(404).json({ error: 'ProductInvoice no encontrado' });
    }
    logger.info(`Producto de factura de venta obtenido exitosamente: ${id}`);
    return res.status(200).json(saleProductInvoice);
  } catch (error) {
    console.error('Error al obtener SaleProductInvoice:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Actualizar ProductInvoice
 */
const updateSaleProductInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { productId, invoiceId, quantity } = req.body;

    const existingSaleProductInvoice = await prisma.saleProductInvoice.findUnique({
      where: { id },
      select: { tenantId: true }
    });
    
    if (!existingSaleProductInvoice) {
      return res.status(404).json({ error: 'Producto de factura de venta no encontrado' });
    }
    
    if (req.user.role !== 'SUPERADMIN' && existingSaleProductInvoice.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de actualización no autorizado. Usuario: ${req.user.id}, Producto de factura de venta: ${id}`);
      return res.status(403).json({ error: 'No autorizado para modificar este producto de la factura de venta' });
    }

    const updatedSaleProductInvoice = await prisma.saleProductInvoice.update({
      where: { id },
      data: {
        productId,
        invoiceId,
        quantity,
      },
    });
    logger.info(`Producto de factura de venta actualizado exitosamente: ${id}`);
    return res.status(200).json(updatedSaleProductInvoice);
  } catch (error) {
    console.error('Error al actualizar SaleProductInvoice:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Eliminar ProductInvoice
 */
const deleteSaleProductInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const existingSaleProductInvoice = await prisma.saleProductInvoice.findUnique({
      where: { id },
      select: { tenantId: true }
    });
    
    if (!existingSaleProductInvoice) {
      return res.status(404).json({ error: 'Producto de factura de venta no encontrado' });
    }
    
    if (req.user.role !== 'SUPERADMIN' && existingSaleProductInvoice.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de eliminación no autorizado. Usuario: ${req.user.id}, Producto de factura de venta: ${id}`);
      return res.status(403).json({ error: 'No autorizado para eliminar este producto de la factura de venta' });
    }

    await prisma.saleProductInvoice.delete({
      where: { id },
    });
    logger.info(`Producto de factura de venta eliminado exitosamente: ${id}`);
    return res.status(200).json({ message: 'SaleProductInvoice eliminado con éxito' });
  } catch (error) {
    console.error('Error al eliminar SaleProductInvoice:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { createSaleProductInvoice, getSaleProductInvoices, getSaleProductInvoiceById, updateSaleProductInvoice, deleteSaleProductInvoice }