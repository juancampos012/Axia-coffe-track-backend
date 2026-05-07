const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.createPartnerPayment = async (req, res) => {
  try {
    const {
      tenantId,
      partnerId,
      type,
      amount,
      description
    } = req.body;

    const parsedAmount = parseFloat(amount);

    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({
        error: "Monto inválido"
      });
    }

    const company = await prisma.company.findUnique({
      where: { id: tenantId }
    });

    if (!company) {
      return res.status(404).json({
        error: "Empresa no encontrada"
      });
    }

    const payment = await prisma.partnerPaymentItem.create({
      data: {
        tenantId,
        partnerId,
        type,
        amount: parsedAmount,
        description
      }
    });

    ////////////////////////////////////////////////////
    // ACTUALIZAR BALANCE DE EMPRESA
    ////////////////////////////////////////////////////

    if (type === "DEPOSIT" || type === "PAYMENT") {
      await prisma.company.update({
        where: { id: tenantId },
        data: {
          currentBalance: {
            increment: parsedAmount
          }
        }
      });
    }

    if (type === "WITHDRAWAL" || type === "LOAN") {
      await prisma.company.update({
        where: { id: tenantId },
        data: {
          currentBalance: {
            decrement: parsedAmount
          }
        }
      });
    }

    if (type === "ADJUSTMENT") {
      await prisma.company.update({
        where: { id: tenantId },
        data: {
          currentBalance: {
            increment: parsedAmount
          }
        }
      });
    }

    res.status(201).json({
      ...payment,
      balanceUpdated: true
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message
    });
  }
};

exports.getPartnerPayments = async (req, res) => {
  try {
    const payments = await prisma.partnerPaymentItem.findMany({
      where: { partnerId: req.params.partnerId },
      orderBy: { createdAt: "desc" }
    });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPartnerFinancialBalance = async (req, res) => {
  try {
    const items = await prisma.partnerPaymentItem.findMany({
      where: { partnerId: req.params.partnerId }
    });

    let balance = 0;

    items.forEach(item => {
      if (item.type === "LOAN" || item.type === "ADJUSTMENT") {
        balance += Number(item.amount);
      }

      if (item.type === "PAYMENT") {
        balance -= Number(item.amount);
      }
    });

    res.json({ balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updatePartnerPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount, description } = req.body;

    const existing = await prisma.partnerPaymentItem.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({
        error: "Movimiento no encontrado"
      });
    }

    const companyId = existing.tenantId;

    ////////////////////////////////////////////////////
    // REVERSAR VIEJO
    ////////////////////////////////////////////////////

    if (existing.type === "DEPOSIT" || existing.type === "PAYMENT") {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          currentBalance: {
            decrement: existing.amount
          }
        }
      });
    }

    if (existing.type === "WITHDRAWAL" || existing.type === "LOAN") {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          currentBalance: {
            increment: existing.amount
          }
        }
      });
    }

    ////////////////////////////////////////////////////
    // ACTUALIZAR MOVIMIENTO
    ////////////////////////////////////////////////////

    const updated = await prisma.partnerPaymentItem.update({
      where: { id },
      data: {
        type,
        amount,
        description
      }
    });

    ////////////////////////////////////////////////////
    // APLICAR NUEVO
    ////////////////////////////////////////////////////

    if (type === "DEPOSIT" || type === "PAYMENT") {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          currentBalance: {
            increment: amount
          }
        }
      });
    }

    if (type === "WITHDRAWAL" || type === "LOAN") {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          currentBalance: {
            decrement: amount
          }
        }
      });
    }

    res.json({
      ...updated,
      balanceUpdated: true
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

exports.deletePartnerPayment = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await prisma.partnerPaymentItem.findUnique({
      where: { id }
    });

    if (!payment) {
      return res.status(404).json({
        error: "Movimiento no encontrado"
      });
    }

    ////////////////////////////////////////////////////
    // REVERSAR EFECTO EN BALANCE
    ////////////////////////////////////////////////////

    if (payment.type === "DEPOSIT" || payment.type === "PAYMENT") {
      await prisma.company.update({
        where: { id: payment.tenantId },
        data: {
          currentBalance: {
            decrement: payment.amount
          }
        }
      });
    }

    if (payment.type === "WITHDRAWAL" || payment.type === "LOAN") {
      await prisma.company.update({
        where: { id: payment.tenantId },
        data: {
          currentBalance: {
            increment: payment.amount
          }
        }
      });
    }

    if (payment.type === "ADJUSTMENT") {
      await prisma.company.update({
        where: { id: payment.tenantId },
        data: {
          currentBalance: {
            decrement: payment.amount
          }
        }
      });
    }

    await prisma.partnerPaymentItem.delete({
      where: { id }
    });

    res.json({
      message: "Movimiento eliminado",
      balanceUpdated: true
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};