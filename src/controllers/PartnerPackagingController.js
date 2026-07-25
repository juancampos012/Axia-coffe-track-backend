const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.createPackagingMovement = async (req, res) => {
  try {
    const { tenantId, partnerId, type, packagingType, quantity, description } = req.body;

    const movement = await prisma.partnerPackagingMovement.create({
      data: {
        tenantId,
        partnerId,
        type,
        packagingType: packagingType || 'sacos',
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

    // Saldo desglosado por tipo de empaque físico (sacos, lona_pequena, lona_grande),
    // ya que son objetos distintos y no tiene sentido sumarlos en un solo total.
    const aggByType = await prisma.partnerPackagingMovement.groupBy({
      by: ['type', 'packagingType'],
      where: { partnerId },
      _sum: { quantity: true },
    });

    const byType = {};
    aggByType.forEach(r => {
      const pt = r.packagingType || 'sacos';
      if (!byType[pt]) byType[pt] = { DELIVERED_TO_PARTNER: 0, RETURNED_BY_PARTNER: 0, ADJUSTMENT: 0 };
      byType[pt][r.type] = Number(r._sum.quantity ?? 0);
    });
    const packagingBalanceByType = {};
    Object.keys(byType).forEach(pt => {
      const t = byType[pt];
      packagingBalanceByType[pt] = t.DELIVERED_TO_PARTNER - t.RETURNED_BY_PARTNER + t.ADJUSTMENT;
    });

    res.json({ packagingBalance: balance, packagingBalanceByType });
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