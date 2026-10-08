// Rounds to 2 decimal places so we don't get numbers like 1793.3333333
function round(number) {
  return Math.round(number * 100) / 100;
}

// Takes a list of transactions and returns the key cash-flow numbers
function calculateMetrics(transactions, openingBalance = 0) {
  let totalIncome = 0;
  let totalExpenses = 0;
  const months = {};      // e.g. { "2026-07": { income, expenses } }
  const categories = {};  // e.g. { Rent: 3600 }

  for (const t of transactions) {
    const month = t.date.slice(0, 7); // "2026-07-15" -> "2026-07"

    if (!months[month]) {
      months[month] = { month: month, income: 0, expenses: 0 };
    }

    if (t.amount >= 0) {
      totalIncome += t.amount;
      months[month].income += t.amount;
    } else {
      const spent = -t.amount; // make it positive
      totalExpenses += spent;
      months[month].expenses += spent;
      categories[t.category] = (categories[t.category] || 0) + spent;
    }
  }

  const monthly = Object.values(months)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      month: m.month,
      income: round(m.income),
      expenses: round(m.expenses),
      net: round(m.income - m.expenses),
    }));

  const spendingByCategory = Object.entries(categories)
    .map(([category, total]) => ({ category: category, total: round(total) }))
    .sort((a, b) => b.total - a.total);

  const netCashFlow = totalIncome - totalExpenses;
  const currentBalance = openingBalance + netCashFlow;

  // Monthly burn = how much cash the business loses per month on average.
  // If the business is making money, burn is 0.
  const averageNet = monthly.length > 0 ? netCashFlow / monthly.length : 0;
  const monthlyBurn = averageNet < 0 ? -averageNet : 0;

  // Runway = how many months until the money runs out at this burn rate.
  // null means "not burning cash", so runway does not apply.
  let runwayMonths = null;
  if (monthlyBurn > 0) {
    runwayMonths = Math.max(0, currentBalance / monthlyBurn);
  }

  return {
    totalIncome: round(totalIncome),
    totalExpenses: round(totalExpenses),
    netCashFlow: round(netCashFlow),
    openingBalance: round(openingBalance),
    currentBalance: round(currentBalance),
    monthlyBurn: round(monthlyBurn),
    runwayMonths: runwayMonths === null ? null : round(runwayMonths),
    monthly: monthly,
    spendingByCategory: spendingByCategory,
  };
}

module.exports = { calculateMetrics };