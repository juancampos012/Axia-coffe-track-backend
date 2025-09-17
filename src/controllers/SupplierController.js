const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const logger = require('../config/logger');
const { create } = require('xmlbuilder2');


/**
 * Crear un nuevo Supplier
 */
const createSupplier = async (req, res) => {
  try {
    const {
      tenantId,
      nit,
      name,
      phone,
      address
    } = req.body;

    const supplierCompany = await prisma.company.findUnique({
        where: {id: tenantId}
      })
  
      if (!supplierCompany) {
        return res.status(404).json({ error: 'Empresa no encontrada' });
      }

    const newSupplier = await prisma.supplier.create({
      data: {
        nit,
        name,
        phone,
        address,
        tenant: { connect: { id:tenantId}},
      },
    });
    logger.info(`Proveedor creado exitosamente: ${newSupplier.id}`);
    return res.status(201).json(newSupplier);
  } catch (error) {
    logger.error('Error al crear Proveedor:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener todos los Suppliers
 */
const getSuppliers = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN'
    ? {}
    : { tenantId: tenantId };
    const suppliers = await prisma.supplier.findMany({
      where,
      include: {
        tenant: true,
        products: true,
        purchases: true,
      },
    });
    logger.info(`Se obtuvieron ${suppliers.length} proveedores`);
    return res.status(200).json(suppliers);
  } catch (error) {
    logger.error('Error al obtener Proveedores:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener Supplier por ID
 */
const getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN'
    ? { id }
    : { id, tenantId: tenantId };

    const supplier = await prisma.supplier.findUnique({
      where,
      include: {
        tenant: true,
        products: true,
        purchases: true,
      },
    });

    if (!supplier) {
      logger.warn(`Proveedor no encontrado con id: ${id}`);
      return res.status(404).json({ error: 'Supplier no encontrado' });
    }
    logger.info(`Proveedor obtenido exitosamente: ${id}`);
    return res.status(200).json(supplier);
  } catch (error) {
    logger.error('Error al obtener Proveedor:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Actualizar Supplier
 */
const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nit,
      name,
      phone,
      address
    } = req.body;

    const existingSupplier = await prisma.supplier.findUnique({
      where: { id },
      select: { tenantId: true }
    });
    
    if (!existingSupplier) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    
    if (req.user.role !== 'SUPERADMIN' && existingSupplier.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de actualización no autorizado. Usuario: ${req.user.id}, Proveedor: ${id}`);
      return res.status(403).json({ error: 'No autorizado para modificar este Proveedor' });
    }

    const updatedSupplier = await prisma.supplier.update({
      where: { id },
      data: {
        nit,
        name,
        phone,
        address
      },
    });
    logger.info(`Proveedor actualizado exitosamente: ${id}`);
    return res.status(200).json(updatedSupplier);
  } catch (error) {
    logger.error('Error al actualizar Proveedor:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Eliminar Supplier
 */
const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    const existingSupplier = await prisma.supplier.findUnique({
      where: { id },
      select: { tenantId: true }
    });
    
    if (!existingSupplier) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    
    if (req.user.role !== 'SUPERADMIN' && existingSupplier.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de eliminación no autorizado. Usuario: ${req.user.id}, Proveedor: ${id}`);
      return res.status(403).json({ error: 'No autorizado para eliminar este Proveedor' });
    }

    await prisma.supplier.delete({
      where: { id },
    });
    logger.info(`Proveedor eliminado exitosamente: ${id}`);
    return res.status(200).json({ message: 'Proveedor eliminado con éxito' });
  } catch (error) {
    logger.error('Error al eliminar Proveedor:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const getSuppliersByName = async (req, res) => {
  try {
    const { name } = req.query;
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN'
    ? { name: { contains: name, mode: 'insensitive' } }
    : { name: { contains: name, mode: 'insensitive' }, tenantId: tenantId };

    const suppliers = await prisma.supplier.findMany({
      where,
      include: {
        tenant: true,
      },
    });
    logger.info(`Se obtuvieron ${suppliers.length} proveedores con nombre ${name}`);
    return res.status(200).json(suppliers);
  } catch (error) {
    logger.error('Error al buscar Proveedores por nombre:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  createSupplier, 
  getSuppliers, 
  getSupplierById, 
  updateSupplier, 
  deleteSupplier,
  getSuppliersByName
}
