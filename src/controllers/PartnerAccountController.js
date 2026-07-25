const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { computeCurrentPeriodTotals } = require('../utils/accountPeriod');

//////////////////////////////////////////////////////
// RESUMEN — TODOS LOS ALIADOS (con o sin cuentas)
//////////////////////////////////////////////////////

exports.getAccountsSummary = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN' ? {} : { tenantId };

    const [partners, accounts] = await Promise.all([
      prisma.partner.findMany({ where }),
      prisma.partnerAccount.findMany({
        where,
        select: {
          partnerId: true, originalAmount: true, pendingAmount: true,
          createdAt: true, description: true,
          payments: { select: { amount: true, createdAt: true, description: true } },
        },
      }),
    ]);

    const map = {};
    for (const acc of accounts) {
      if (!map[acc.partnerId]) map[acc.partnerId] = { pendingAmount: 0, accounts: [] };
      map[acc.partnerId].pendingAmount += Number(acc.pendingAmount);
      map[acc.partnerId].accounts.push(acc);
    }

    const summary = partners.map(p => {
      const entry = map[p.id];
      const { totalCharged, totalPaid } = entry ? computeCurrentPeriodTotals(entry.accounts) : { totalCharged: 0, totalPaid: 0 };
      return {
        partnerId:     p.id,
        partnerName:   p.name,
        totalDebt:     totalCharged,
        pendingAmount: entry?.pendingAmount ?? 0,
        totalPaid,
      };
    });

    const globalPending = summary.reduce((s, p) => s + p.pendingAmount, 0);
    const globalDebt    = summary.reduce((s, p) => s + p.totalDebt,    0);

    res.json({ summary, globalPending, globalDebt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//////////////////////////////////////////////////////
// DETALLE DE UN ALIADO — formato AccountDetail
//////////////////////////////////////////////////////

exports.getPartnerDetail = async (req, res) => {
  try {
    const { partnerId } = req.params;

    const [partner, accounts] = await Promise.all([
      prisma.partner.findUnique({ where: { id: partnerId } }),
      prisma.partnerAccount.findMany({
        where: { partnerId },
        include: { payments: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!partner) return res.status(404).json({ error: 'Aliado no encontrado' });

    let totalDebt = 0, totalPaid = 0, balance = 0;
    const movements = [];

    for (const acc of accounts) {
      totalDebt += Number(acc.originalAmount);
      totalPaid += Number(acc.originalAmount) - Number(acc.pendingAmount);
      balance   += Number(acc.pendingAmount);

      movements.push({
        id: acc.id, createdAt: acc.createdAt,
        type: 'cargo', amount: Number(acc.originalAmount),
        description: acc.description || 'Cargo registrado',
      });

      for (const p of acc.payments) {
        movements.push({
          id: p.id, createdAt: p.createdAt,
          type: 'abono', amount: Number(p.amount),
          description: p.description || 'Abono registrado',
        });
      }
    }

    movements.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    res.json({
      personId: partner.id, personName: partner.name,
      personPhone: partner.phone, personEmail: partner.email,
      balance, totalCharged: totalDebt, totalPaid, movements,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//////////////////////////////////////////////////////
// CREAR DEUDA DE ALIADO
//////////////////////////////////////////////////////

exports.createPartnerAccount = async (req, res) => {
  try {
    const { tenantId, partnerId, originalAmount, amount, description, affectsBalance = true } = req.body;
    const parsed = parseFloat(originalAmount ?? amount);
    if (!parsed || parsed <= 0) return res.status(400).json({ error: 'Monto inválido' });

    const account = await prisma.partnerAccount.create({
      data: { tenantId, partnerId, originalAmount: parsed, pendingAmount: parsed, description },
    });

    if (affectsBalance !== false) {
      await prisma.company.update({
        where: { id: tenantId },
        data: { currentBalance: { decrement: parsed } },
      });
    }

    res.status(201).json({ ...account, balanceUpdated: affectsBalance !== false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//////////////////////////////////////////////////////
// ABONO POR ALIADO (distribuye en cuentas pendientes)
//////////////////////////////////////////////////////

exports.updatePartnerPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, affectsBalance = true } = req.body;

    const payment = await prisma.partnerAccountPayment.findUnique({ where: { id } });
    if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });

    const data = {};
    if (description !== undefined) data.description = description;

    // Si se cambia el monto, ajustar pendingAmount y balance
    if (amount !== undefined) {
      const parsed = parseFloat(amount);
      const diff = parsed - Number(payment.amount);
      data.amount = parsed;

      await prisma.partnerAccount.update({
        where: { id: payment.accountId },
        data: { pendingAmount: { decrement: diff } },
      });
      if (affectsBalance !== false) {
        await prisma.company.update({
          where: { id: payment.tenantId },
          data: { currentBalance: { increment: diff } },
        });
      }
    }

    const updated = await prisma.partnerAccountPayment.update({ where: { id }, data });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//////////////////////////////////////////////////////
// EDITAR CARGO DE ALIADO (PartnerAccount)
//////////////////////////////////////////////////////

exports.updatePartnerAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, affectsBalance = true } = req.body;

    const account = await prisma.partnerAccount.findUnique({ where: { id } });
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const data = {};
    if (description !== undefined) data.description = description;

    if (amount !== undefined) {
      const parsed = parseFloat(amount);
      const alreadyPaid = Number(account.originalAmount) - Number(account.pendingAmount);
      const diff = parsed - Number(account.originalAmount);
      data.originalAmount = parsed;
      data.pendingAmount  = Math.max(0, parsed - alreadyPaid);
      data.isPaid         = data.pendingAmount <= 0;

      if (affectsBalance !== false) {
        // Cargo = balance decreases. If cargo grows (diff > 0), balance decreases more.
        await prisma.company.update({
          where: { id: account.tenantId },
          data: { currentBalance: { decrement: diff } },
        });
      }
    }

    const updated = await prisma.partnerAccount.update({ where: { id }, data });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.addPaymentByPartner = async (req, res) => {
  try {
    const { partnerId, amount, description, affectsBalance = true } = req.body;
    const parsedAmount = parseFloat(amount);
    const tenantId = req.user.tenantId;

    const unpaid = await prisma.partnerAccount.findMany({
      where: { partnerId, isPaid: false, pendingAmount: { gt: 0 } },
      orderBy: { createdAt: 'asc' },
    });

    let remaining = parsedAmount;
    const payments = [];

    await prisma.$transaction(async (tx) => {
      // Pagar cuentas pendientes (FIFO)
      for (const acc of unpaid) {
        if (remaining <= 0) break;
        const toApply = Math.min(remaining, Number(acc.pendingAmount));
        remaining -= toApply;

        const payment = await tx.partnerAccountPayment.create({
          data: { accountId: acc.id, tenantId, amount: toApply, description },
        });
        payments.push(payment);

        const newPending = Number(acc.pendingAmount) - toApply;
        await tx.partnerAccount.update({
          where: { id: acc.id },
          data: { pendingAmount: newPending, isPaid: newPending <= 0 },
        });
      }

      // Si pagó más de lo que debía → crear cuenta de crédito (nosotros quedamos debiendo)
      if (remaining > 0) {
        const creditAccount = await tx.partnerAccount.create({
          data: {
            tenantId, partnerId,
            originalAmount: -remaining,
            pendingAmount:  -remaining,
            description: `Crédito a favor del aliado por sobrepago${description ? ` (${description})` : ''}`,
          },
        });
        payments.push({ type: 'credit', account: creditAccount });
      }
    });

    if (affectsBalance !== false) {
      await prisma.company.update({
        where: { id: tenantId },
        data: { currentBalance: { increment: parsedAmount } },
      });
    }

    res.status(201).json({ payments, balanceUpdated: affectsBalance !== false, creditGenerated: remaining > 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//////////////////////////////////////////////////////
// ABONO POR ACCOUNTID (retrocompat)
//////////////////////////////////////////////////////

exports.addPartnerAccountPayment = async (req, res) => {
  try {
    const { accountId, amount, description } = req.body;
    const parsedAmount = parseFloat(amount);

    const account = await prisma.partnerAccount.findUnique({ where: { id: accountId } });
    if (!account)   return res.status(404).json({ error: 'Cuenta no encontrada' });
    if (account.isPaid) return res.status(400).json({ error: 'Esta cuenta ya está saldada' });
    if (parsedAmount > Number(account.pendingAmount))
      return res.status(400).json({ error: 'El abono no puede ser mayor al saldo pendiente' });

    const payment = await prisma.partnerAccountPayment.create({
      data: { accountId, tenantId: account.tenantId, amount: parsedAmount, description },
    });

    const newPendingAmount = Number(account.pendingAmount) - parsedAmount;
    const updatedAccount = await prisma.partnerAccount.update({
      where: { id: accountId },
      data: { pendingAmount: newPendingAmount, isPaid: newPendingAmount <= 0 },
    });

    await prisma.company.update({
      where: { id: account.tenantId },
      data: { currentBalance: { increment: parsedAmount } },
    });

    res.status(201).json({ payment, account: updatedAccount, balanceUpdated: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//////////////////////////////////////////////////////
// CERRAR PERÍODO SIN SALDO PENDIENTE (marcador de historial)
//////////////////////////////////////////////////////

exports.closePartnerPeriod = async (req, res) => {
  try {
    const { partnerId, description } = req.body;
    const tenantId = req.user.tenantId;

    const marker = await prisma.partnerAccount.create({
      data: {
        tenantId, partnerId,
        originalAmount: 0, pendingAmount: 0, isPaid: true,
        description: description || 'Cierre de período',
      },
    });

    res.status(201).json(marker);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//////////////////////////////////////////////////////
// OBTENER CUENTAS POR ALIADO
//////////////////////////////////////////////////////

exports.getPartnerAccounts = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const accounts = await prisma.partnerAccount.findMany({
      where: { partnerId },
      include: { payments: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//////////////////////////////////////////////////////
// OBTENER CUENTA POR ID
//////////////////////////////////////////////////////

exports.getPartnerAccountById = async (req, res) => {
  try {
    const account = await prisma.partnerAccount.findUnique({
      where: { id: req.params.id },
      include: { payments: true, partner: true },
    });
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
