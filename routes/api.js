const express = require("express");
const fs = require("fs");
const path = require("path");
const { calculateMetrics } = require("../objects/metrics");
const { detectRisks } = require("../objects/risks");
const { parseCsv } = require("../services/parser");
const { getInsights } = require("../objects/insights");

const router = express.Router();

// Moved here from server.js so all API routes live in one place
router.get("/health", (req, res) => {
  res.json({ status: "ok", message: "CashFlow Copilot backend is running" });
});

// GET /api/sample -> returns the demo transactions
router.get("/sample", (req, res) => {
  try {
    const filePath = path.join(__dirname, "..", "data", "sample-transactions.json");
    const fileText = fs.readFileSync(filePath, "utf8");
    const transactions = JSON.parse(fileText);

    res.json({ transactions });
  } catch (error) {
    console.error("Could not load sample data:", error.message);
    res.status(500).json({ error: "Could not load sample data" });
  }
});

// POST /api/analyze -> receives transactions, returns cash-flow metrics
router.post("/analyze", (req, res) => {
  const { openingBalance, csvText } = req.body;
  let transactions = req.body.transactions;
  let warnings = [];
  let skippedCount = 0;

  // If the frontend sent raw CSV text, turn it into transactions first
  if (typeof csvText === "string") {
    const parsed = parseCsv(csvText);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    transactions = parsed.transactions;
    warnings = parsed.warnings;
    skippedCount = parsed.skippedCount;
  }

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({ error: "transactions must be a non-empty array" });
  }

  const allValid = transactions.every(
    (t) => typeof t.date === "string" && typeof t.amount === "number"
  );
  if (!allValid) {
    return res.status(400).json({ error: "each transaction needs a text date and a numeric amount" });
  }

  const metrics = calculateMetrics(transactions, Number(openingBalance) || 0);
  const alerts = detectRisks(transactions, metrics);

  res.json({
    metrics,
    alerts,
    warnings,
    skippedCount,
    transactionCount: transactions.length,
  });
});

// POST /api/insights -> receives metrics + alerts, returns a plain-English summary
router.post("/insights", async (req, res) => {
  const { metrics, alerts } = req.body;

  const numberFields = ["totalIncome", "totalExpenses", "netCashFlow", "currentBalance", "monthlyBurn"];
  const metricsOk =
    metrics &&
    typeof metrics === "object" &&
    numberFields.every((field) => typeof metrics[field] === "number") &&
    Array.isArray(metrics.monthly) &&
    Array.isArray(metrics.spendingByCategory);

  if (!metricsOk || !Array.isArray(alerts)) {
    return res.status(400).json({ error: "send the metrics and alerts returned by /api/analyze" });
  }

  const insights = await getInsights(metrics, alerts); // never throws
  res.json(insights);
});

module.exports = router;