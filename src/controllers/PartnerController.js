const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.createPartner = async (req, res) => {
  try {
    const {
      tenantId,
      name,
      identification,
      phone,
      email,
      address,
      notes
    } = req.body;

    const partner = await prisma.partner.create({
      data: {
        tenantId,
        name,
        identification,
        phone,
        email,
        address,
        notes
      }
    });

    res.status(201).json(partner);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPartners = async (req, res) => {
  try {
    const partners = await prisma.partner.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: { createdAt: "desc" }
    });

    res.json(partners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPartnerById = async (req, res) => {
  try {
    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      include: {
        paymentItems: true,
        packagingMovements: true
      }
    });

    if (!partner) {
      return res.status(404).json({ error: "Socio no encontrado" });
    }

    res.json(partner);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updatePartner = async (req, res) => {
  try {
    const { name, phone, identification, email, address } = req.body;
    const data = {};
    if (name !== undefined)           data.name = name;
    if (phone !== undefined)          data.phone = phone;
    if (identification !== undefined) data.identification = identification;
    if (email !== undefined)          data.email = email;
    if (address !== undefined)        data.address = address;

    const partner = await prisma.partner.update({
      where: { id: req.params.id },
      data
    });

    res.json(partner);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deletePartner = async (req, res) => {
  try {
    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      select: { tenantId: true }
    });

    if (!partner) {
      return res.status(404).json({ error: "Socio no encontrado" });
    }

    if (partner.tenantId !== req.user.tenantId) {
      return res.status(403).json({ error: "No autorizado" });
    }

    await prisma.partner.delete({
      where: { id: req.params.id }
    });

    res.json({ message: "Socio eliminado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};