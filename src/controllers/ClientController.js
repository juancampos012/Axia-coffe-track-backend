const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();
const logger = require('../config/logger');

/**
 * Crear un nuevo Client
 */
const createClient = async (req, res) => {
  try {
    const {
      tenantId,
      identification,
      firstName,
      lastName,
      email
    } = req.body;

    console.log(req.body);

    const clientCompany = await prisma.company.findUnique({
      where: {id: tenantId}
    })

    if (!clientCompany) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const newClient = await prisma.client.create({
      data: {
        identification,
        firstName,
        lastName,
        email,
        tenant: { connect: { id: tenantId}},
      }
    });
    logger.info(`Cliente creado exitosamente: ${newClient.id}`);
    return res.status(201).json(newClient);
  } catch (error) {
    logger.error('Error al crear Cliente:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener todos los Clients
 */
const getClients = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN' 
      ? {} 
      : { tenantId: tenantId };

    const clients = await prisma.client.findMany({
      where,
      include: {
        tenant: true,      // Muestra la información de la Company asociada
        invoices: true,    // Muestra las facturas de venta asociadas
      },
    });

    logger.info(`Se obtuvieron ${clients.length} clientes`);
    return res.status(200).json(clients);
  } catch (error) {
    logger.error('Error al obtener Clients:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener Client por ID
 */
const getClientById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN' 
      ? { id } 
      : { id, tenantId: tenantId };

    const client = await prisma.client.findUnique({
      where,
      include: {
        tenant: true,
        invoices: true,
      },
    });

    if (!client) {
      logger.warn(`Cliente no encontrado con id: ${id}`);
      return res.status(404).json({ error: 'Client no encontrado' });
    }
    logger.info(`Cliente obtenido exitosamente: ${id}`);
    return res.status(200).json(client);
  } catch (error) {
    logger.error('Error al obtener Cliente:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Actualizar Client
 */
const updateClient = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      identification,
      firstName,
      lastName,
      email
    } = req.body;

    // Obtener el cliente existente para verificar el tenant
    const existingClient = await prisma.client.findUnique({
      where: { id },
      select: { tenantId: true }
    });

    // Verificar si el cliente existe
    if (!existingClient) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Verificar que el tenant del usuario autenticado coincida con el tenant del cliente
    if (existingClient.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de actualización no autorizado. Usuario: ${req.user.id}, Cliente: ${id}`);
      return res.status(403).json({ error: 'No autorizado para modificar este cliente' });
    }

    const updatedClient = await prisma.client.update({
      where: { id },
      data: {
        identification,
        firstName,
        lastName,
        email,
      },
    });

    logger.info(`Cliente actualizado exitosamente: ${id}`);
    return res.status(200).json(updatedClient);
  } catch (error) {
    logger.error('Error al actualizar Cliente:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Actualizar Client
 */
const deleteClient = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener el cliente existente para verificar el tenant
    const existingClient = await prisma.client.findUnique({
      where: { id },
      select: { tenantId: true }
    });

    // Verificar si el cliente existe
    if (!existingClient) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Verificar que el tenant del usuario autenticado coincida con el tenant del cliente
    if (existingClient.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de eliminación no autorizado. Usuario: ${req.user.id}, Cliente: ${id}`);
      return res.status(403).json({ error: 'No autorizado para eliminar este cliente' });
    }

    await prisma.client.delete({
      where: { id },
    });

    logger.info(`Cliente eliminado exitosamente: ${id}`);
    return res.status(200).json({ message: 'Client eliminado con éxito' });
  } catch (error) {
    logger.error('Error al eliminar Cliente:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener clientes públicos (versión limitada para SSG)
 */
const getPublicClients = async (req, res) => {
  try {
    const clients = await prisma.client.findMany({
      select: {
        id: true,
        identification: true,
        firstName: true,
        lastName: true,
        email: true,
        tenant: { select: { name: true, id: true } },
      },
      take: 20
    });
    
    logger.info(`Acceso público a lista de clientes`);
    return res.status(200).json(clients);
  } catch (error) {
    logger.error('Error al obtener clientes públicos:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener cliente público por ID
 */
const getPublicClientById = async (req, res) => {
  try {
    const { id } = req.params;
 
    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        identification: true,
        firstName: true,
        lastName: true,
        email: true,
        tenant: { select: { name: true, id: true } },
      },
    });

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    
    logger.info(`Acceso público a cliente: ${id}`);
    return res.status(200).json(client);
  } catch (error) {
    logger.error('Error al obtener cliente público:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Buscar Clients por nombre
 */
const searchClientsByName = async (req, res) => {
  try {
    const { name } = req.query;
    const tenantId = req.user.tenantId;

    if (!name) {
      return res.status(400).json({ error: 'El parámetro de búsqueda "name" es requerido' });
    }

    // Dividir el término de búsqueda en palabras separadas
    const terms = name.trim().split(/\s+/);

    let where;

    if (req.user.role === 'SUPERADMIN') {
      if (terms.length === 1) {
        // Buscar si la palabra está en firstName o lastName
        where = {
          OR: [
            { firstName: { contains: terms[0], mode: 'insensitive' } },
            { lastName: { contains: terms[0], mode: 'insensitive' } }
          ]
        };
      } else {
        // Para más de una palabra: buscar combinación firstName y lastName
        where = {
          AND: [
            { firstName: { contains: terms[0], mode: 'insensitive' } },
            { lastName: { contains: terms[1], mode: 'insensitive' } }
          ]
        };
      }
    } else {
      if (terms.length === 1) {
        where = {
          tenantId,
          OR: [
            { firstName: { contains: terms[0], mode: 'insensitive' } },
            { lastName: { contains: terms[0], mode: 'insensitive' } }
          ]
        };
      } else {
        where = {
          tenantId,
          AND: [
            { firstName: { contains: terms[0], mode: 'insensitive' } },
            { lastName: { contains: terms[1], mode: 'insensitive' } }
          ]
        };
      }
    }

    const clients = await prisma.client.findMany({
      where,
      select: {
        id: true,
        identification: true,
        firstName: true,
        lastName: true,
        email: true
      },
      orderBy: {
        firstName: 'asc'
      }
    });

    logger.info(`Búsqueda de clientes por nombre: "${name}". Se encontraron ${clients.length} resultados`);
    return res.status(200).json(clients);
  } catch (error) {
    logger.error('Error al buscar clientes por nombre:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { 
  createClient, 
  getClients, 
  getClientById, 
  updateClient, 
  deleteClient,
  getPublicClientById,
  getPublicClients,
  searchClientsByName 
}