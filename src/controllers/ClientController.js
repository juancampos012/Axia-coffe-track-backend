const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const logger = require('../config/logger');

const createClient = async (req, res) => {
  try {
    const { tenantId, identification, firstName, middleName, lastName, secondLastName, phone, email } = req.body;
    const clientCompany = await prisma.company.findUnique({ where: { id: tenantId } });

    if (!clientCompany) return res.status(404).json({ error: 'Empresa no encontrada' });

    const newClient = await prisma.client.create({
      data: {
        identification, firstName, middleName, lastName, secondLastName, phone, email,
        tenant: { connect: { id: tenantId } },
      }
    });
    return res.status(201).json(newClient);
  } catch (error) {
    logger.error('Error al crear Cliente:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
};

const getClients = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN' ? {} : { tenantId };
    const clients = await prisma.client.findMany({
      where,
      include: { tenant: true, invoices: true, announcements: true },
    });
    return res.status(200).json(clients);
  } catch (error) {
    return res.status(500).json({ error: 'Error al obtener clientes' });
  }
};

const getClientById = async (req, res) => {
  try {
    const { id } = req.params;
    const where = req.user.role === 'SUPERADMIN' ? { id } : { id, tenantId: req.user.tenantId };
    const client = await prisma.client.findUnique({
      where,
      include: { tenant: true, invoices: true, announcements: true },
    });
    if (!client) return res.status(404).json({ error: 'No encontrado' });
    return res.status(200).json(client);
  } catch (error) {
    return res.status(500).json({ error: 'Error al obtener cliente' });
  }
};

const updateClient = async (req, res) => {
  try {
    const { id } = req.params;
    const { identification, firstName, middleName, lastName, secondLastName, phone, email } = req.body;

    const existingClient = await prisma.client.findUnique({ where: { id }, select: { tenantId: true } });
    if (!existingClient || (req.user.role !== 'SUPERADMIN' && existingClient.tenantId !== req.user.tenantId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const updatedClient = await prisma.client.update({
      where: { id },
      data: { identification, firstName, middleName, lastName, secondLastName, phone, email },
    });
    return res.status(200).json(updatedClient);
  } catch (error) {
    return res.status(500).json({ error: 'Error al actualizar' });
  }
};

const deleteClient = async (req, res) => {
  try {
    const { id } = req.params;
    const existingClient = await prisma.client.findUnique({ where: { id }, select: { tenantId: true } });

    if (!existingClient || (req.user.role !== 'SUPERADMIN' && existingClient.tenantId !== req.user.tenantId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await prisma.client.delete({ where: { id } });
    return res.status(200).json({ message: 'Cliente eliminado' });
  } catch (error) {
    return res.status(500).json({ error: 'Error al eliminar' });
  }
};

const getPublicClients = async (req, res) => {
  try {
    const clients = await prisma.client.findMany({ take: 20 });
    return res.status(200).json(clients);
  } catch (error) {
    return res.status(500).json({ error: 'Error' });
  }
};

// Función corregida y única (sin duplicados)
const getPublicClientById = async (req, res) => {
  try {
    const { id } = req.params;
    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        identification: true,
        firstName: true,
        middleName: true,
        lastName: true,
        secondLastName: true,
        phone: true,
        email: true,
        tenant: { select: { name: true } }
      }
    });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
    return res.status(200).json(client);
  } catch (error) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const searchClientsByName = async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(200).json([]); // Evitar errores si el nombre es vacío

    const terms = name.trim().split(/\s+/);
    const clients = await prisma.client.findMany({
      where: {
        tenantId: req.user.tenantId,
        OR: [
          { firstName: { contains: terms[0], mode: 'insensitive' } },
          { lastName: { contains: terms[0], mode: 'insensitive' } },
          { identification: { contains: terms[0], mode: 'insensitive' } }
        ]
      },
      include: {
        announcements: {
          where: {
            isActive: true,
            remantQuantity: { gt: 0 }
          },
          include: {
            product: true // <--- ¡ESTA ES LA LÍNEA MÁGICA QUE FALTA!
          }
        }
      }
    });
    return res.status(200).json(clients);
  } catch (error) {
    logger.error('Error en búsqueda de clientes:', error);
    return res.status(500).json({ error: 'Error en búsqueda' });
  }
};

module.exports = { 
  createClient, 
  getClients, 
  getClientById, 
  updateClient, 
  deleteClient, 
  getPublicClients, 
  getPublicClientById, 
  searchClientsByName 
};