const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const logger = require('../config/logger');

const createAnnouncement = async (req, res) => {
  try {
    // 1. Recibimos productId del body
    const { clientId, productId, title, description, price, totalQuantity } = req.body;
    const tenantId = req.user.tenantId;

    if (!productId) {
      return res.status(400).json({ error: 'Debes vincular un producto a la fijación' });
    }

    const clientExists = await prisma.client.findFirst({
      where: { id: clientId, tenantId }
    });

    if (!clientExists) {
      return res.status(403).json({ error: 'El cliente no pertenece a esta empresa' });
    }

    // 2. Guardamos con el productId
    const announcement = await prisma.announcement.create({
      data: {
        tenantId,
        clientId,
        productId, // <--- GUARDADO AQUÍ
        title,
        description,
        price: parseFloat(price),
        totalQuantity: parseFloat(totalQuantity),
        remantQuantity: parseFloat(totalQuantity), 
        isActive: true
      },
      include: { product: true } // Para devolver el objeto completo
    });

    logger.info(`Fijación creada ID: ${announcement.id} para producto: ${productId}`);
    return res.status(201).json(announcement);
  } catch (error) {
    logger.error('Error al crear anuncio:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
};

const getAnnouncements = async (req, res) => {
  try {
    const where = req.user.role === 'SUPERADMIN' ? {} : { tenantId: req.user.tenantId };
    
    const list = await prisma.announcement.findMany({
      where,
      include: { 
        client: true,
        product: true, // <--- AHORA VEMOS QUÉ PRODUCTO ES
        saleItems: true,
        purchaseItems: true
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json(list);
  } catch (error) {
    return res.status(500).json({ error: 'Error al obtener lista' });
  }
};

const getActiveAnnouncementsByClient = async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.user.tenantId;

    const announcements = await prisma.announcement.findMany({
      where: { 
          clientId,
          tenantId,
          isActive: true,
          remantQuantity: { gt: 0 }
      },
      include: { product: true } // <--- IMPORTANTE: para que el frontend sepa qué producto bloqueó el precio
    });
    return res.status(200).json(announcements);
  } catch (error) {
    return res.status(500).json({ error: 'Error al buscar anuncios' });
  }
};

module.exports = { 
  createAnnouncement, 
  getAnnouncements, 
  getActiveAnnouncementsByClient 
};