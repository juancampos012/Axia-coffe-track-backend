const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const createSupplierDeposit = async (req, res) => {
  try {
    const { tenantId, supplierId, amount } = req.body;

    if (!tenantId || !supplierId || !amount) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    const deposit = await prisma.supplierDeposit.create({
      data: {
        tenant: { connect: { id: tenantId } },
        supplier: { connect: { id: supplierId } },
        amount
      }
    });

    await prisma.company.update({
      where: { id: tenantId },
      data: {
        currentBalance: {
          increment: amount
        }
      }
    });

    return res.status(201).json(deposit);
  } catch (error) {
    console.error('Error al crear depósito:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const getAllSupplierDeposits = async (req, res) => {
  try {
    const deposits = await prisma.supplierDeposit.findMany({
      include: {
        supplier: true,
        tenant: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json(deposits);
  } catch (error) {
    console.error('Error al obtener depósitos:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const getSupplierDepositById = async (req, res) => {
  try {
    const { id } = req.params;

    const deposit = await prisma.supplierDeposit.findUnique({
      where: { id },
      include: {
        supplier: true,
        tenant: true
      }
    });

    if (!deposit) {
      return res.status(404).json({ error: 'Depósito no encontrado' });
    }

    return res.status(200).json(deposit);
  } catch (error) {
    console.error('Error al obtener depósito:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const updateSupplierDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    const existing = await prisma.supplierDeposit.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({ error: 'Depósito no encontrado' });
    }

    const updated = await prisma.supplierDeposit.update({
      where: { id },
      data: { amount }
    });

    // Ajustar el saldo si cambió el monto
    const difference = amount - existing.amount;
    await prisma.company.update({
      where: { id: existing.tenantId },
      data: {
        currentBalance: {
          increment: difference
        }
      }
    });

    return res.status(200).json(updated);
  } catch (error) {
    console.error('Error al actualizar depósito:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const deleteSupplierDeposit = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.supplierDeposit.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({ error: 'Depósito no encontrado' });
    }

    await prisma.supplierDeposit.delete({ where: { id } });

    // Restar el monto al balance de la empresa
    await prisma.company.update({
      where: { id: existing.tenantId },
      data: {
        currentBalance: {
          decrement: existing.amount
        }
      }
    });

    return res.status(200).json({ message: 'Depósito eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar depósito:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  createSupplierDeposit,
  getAllSupplierDeposits,
  getSupplierDepositById,
  updateSupplierDeposit,
  deleteSupplierDeposit
};
