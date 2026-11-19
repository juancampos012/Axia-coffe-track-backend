const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const logger = require('../config/logger');
const { ValidationError, validateCreateClient, validateUpdateClient, serializeClient } = require('../utils/clientValidation');

const CLIENT_FIELDS = {
  id: true,
  tenantId: true,
  identification: true,
  firstName: true,
  middleName: true,
  lastName: true,
  secondLastName: true,
  phone: true,
  email: true,
  birthDate: true,
  farmName: true,
  farmVereda: true,
  farmTotalHectares: true,
  farmCoffeeHectares: true,
  coffeeTrees: true,
  createdAt: true,
};

// Errores de validación o de unicidad: { message } legible para el alert del frontend
const handleClientWriteError = (error, res) => {
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  if (error.code === 'P2002') {
    return res.status(409).json({ message: 'Ya existe un cliente con esa identificación.' });
  }
  return null;
};

const createClient = async (req, res) => {
  try {
    const { tenantId } = req.body;
    const data = validateCreateClient(req.body);
    const clientCompany = await prisma.company.findUnique({ where: { id: tenantId } });

    if (!clientCompany) return res.status(404).json({ error: 'Empresa no encontrada', message: 'Empresa no encontrada' });

    const newClient = await prisma.client.create({
      data: {
        ...data,
        tenant: { connect: { id: tenantId } },
      }
    });
    return res.status(201).json(serializeClient(newClient));
  } catch (error) {
    if (handleClientWriteError(error, res)) return;
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
      select: CLIENT_FIELDS,
    });
    return res.status(200).json(clients.map(serializeClient));
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
    return res.status(200).json(serializeClient(client));
  } catch (error) {
    return res.status(500).json({ error: 'Error al obtener cliente' });
  }
};

const updateClient = async (req, res) => {
  try {
    const { id } = req.params;

    const existingClient = await prisma.client.findUnique({
      where: { id },
      select: { tenantId: true, farmTotalHectares: true, farmCoffeeHectares: true },
    });
    if (!existingClient || (req.user.role !== 'SUPERADMIN' && existingClient.tenantId !== req.user.tenantId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const data = validateUpdateClient(req.body, existingClient);
    const updatedClient = await prisma.client.update({
      where: { id },
      data,
    });
    return res.status(200).json(serializeClient(updatedClient));
  } catch (error) {
    if (handleClientWriteError(error, res)) return;
    logger.error('Error al actualizar Cliente:', error);
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
    const clients = await prisma.client.findMany({
      take: 20,
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });
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
    return res.status(200).json(clients.map(serializeClient));
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