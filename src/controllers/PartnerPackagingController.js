const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.createPackagingMovement = async (req, res) => {
  try {
    const { tenantId, partnerId, type, quantity, description } = req.body;

    const movement = await prisma.partnerPackagingMovement.create({
      data: {
        tenantId,
        partnerId,
        type,
        quantity: parseFloat(quantity),
        description
      }
    });

    res.status(201).json(movement);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPackagingMovements = async (req, res) => {
  try {
    const movements = await prisma.partnerPackagingMovement.findMany({
      where: { partnerId: req.params.partnerId },
      orderBy: { createdAt: "desc" }
    });

    res.json(movements);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPackagingBalance = async (req, res) => {
  try {
    const partnerId = req.params.partnerId;

    const agg = await prisma.partnerPackagingMovement.groupBy({
      by: ['type'],
      where: { partnerId },
      _sum: { quantity: true },
    });

    const totals = { DELIVERED_TO_PARTNER: 0, RETURNED_BY_PARTNER: 0, ADJUSTMENT: 0 };
    agg.forEach(r => { totals[r.type] = Number(r._sum.quantity ?? 0); });

    const balance = totals.DELIVERED_TO_PARTNER - totals.RETURNED_BY_PARTNER + totals.ADJUSTMENT;

    res.json({ packagingBalance: balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updatePackagingMovement = async (req, res) => {
  try {
    const movement = await prisma.partnerPackagingMovement.update({
      where: { id: req.params.id },
      data: req.body
    });

    res.json(movement);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deletePackagingMovement = async (req, res) => {
  try {
    await prisma.partnerPackagingMovement.delete({
      where: { id: req.params.id }
    });

    res.json({ message: "Movimiento de empaque eliminado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};