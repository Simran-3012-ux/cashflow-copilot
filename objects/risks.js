// Thresholds in one place, so they are easy to explain and tweak
const DUPLICATE_WINDOW_DAYS = 3;   // same payment within 3 days = suspicious
const SPIKE_RATIO = 1.5;           // spending up more than 50%...
const SPIKE_MIN_INCREASE = 1000;   // ...and by at least this much
const LOW_RUNWAY_MONTHS = 3;       // less than 3 months of cash = risky

function round(number) {
  return Math.round(number * 100) / 100;
}

function daysBetween(dateA, dateB) {
  return Math.abs(new Date(dateA) - new Date(dateB)) / (1000 * 60 * 60 * 24);
}

// Rule 1: the same payment (description + amount) made more than once within a few days
function makeDuplicateAlert(cluster) {
  const first = cluster[0];
  const dates = cluster.map((t) => t.date);
  const times = cluster.length === 2 ? "twice" : cluster.length + " times";
  const when = cluster.length === 2 ? `${dates[0]} and ${dates[1]}` : dates.join(", ");

  return {
    type: "duplicate_payment",
    severity: "high",
    message: `Possible duplicate payment: "${first.description}" of ${-first.amount} appears ${times} (${when}).`,
  };
}

function findDuplicatePayments(transactions) {
  const alerts = [];

  // Group expenses by description + amount
  const groups = {};
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const key = t.description + "|" + t.amount;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  for (const key in groups) {
    const list = groups[key].sort((a, b) => a.date.localeCompare(b.date));

    // Walk through in date order, collecting runs of payments that are close together
    let cluster = [list[0]];
    for (let i = 1; i <= list.length; i++) {
      const next = list[i];
      const isClose =
        next && daysBetween(cluster[cluster.length - 1].date, next.date) <= DUPLICATE_WINDOW_DAYS;

      if (isClose) {
        cluster.push(next);
        continue;
      }
      if (cluster.length >= 2) alerts.push(makeDuplicateAlert(cluster)); // one alert per run
      cluster = next ? [next] : [];
    }
  }

  return alerts;
}

// Rule 2: cash runway is shorter than the safe limit
function findLowRunway(metrics) {
  const alerts = [];

  if (metrics.runwayMonths !== null && metrics.runwayMonths < LOW_RUNWAY_MONTHS) {
    alerts.push({
      type: "low_runway",
      severity: "high",
      message: `Low runway: cash lasts about ${metrics.runwayMonths} months at the current burn of ${metrics.monthlyBurn} per month.`,
    });
  }

  return alerts;
}

// Rule 3: months where more money went out than came in
function findNegativeMonths(metrics) {
  const alerts = [];

  for (const m of metrics.monthly) {
    if (m.net < 0) {
      alerts.push({
        type: "negative_month",
        severity: "medium",
        message: `${m.month} had negative cash flow: ${m.income} in, ${m.expenses} out (net ${m.net}).`,
      });
    }
  }

  return alerts;
}

// True only when `later` is the calendar month right after `earlier` ("2026-08" -> "2026-09")
function areConsecutiveMonths(earlier, later) {
  const [y1, m1] = earlier.split("-").map(Number);
  const [y2, m2] = later.split("-").map(Number);
  return y2 * 12 + m2 - (y1 * 12 + m1) === 1;
}

// Rule 4: a category's spending jumped compared with the previous month
function findCategorySpikes(transactions, metrics) {
  const alerts = [];

  // Build { "2026-09": { Rent: 1200, Payroll: 2800, ... } } for expenses only
  const spendByMonth = {};
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const month = t.date.slice(0, 7);
    const category = t.category || "Uncategorized";
    if (!spendByMonth[month]) spendByMonth[month] = {};
    spendByMonth[month][category] = (spendByMonth[month][category] || 0) - t.amount;
  }

  // Compare each month with the one before it
  const monthly = metrics.monthly;
  for (let i = 1; i < monthly.length; i++) {
    const thisMonth = monthly[i].month;
    const lastMonth = monthly[i - 1].month;
    if (!areConsecutiveMonths(lastMonth, thisMonth)) continue; // a missing month would make the comparison misleading
    const current = spendByMonth[thisMonth] || {};
    const previous = spendByMonth[lastMonth] || {};

    for (const category in current) {
      const now = current[category];
      const before = previous[category] || 0;

      if (now - before >= SPIKE_MIN_INCREASE && now > before * SPIKE_RATIO) {
        alerts.push({
          type: "category_spike",
          severity: "medium",
          message: `${category} spending jumped from ${round(before)} to ${round(now)} in ${thisMonth}.`,
        });
      }
    }
  }

  return alerts;
}

// Runs every rule and returns one combined list, most serious first
function detectRisks(transactions, metrics) {
  const alerts = [
    ...findDuplicatePayments(transactions),
    ...findLowRunway(metrics),
    ...findNegativeMonths(metrics),
    ...findCategorySpikes(transactions, metrics),
  ];

  const order = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  return alerts;
}

module.exports = { detectRisks };