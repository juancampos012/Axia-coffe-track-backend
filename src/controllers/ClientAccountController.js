const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

//////////////////////////////////////////////////////
// RESUMEN — TODOS LOS CLIENTES
//////////////////////////////////////////////////////

exports.getAccountsSummary = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN' ? {} : { tenantId };

    const [clients, accounts] = await Promise.all([
      prisma.client.findMany({ where }),
      prisma.clientAccount.findMany({
        where,
        select: { clientId: true, originalAmount: true, pendingAmount: true },
      }),
    ]);

    const map = {};
    for (const acc of accounts) {
      if (!map[acc.clientId]) map[acc.clientId] = { totalDebt: 0, pendingAmount: 0, totalPaid: 0 };
      map[acc.clientId].totalDebt     += Number(acc.originalAmount);
      map[acc.clientId].pendingAmount += Number(acc.pendingAmount);
      map[acc.clientId].totalPaid     += Number(acc.originalAmount) - Number(acc.pendingAmount);
    }

    const summary = clients.map(c => ({
      clientId:      c.id,
      clientName:    `${c.firstName} ${c.lastName}`,
      totalDebt:     map[c.id]?.totalDebt     ?? 0,
      pendingAmount: map[c.id]?.pendingAmount ?? 0,
      totalPaid:     map[c.id]?.totalPaid     ?? 0,
    }));

    const globalPending = summary.reduce((s, c) => s + c.pendingAmount, 0);
    const globalDebt    = summary.reduce((s, c) => s + c.totalDebt,    0);

    res.json({ summary, globalPending, globalDebt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//////////////////////////////////////////////////////
// DETALLE DE UN CLIENTE
//////////////////////////////////////////////////////

exports.getClientDetail = async (req, res) => {
  try {
    const { clientId } = req.params;

    const [client, accounts] = await Promise.all([
      prisma.client.findUnique({ where: { id: clientId } }),
      prisma.clientAccount.findMany({
        where: { clientId },
        include: { payments: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

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
      personId: client.id,
      personName: `${client.firstName} ${client.lastName}`,
      personPhone: client.phone, personEmail: client.email,
      balance, totalCharged: totalDebt, totalPaid, movements,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//////////////////////////////////////////////////////
// CREAR DEUDA DE CLIENTE
//////////////////////////////////////////////////////

exports.createClientAccount = async (req, res) => {
  try {
    const { tenantId, clientId, originalAmount, amount, description, affectsBalance = true } = req.body;
    const parsed = parseFloat(originalAmount ?? amount);
    if (!parsed || parsed <= 0) return res.status(400).json({ error: 'Monto inválido' });

    const account = await prisma.clientAccount.create({
      data: { tenantId, clientId, originalAmount: parsed, pendingAmount: parsed, description },
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
// ABONO POR CLIENTE
//////////////////////////////////////////////////////

exports.updateClientPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, affectsBalance = true } = req.body;

    const payment = await prisma.clientAccountPayment.findUnique({ where: { id } });
    if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });

    const data = {};
    if (description !== undefined) data.description = description;

    if (amount !== undefined) {
      const parsed = parseFloat(amount);
      const diff = parsed - Number(payment.amount);
      data.amount = parsed;

      await prisma.clientAccount.update({
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

    const updated = await prisma.clientAccountPayment.update({ where: { id }, data });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//////////////////////////////////////////////////////
// EDITAR CARGO DE CLIENTE (ClientAccount)
//////////////////////////////////////////////////////

exports.updateClientAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, affectsBalance = true } = req.body;

    const account = await prisma.clientAccount.findUnique({ where: { id } });
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
        await prisma.company.update({
          where: { id: account.tenantId },
          data: { currentBalance: { decrement: diff } },
        });
      }
    }

    const updated = await prisma.clientAccount.update({ where: { id }, data });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.addPaymentByClient = async (req, res) => {
  try {
    const { clientId, amount, description, affectsBalance = true } = req.body;
    const parsedAmount = parseFloat(amount);
    const tenantId = req.user.tenantId;

    const unpaid = await prisma.clientAccount.findMany({
      where: { clientId, isPaid: false, pendingAmount: { gt: 0 } },
      orderBy: { createdAt: 'asc' },
    });

    let remaining = parsedAmount;
    const payments = [];

    await prisma.$transaction(async (tx) => {
      for (const acc of unpaid) {
        if (remaining <= 0) break;
        const toApply = Math.min(remaining, Number(acc.pendingAmount));
        remaining -= toApply;

        const payment = await tx.clientAccountPayment.create({
          data: { accountId: acc.id, tenantId, amount: toApply, description },
        });
        payments.push(payment);

        const newPending = Number(acc.pendingAmount) - toApply;
        await tx.clientAccount.update({
          where: { id: acc.id },
          data: { pendingAmount: newPending, isPaid: newPending <= 0 },
        });
      }

      if (remaining > 0) {
        const creditAccount = await tx.clientAccount.create({
          data: {
            tenantId, clientId,
            originalAmount: -remaining,
            pendingAmount:  -remaining,
            description: `Crédito a favor del cliente — ${description || 'sobrepago'}`,
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

exports.addClientAccountPayment = async (req, res) => {
  try {
    const { accountId, amount, description } = req.body;
    const parsedAmount = parseFloat(amount);

    const account = await prisma.clientAccount.findUnique({ where: { id: accountId } });
    if (!account)   return res.status(404).json({ error: 'Cuenta no encontrada' });
    if (account.isPaid) return res.status(400).json({ error: 'Esta cuenta ya está saldada' });
    if (parsedAmount > Number(account.pendingAmount))
      return res.status(400).json({ error: 'El abono no puede superar el saldo pendiente' });

    const payment = await prisma.clientAccountPayment.create({
      data: { accountId, tenantId: account.tenantId, amount: parsedAmount, description },
    });

    const newPendingAmount = Number(account.pendingAmount) - parsedAmount;
    const updatedAccount = await prisma.clientAccount.update({
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
// OBTENER CUENTAS POR CLIENTE
//////////////////////////////////////////////////////

exports.getClientAccounts = async (req, res) => {
  try {
    const { clientId } = req.params;
    const accounts = await prisma.clientAccount.findMany({
      where: { clientId },
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

exports.getClientAccountById = async (req, res) => {
  try {
    const account = await prisma.clientAccount.findUnique({
      where: { id: req.params.id },
      include: { payments: true, client: true },
    });
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
