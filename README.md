# CashFlow Copilot

Small businesses rarely fail from a lack of profit. They fail from cash surprises.
CashFlow Copilot takes a list of transactions, works out the key cash-flow numbers, flags simple risks early, and explains the result in plain English.

## What it does

- Loads demo data in one click, or analyzes your own **CSV** upload
- Calculates total income, total expenses, net cash flow, current balance, **monthly burn** and **runway**
- Detects four kinds of risk with transparent rules (no black box):
  duplicate payments, low runway, negative-cash-flow months, and category spending spikes
- Shows a dashboard: metric cards, severity-coloured alerts, a monthly income-vs-expenses chart and a spending breakdown
- Writes a plain-English summary with suggested actions, using Claude when an API key is set and a rule-based fallback otherwise

## Tech stack

Vanilla HTML, CSS and JavaScript on the frontend. Node.js and Express on the backend. No frontend framework, no database, no chart library.

## Run it

Requires **Node.js 20 or newer**.

```bash
npm install
npm run dev
```

Open http://localhost:3000 and click **Load sample data**.

### Optional: AI-written insights

1. Copy `.env.example` to `.env`.
2. Put your key in `ANTHROPIC_API_KEY=` (create one in the Claude Console).
3. Restart the server. `.env` is only read at startup.

Without a key the app still works. The Insights card then says it is a rule-based summary. If the AI call fails for any reason (bad key, no network, timeout), the app falls back automatically and tells you so.

## How it works

```
Browser (public/)                    Express server
┌───────────────────────┐            ┌────────────────────────────────┐
│ Load sample / upload  │  POST      │ routes/api.js     traffic only │
│ CSV (read in browser) │ ────────►  │ services/parser   CSV -> rows  │
│                       │  JSON      │ objects/metrics   the maths    │
│ draw cards, alerts,   │ ◄────────  │ objects/risks     the rules    │
│ charts, insights      │            │ objects/insights  AI/fallback  │
└───────────────────────┘            └────────────────────────────────┘
```

The frontend only collects data and draws results. All calculations live on the server.

### Folder structure

```
cashflow-copilot/
├── server.js                  starts Express, serves public/, mounts the API
├── routes/api.js              the four endpoints
├── services/parser.js         CSV text -> clean transactions (skips bad rows with a reason)
├── objects/metrics.js         income, expenses, burn, runway, monthly totals, categories
├── objects/risks.js           risk rules -> list of alerts
├── objects/insights.js        Claude call + rule-based fallback
├── data/sample-transactions.json   demo cafe data with planted problems
├── data/demo-messy.csv        a deliberately messy CSV for demoing error handling
└── public/                    index.html, style.css, app.js, sample.csv
```

### API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Is the server alive? |
| `GET /api/sample` | Returns the demo transactions |
| `POST /api/analyze` | Body: `{ transactions }` **or** `{ csvText }`, plus `openingBalance`. Returns `metrics`, `alerts`, `transactionCount`, `skippedCount`, `warnings` |
| `POST /api/insights` | Body: `{ metrics, alerts }`. Returns `summary`, `suggestions`, `source` (`ai` or `fallback`), `note` |

Analysis and insights are separate calls on purpose: the dashboard appears instantly, and the slower, fallible AI call fills in afterwards.

### Definitions

- **Net cash flow** = total income - total expenses
- **Monthly burn** = average monthly net loss (0 if the business is profitable)
- **Runway** = current balance / monthly burn, in months (not shown when burn is 0)

### Risk rules

| Rule | Fires when | Severity |
|---|---|---|
| Duplicate payment | Same description and amount paid more than once within 3 days | High |
| Low runway | Runway under 3 months | High |
| Negative month | A month's expenses exceed its income | Medium |
| Category spike | A category rose by more than 50% **and** at least 1000 vs the previous calendar month | Medium |

Thresholds are constants at the top of `objects/risks.js`.

## CSV format

First row is a header. `date` and `amount` are required; `description` and `category` are optional.

```
date,description,category,amount
2026-09-12,Espresso machine repair,Maintenance,-2400
```

- Dates must be `YYYY-MM-DD`
- Negative amounts are money out, positive are money in
- Amounts may include currency symbols, and `(180)` means -180
- Amounts that contain commas must be quoted: `"1,200"`
- Bad rows are skipped and reported; the rest are still analyzed

## Privacy and security

- Raw transactions are never sent to the AI. Only totals, monthly figures, the top categories and the alert messages are.
- Alert messages can contain transaction descriptions, so the AI prompt tells the model to treat the data as data, not instructions.
- The API key stays on the server in `.env`, which is git-ignored.
- All user-provided text is inserted into the page with `textContent`, so a malicious CSV cannot inject HTML or scripts.

## Known limitations

- Monthly burn is averaged over the months that appear in the data, so a missing month is not counted as a zero month
- Dates must be `YYYY-MM-DD`; `DD/MM/YYYY` is rejected rather than guessed, because day/month order is ambiguous
- Amounts assume `.` as the decimal point
- Rules are simple thresholds, not forecasts. They flag things worth checking; they do not predict
- No login or database: nothing is stored between requests
- CSV uploads are limited to about 1 MB and 5,000 rows

## Ideas for next steps

Forecast the next three months, flag unusual single transactions per category, support `DD/MM/YYYY`, connect to bank feeds, and export an alerts report.
