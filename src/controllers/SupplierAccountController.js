const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

//////////////////////////////////////////////////////
// RESUMEN — TODOS LOS PROVEEDORES
//////////////////////////////////////////////////////

exports.getAccountsSummary = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN' ? {} : { tenantId };

    const [suppliers, accounts] = await Promise.all([
      prisma.supplier.findMany({ where }),
      prisma.supplierAccount.findMany({
        where,
        select: { supplierId: true, originalAmount: true, pendingAmount: true },
      }),
    ]);

    const map = {};
    for (const acc of accounts) {
      if (!map[acc.supplierId]) map[acc.supplierId] = { totalDebt: 0, pendingAmount: 0, totalPaid: 0 };
      map[acc.supplierId].totalDebt     += Number(acc.originalAmount);
      map[acc.supplierId].pendingAmount += Number(acc.pendingAmount);
      map[acc.supplierId].totalPaid     += Number(acc.originalAmount) - Number(acc.pendingAmount);
    }

    const summary = suppliers.map(s => ({
      supplierId:    s.id,
      supplierName:  s.name,
      totalDebt:     map[s.id]?.totalDebt     ?? 0,
      pendingAmount: map[s.id]?.pendingAmount ?? 0,
      totalPaid:     map[s.id]?.totalPaid     ?? 0,
    }));

    const globalPending = summary.reduce((s, p) => s + p.pendingAmount, 0);
    const globalDebt    = summary.reduce((s, p) => s + p.totalDebt,    0);

    res.json({ summary, globalPending, globalDebt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//////////////////////////////////////////////////////
// DETALLE DE UN PROVEEDOR
//////////////////////////////////////////////////////

exports.getSupplierDetail = async (req, res) => {
  try {
    const { supplierId } = req.params;

    const [supplier, accounts] = await Promise.all([
      prisma.supplier.findUnique({ where: { id: supplierId } }),
      prisma.supplierAccount.findMany({
        where: { supplierId },
        include: { payments: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado' });

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
      personId: supplier.id, personName: supplier.name,
      personPhone: supplier.phone, personEmail: null,
      balance, totalCharged: totalDebt, totalPaid, movements,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//////////////////////////////////////////////////////
// CREAR DEUDA CON PROVEEDOR
//////////////////////////////////////////////////////

exports.createSupplierAccount = async (req, res) => {
  try {
    const { tenantId, supplierId, originalAmount, amount, description, affectsBalance = true } = req.body;
    const parsed = parseFloat(originalAmount ?? amount);
    if (!parsed || parsed <= 0) return res.status(400).json({ error: 'Monto inválido' });

    const account = await prisma.supplierAccount.create({
      data: { tenantId, supplierId, originalAmount: parsed, pendingAmount: parsed, description },
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
// ABONO POR PROVEEDOR
//////////////////////////////////////////////////////

exports.updateSupplierPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, affectsBalance = true } = req.body;

    const payment = await prisma.supplierAccountPayment.findUnique({ where: { id } });
    if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });

    const data = {};
    if (description !== undefined) data.description = description;

    if (amount !== undefined) {
      const parsed = parseFloat(amount);
      const diff = parsed - Number(payment.amount);
      data.amount = parsed;

      await prisma.supplierAccount.update({
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

    const updated = await prisma.supplierAccountPayment.update({ where: { id }, data });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//////////////////////////////////////////////////////
// EDITAR CARGO DE PROVEEDOR (SupplierAccount)
//////////////////////////////////////////////////////

exports.updateSupplierAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, affectsBalance = true } = req.body;

    const account = await prisma.supplierAccount.findUnique({ where: { id } });
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

    const updated = await prisma.supplierAccount.update({ where: { id }, data });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.addPaymentBySupplier = async (req, res) => {
  try {
    const { supplierId, amount, description, affectsBalance = true } = req.body;
    const parsedAmount = parseFloat(amount);
    const tenantId = req.user.tenantId;

    const unpaid = await prisma.supplierAccount.findMany({
      where: { supplierId, isPaid: false, pendingAmount: { gt: 0 } },
      orderBy: { createdAt: 'asc' },
    });

    let remaining = parsedAmount;
    const payments = [];

    await prisma.$transaction(async (tx) => {
      for (const acc of unpaid) {
        if (remaining <= 0) break;
        const toApply = Math.min(remaining, Number(acc.pendingAmount));
        remaining -= toApply;

        const payment = await tx.supplierAccountPayment.create({
          data: { accountId: acc.id, tenantId, amount: toApply, description },
        });
        payments.push(payment);

        const newPending = Number(acc.pendingAmount) - toApply;
        await tx.supplierAccount.update({
          where: { id: acc.id },
          data: { pendingAmount: newPending, isPaid: newPending <= 0 },
        });
      }

      if (remaining > 0) {
        const creditAccount = await tx.supplierAccount.create({
          data: {
            tenantId, supplierId,
            originalAmount: -remaining,
            pendingAmount:  -remaining,
            description: `Crédito a favor del proveedor — ${description || 'sobrepago'}`,
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

exports.addSupplierAccountPayment = async (req, res) => {
  try {
    const { accountId, amount, description } = req.body;
    const parsedAmount = parseFloat(amount);

    const account = await prisma.supplierAccount.findUnique({ where: { id: accountId } });
    if (!account)   return res.status(404).json({ error: 'Cuenta no encontrada' });
    if (account.isPaid) return res.status(400).json({ error: 'Esta cuenta ya está saldada' });
    if (parsedAmount > Number(account.pendingAmount))
      return res.status(400).json({ error: 'El pago no puede superar el saldo pendiente' });

    const payment = await prisma.supplierAccountPayment.create({
      data: { accountId, tenantId: account.tenantId, amount: parsedAmount, description },
    });

    const newPendingAmount = Number(account.pendingAmount) - parsedAmount;
    const updatedAccount = await prisma.supplierAccount.update({
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
// OBTENER CUENTAS POR PROVEEDOR
//////////////////////////////////////////////////////

exports.getSupplierAccounts = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const accounts = await prisma.supplierAccount.findMany({
      where: { supplierId },
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

exports.getSupplierAccountById = async (req, res) => {
  try {
    const account = await prisma.supplierAccount.findUnique({
      where: { id: req.params.id },
      include: { payments: true, supplier: true },
    });
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
