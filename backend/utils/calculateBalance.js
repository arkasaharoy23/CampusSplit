export function recalculateMemberBalances(currentBalances, expense, paidByUid, splits) {
  const balances = { ...currentBalances };

  Object.entries(splits).forEach(([uid, share]) => {
    if (!(uid in balances)) balances[uid] = 0;
    if (uid === paidByUid) {
      balances[uid] += expense.amount - share;
    } else {
      balances[uid] -= share;
    }
  });

  return balances;
}

export function reverseExpenseBalances(currentBalances, expense) {
  const balances = { ...currentBalances };
  const { paidBy, splits = {}, amount } = expense;

  Object.entries(splits).forEach(([uid, share]) => {
    if (!(uid in balances)) balances[uid] = 0;
    if (uid === paidBy) {
      balances[uid] -= amount - share;
    } else {
      balances[uid] += share;
    }
  });

  return balances;
}
