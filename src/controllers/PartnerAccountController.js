const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

//////////////////////////////////////////////////////
// CREAR DEUDA DE SOCIO
//////////////////////////////////////////////////////

exports.createPartnerAccount = async (req, res) => {
  try {
    const {
      tenantId,
      partnerId,
      originalAmount,
      description
    } = req.body;

    const amount = parseFloat(originalAmount);

    if (amount <= 0) {
      return res.status(400).json({
        error: "Monto inválido"
      });
    }

    const account = await prisma.partnerAccount.create({
      data: {
        tenantId,
        partnerId,
        originalAmount: amount,
        pendingAmount: amount,
        description
      }
    });

    ////////////////////////////////////////////////////
    // SALE DINERO DE CAJA → DISMINUYE BALANCE
    ////////////////////////////////////////////////////

    await prisma.company.update({
      where: { id: tenantId },
      data: {
        currentBalance: {
          decrement: amount
        }
      }
    });

    res.status(201).json({
      ...account,
      balanceUpdated: true
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

//////////////////////////////////////////////////////
// REGISTRAR ABONO
//////////////////////////////////////////////////////

exports.addPartnerAccountPayment = async (req, res) => {
  try {
    const {
      accountId,
      amount,
      description
    } = req.body;

    const parsedAmount = parseFloat(amount);

    const account = await prisma.partnerAccount.findUnique({
      where: { id: accountId }
    });

    if (!account) {
      return res.status(404).json({
        error: "Cuenta no encontrada"
      });
    }

    if (account.isPaid) {
      return res.status(400).json({
        error: "Esta cuenta ya está saldada"
      });
    }

    if (parsedAmount > Number(account.pendingAmount)) {
      return res.status(400).json({
        error: "El abono no puede ser mayor al saldo pendiente"
      });
    }

    const payment = await prisma.partnerAccountPayment.create({
      data: {
        accountId,
        tenantId: account.tenantId,
        amount: parsedAmount,
        description
      }
    });

    const newPendingAmount =
      Number(account.pendingAmount) - parsedAmount;

    const updatedAccount = await prisma.partnerAccount.update({
      where: { id: accountId },
      data: {
        pendingAmount: newPendingAmount,
        isPaid: newPendingAmount <= 0
      }
    });

    ////////////////////////////////////////////////////
    // ENTRA DINERO A CAJA
    ////////////////////////////////////////////////////

    await prisma.company.update({
      where: { id: account.tenantId },
      data: {
        currentBalance: {
          increment: parsedAmount
        }
      }
    });

    res.status(201).json({
      payment,
      account: updatedAccount,
      balanceUpdated: true
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

//////////////////////////////////////////////////////
// OBTENER CUENTAS POR SOCIO
//////////////////////////////////////////////////////

exports.getPartnerAccounts = async (req, res) => {
  try {
    const { partnerId } = req.params;

    const accounts = await prisma.partnerAccount.findMany({
      where: { partnerId },
      include: {
        payments: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json(accounts);

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

//////////////////////////////////////////////////////
// OBTENER CUENTA POR ID
//////////////////////////////////////////////////////

exports.getPartnerAccountById = async (req, res) => {
  try {
    const account = await prisma.partnerAccount.findUnique({
      where: { id: req.params.id },
      include: {
        payments: true,
        partner: true
      }
    });

    if (!account) {
      return res.status(404).json({
        error: "Cuenta no encontrada"
      });
    }

    res.json(account);

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};