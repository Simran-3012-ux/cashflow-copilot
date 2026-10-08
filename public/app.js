// ---- 1. Grab the elements we need from the page ----
const loadBtn = document.getElementById("load-sample-btn");
const balanceInput = document.getElementById("opening-balance");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const cardsEl = document.getElementById("cards");
const alertsEl = document.getElementById("alerts");
const monthlyChartEl = document.getElementById("monthly-chart");
const categoryEl = document.getElementById("category-breakdown");
const uploadBtn = document.getElementById("upload-btn");
const csvInput = document.getElementById("csv-file");
const warningsEl = document.getElementById("warnings");
const insightsEl = document.getElementById("insights");
let insightsRequestId = 0; // lets us ignore out-of-date responses

// ---- 2. Small helpers ----
function formatNumber(number) {
  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

// ---- 3. Talk to the backend ----
function setBusy(isBusy) {
  loadBtn.disabled = isBusy;
  uploadBtn.disabled = isBusy;
}

// Lists the rows the backend skipped (bad date, bad amount...)
function renderWarnings(warnings, skippedCount) {
  warningsEl.innerHTML = "";

  for (const warning of warnings) {
    const item = document.createElement("li");
    item.textContent = warning;
    warningsEl.appendChild(item);
  }

  if (skippedCount > warnings.length) {
    const more = document.createElement("li");
    more.textContent = "...and " + (skippedCount - warnings.length) + " more.";
    warningsEl.appendChild(more);
  }
}

// Shared by both buttons. getInput() returns what to send:
// either { transactions: [...] } or { csvText: "..." }
async function runAnalysis(getInput) {
  setBusy(true);
  setStatus("Loading and analyzing...");
  renderWarnings([], 0);

  try {
    // Step A: get the input (sample transactions or CSV text)
    const input = await getInput();

    // Step B: send it to the backend for analysis
    const analyzeResponse = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        openingBalance: Number(balanceInput.value) || 0,
      }),
    });

    if (!analyzeResponse.ok) {
      const errorBody = await analyzeResponse.json();
      throw new Error(errorBody.error || "Analysis failed");
    }
    const analysis = await analyzeResponse.json();

    // Step C: draw the results
    renderCards(analysis.metrics);
    renderAlerts(analysis.alerts);
    renderMonthlyChart(analysis.metrics.monthly);
    renderCategoryBreakdown(
      analysis.metrics.spendingByCategory,
      analysis.metrics.totalExpenses
    );
    resultsEl.hidden = false;

    renderWarnings(analysis.warnings || [], analysis.skippedCount || 0);
    let summary = "Analyzed " + analysis.transactionCount + " transactions.";
    if (analysis.skippedCount > 0) {
      summary += " Skipped " + analysis.skippedCount + " bad row(s):";
    }
    setStatus(summary);

    // Not awaited on purpose: the dashboard is already visible,
    // and the insights fill in when they arrive.
    loadInsights(analysis.metrics, analysis.alerts);
  } catch (error) {
    resultsEl.hidden = true; // don't leave stale results next to an error
    setStatus("Something went wrong: " + error.message, true);
  } finally {
    setBusy(false);
  }
}

// Button 1: fetch the demo transactions, then analyze them
function loadSampleData() {
  runAnalysis(async () => {
    const response = await fetch("/api/sample");
    if (!response.ok) {
      throw new Error("Could not load sample data");
    }
    const data = await response.json();
    return { transactions: data.transactions };
  });
}

// Button 2: read the chosen CSV file in the browser, send its text to the backend
function uploadCsv() {
  const file = csvInput.files[0];
  if (!file) {
    setStatus("Please choose a CSV file first.", true);
    return;
  }
  if (file.size > 1000000) {
    setStatus("That file is over 1 MB. Please upload a smaller CSV.", true);
    return;
  }

  runAnalysis(async () => {
    const csvText = await file.text();
    return { csvText: csvText };
  });
}

// ---- 4. Draw the metric cards ----
function renderCards(metrics) {
  const runwayText =
    metrics.runwayMonths === null
      ? "Not burning cash"
      : formatNumber(metrics.runwayMonths) + " months";

  const cards = [
    { label: "Total income", value: formatNumber(metrics.totalIncome) },
    { label: "Total expenses", value: formatNumber(metrics.totalExpenses) },
    {
      label: "Net cash flow",
      value: formatNumber(metrics.netCashFlow),
      tone: metrics.netCashFlow < 0 ? "bad" : "good",
    },
    { label: "Current balance", value: formatNumber(metrics.currentBalance) },
    { label: "Monthly burn", value: formatNumber(metrics.monthlyBurn) },
    {
      label: "Runway",
      value: runwayText,
      tone: metrics.runwayMonths !== null && metrics.runwayMonths < 3 ? "bad" : "good",
    },
  ];

  cardsEl.innerHTML = ""; // clear old cards

  for (const card of cards) {
    const cardEl = document.createElement("div");
    cardEl.className = "card";

    const labelEl = document.createElement("p");
    labelEl.className = "label";
    labelEl.textContent = card.label;

    const valueEl = document.createElement("p");
    valueEl.className = "value" + (card.tone ? " " + card.tone : "");
    valueEl.textContent = card.value;

    cardEl.append(labelEl, valueEl);
    cardsEl.appendChild(cardEl);
  }
}

// ---- 5. Draw the alerts list ----
function renderAlerts(alerts) {
  alertsEl.innerHTML = ""; // clear old alerts

  if (alerts.length === 0) {
    const emptyEl = document.createElement("li");
    emptyEl.className = "no-alerts";
    emptyEl.textContent = "No risks detected. Cash flow looks healthy.";
    alertsEl.appendChild(emptyEl);
    return;
  }

  for (const alert of alerts) {
    const itemEl = document.createElement("li");
    itemEl.className = "alert " + alert.severity;

    const badgeEl = document.createElement("span");
    badgeEl.className = "badge";
    badgeEl.textContent = alert.severity;

    const messageEl = document.createElement("p");
    messageEl.textContent = alert.message;

    itemEl.append(badgeEl, messageEl);
    alertsEl.appendChild(itemEl);
  }
}

// ---- 5b. Helpers and charts (no libraries, just divs and CSS) ----

// Shortcut: create an element, give it a class and some text
function createEl(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// "2026-07" -> "Jul 2026"
function formatMonth(monthKey) {
  const [year, month] = monthKey.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function renderMonthlyChart(monthly) {
  monthlyChartEl.innerHTML = "";

  // The tallest bar in the chart = 100% height; every other bar is scaled to it
  const maxValue = Math.max(1, ...monthly.flatMap((m) => [m.income, m.expenses]));

  for (const m of monthly) {
    const group = createEl("div", "month-group");
    const bars = createEl("div", "bars");

    const incomeBar = createEl("div", "bar income");
    incomeBar.style.height = (m.income / maxValue) * 100 + "%";
    incomeBar.title = "Income: " + formatNumber(m.income);

    const expenseBar = createEl("div", "bar expenses");
    expenseBar.style.height = (m.expenses / maxValue) * 100 + "%";
    expenseBar.title = "Expenses: " + formatNumber(m.expenses);

    bars.append(incomeBar, expenseBar);

    group.append(
      bars,
      createEl("p", "month-label", formatMonth(m.month)),
      createEl("p", "month-values", "In " + formatNumber(m.income)),
      createEl("p", "month-values", "Out " + formatNumber(m.expenses)),
      createEl("p", "month-values " + (m.net < 0 ? "bad" : "good"), "Net " + formatNumber(m.net))
    );

    monthlyChartEl.appendChild(group);
  }
}

function renderCategoryBreakdown(categories, totalExpenses) {
  categoryEl.innerHTML = "";

  if (categories.length === 0 || totalExpenses <= 0) {
    categoryEl.appendChild(createEl("p", "cat-name", "No expenses recorded."));
    return;
  }

  for (const c of categories) {
    const percent = (c.total / totalExpenses) * 100;

    const row = createEl("div", "cat-row");
    const track = createEl("div", "cat-track");
    const fill = createEl("div", "cat-fill");
    fill.style.width = percent + "%";
    track.appendChild(fill);

    row.append(
      createEl("p", "cat-name", c.category),
      track,
      createEl("p", "cat-amount", formatNumber(c.total) + " (" + Math.round(percent) + "%)")
    );

    categoryEl.appendChild(row);
  }
}

// ---- 5c. Insights ----
async function loadInsights(metrics, alerts) {
  const requestId = ++insightsRequestId;
  insightsEl.innerHTML = "";
  insightsEl.appendChild(createEl("p", "insights-loading", "Thinking..."));

  try {
    const response = await fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metrics: metrics, alerts: alerts }),
    });
    if (!response.ok) {
      throw new Error("Insights request failed");
    }
    const data = await response.json();

    if (requestId !== insightsRequestId) return; // a newer analysis has started
    renderInsights(data);
  } catch (error) {
    if (requestId !== insightsRequestId) return;
    insightsEl.innerHTML = "";
    insightsEl.appendChild(
      createEl("p", "insights-loading", "Insights are unavailable right now. The numbers above are still correct.")
    );
  }
}

function renderInsights(data) {
  insightsEl.innerHTML = "";
  insightsEl.appendChild(createEl("p", "insights-summary", data.summary));

  const list = createEl("ul", "insights-list");
  for (const suggestion of data.suggestions) {
    list.appendChild(createEl("li", "", suggestion));
  }
  insightsEl.appendChild(list);

  const sourceText =
    data.source === "ai"
      ? "Written by Claude from the numbers above (no raw transactions were sent)."
      : "Rule-based summary (" + (data.note || "AI unavailable") + ").";
  insightsEl.appendChild(createEl("p", "insights-source", sourceText));
}

// ---- 6. Wire the button ----
loadBtn.addEventListener("click", loadSampleData);
uploadBtn.addEventListener("click", uploadCsv);