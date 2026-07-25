const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();
const logger = require('../config/logger');


/**
 * Crear una nueva Company
 */
const DEFAULT_PRODUCTS = ['Cafe Seco', 'Cafe Mojado', 'Cacao', 'Frijol', 'Pasilla'];

const createCompany = async (req, res) => {
  try {
    const { nit, name, address, phone, sector } = req.body;

    if (!nit || !name || !address || !phone) {
      return res.status(400).json({ error: 'Nit, nombre, dirección y teléfono son obligatorios' });
    }

    const logoUrl = req.file ? `/uploads/companies/${req.file.filename}` : undefined;

    const result = await prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: { nit, name, address, phone, sector, logoUrl },
      });

      // Proveedor predeterminado, requerido para poder crear los productos base
      const defaultSupplier = await tx.supplier.create({
        data: {
          tenantId: newCompany.id,
          nit: `${nit}-DEFAULT`,
          name: 'Proveedor Predeterminado',
          phone,
          address,
        },
      });

      await tx.product.createMany({
        data: DEFAULT_PRODUCTS.map((productName) => ({
          tenantId: newCompany.id,
          supplierId: defaultSupplier.id,
          name: productName,
          stock: 0,
        })),
      });

      return newCompany;
    });

    logger.info(`Empresa creada exitosamente con productos base: ${result.id}`);
    return res.status(201).json(result);
  } catch (error) {
    logger.error('Error al crear Company:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener todas las Companies
 */
const getCompanies = async (req, res) => {
  try {
    const companies = await prisma.company.findMany();
    logger.info(`Se obtuvieron ${companies.length} empresas`);
    return res.status(200).json(companies);
  } catch (error) {
    logger.error('Error al obtener Companies:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener Company por ID
 */
const getCompanyById = async (req, res) => {
  try {
    const { id } = req.params; 

    const company = await prisma.company.findUnique({
      where: { id: id },
      select: {
        id: true,
        name: true,
        address: true,
        nit: true,
        phone: true,
        sector: true,
        logoUrl: true,
        currentBalance: true,
        coffeeQuantity: true,
        wetCoffeeQuantity: true,
        beanQuantity: true,
        pasillaQuantity: true,
        cacaoQuantity: true,
      }
    });

    if (!company) {
      logger.warn(`Empresa no encontrado con id: ${id}`);
      return res.status(404).json({ error: 'Company no encontrada' });
    }
    logger.info(`Empresa obtenido exitosamente: ${id}`);
    return res.status(200).json(company);
  } catch (error) {
    logger.error('Error al obtener Company:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Actualizar Company
 */
const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const { nit, name, address, phone, sector } = req.body;

    // Un ADMIN solo puede editar su propia empresa; SUPERADMIN puede editar cualquiera
    if (req.user.role !== 'SUPERADMIN' && req.user.tenantId !== id) {
      logger.warn(`Intento de editar otra empresa. Usuario: ${req.user.id}, Empresa: ${id}`);
      return res.status(403).json({ error: 'No autorizado para modificar esta empresa' });
    }

    const data = { nit, name, address, phone, sector };
    if (req.file) {
      data.logoUrl = `/uploads/companies/${req.file.filename}`;
    }

    const updatedCompany = await prisma.company.update({
      where: { id },
      data,
    });
    logger.info(`Empresa actualizado exitosamente: ${id}`);
    return res.status(200).json(updatedCompany);
  } catch (error) {
    logger.error('Error al actualizar Company:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Eliminar Company
 */
const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.company.delete({
      where: { id },
    });
    logger.info(`Empresa eliminado exitosamente: ${id}`);
    return res.status(200).json({ message: 'Company eliminada con éxito' });
  } catch (error) {
    logger.error('Error al eliminar Company:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {createCompany, getCompanies, getCompanyById, updateCompany, deleteCompany}
