/**
 * Cobrado/pagado del período actual (después del último "Cierre de período"),
 * igual al criterio que usa el detalle de cuenta en el frontend
 * (modules/accounts/AccountDetail.tsx: split de movimientos por descripción
 * "Cierre de período...").
 *
 * @param {Array<{createdAt: Date, description: string|null, originalAmount: any, payments: Array<{createdAt: Date, description: string|null, amount: any}>}>} accounts
 */
function computeCurrentPeriodTotals(accounts) {
  const movements = [];
  for (const acc of accounts) {
    movements.push({
      date: acc.createdAt,
      type: 'cargo',
      amount: Number(acc.originalAmount),
      description: acc.description || '',
    });
    for (const p of acc.payments || []) {
      movements.push({
        date: p.createdAt,
        type: 'abono',
        amount: Number(p.amount),
        description: p.description || '',
      });
    }
  }
  movements.sort((a, b) => new Date(a.date) - new Date(b.date));

  let lastCloseIndex = -1;
  movements.forEach((m, i) => {
    if (m.description.startsWith('Cierre de período')) lastCloseIndex = i;
  });

  const currentPeriod = movements.slice(lastCloseIndex + 1);
  const totalCharged = currentPeriod.filter((m) => m.type === 'cargo').reduce((s, m) => s + m.amount, 0);
  const totalPaid = currentPeriod.filter((m) => m.type === 'abono').reduce((s, m) => s + m.amount, 0);

  return { totalCharged, totalPaid };
}

module.exports = { computeCurrentPeriodTotals };
