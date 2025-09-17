const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();
const logger = require('../config/logger');


/**
 * Crear una nueva Company
 */
const createCompany = async (req, res) => {
  try {
    const { nit, name, address, phone, sector } = req.body;

    const newCompany = await prisma.company.create({
      data: {
        nit,
        name,
        address,
        phone,
        sector,
      },
    });
    logger.info(`Empresa creada exitosamente: ${newCompany.id}`);
    return res.status(201).json(newCompany);
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
      include: {
        clients: true,
        users: true,
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
    const { nit, name, address, phone } = req.body;

    const updatedCompany = await prisma.company.update({
      where: { id },
      data: { nit, name, address, phone },
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
