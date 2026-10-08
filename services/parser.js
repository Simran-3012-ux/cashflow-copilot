const MAX_WARNINGS = 10; // don't flood the response if a file is very messy

// Step 1: split raw CSV text into rows of fields.
// Handles quoted fields like "Office order, 20 people" and Windows line endings.
function splitCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'; // "" inside quotes means one literal quote
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++; // treat \r\n as one line break
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // The last line may not end with a line break
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function isBlankRow(row) {
  return row.every((field) => field.trim() === "");
}

// "2026-09-15" is valid. "2026-02-31" and "15/09/2026" are not.
function isValidDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(text + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

// "1,200.50", "-$300", "(450)" -> numbers. Anything unreadable -> null.
function parseAmount(raw) {
  let text = String(raw).trim();
  if (text === "") return null;

  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true; // accountants write (450) for -450
    text = text.slice(1, -1);
  }

  text = text.replace(/[^0-9.\-]/g, ""); // drop currency symbols, commas, spaces
  const number = Number(text);
  if (text === "" || Number.isNaN(number)) return null;

  return negative ? -Math.abs(number) : number;
}

// Step 2: turn CSV text into clean transactions.
// Returns { transactions, warnings, skippedCount, error }
function parseCsv(csvText) {
  const rows = splitCsv(csvText.replace(/^\uFEFF/, "")); // remove Excel's invisible BOM
  const transactions = [];
  const allWarnings = [];

  const headerIndex = rows.findIndex((row) => !isBlankRow(row));
  if (headerIndex === -1) {
    return { transactions, warnings: [], skippedCount: 0, error: "The CSV file is empty." };
  }

  const headers = rows[headerIndex].map((h) => h.trim().toLowerCase());
  const dateCol = headers.indexOf("date");
  const amountCol = headers.indexOf("amount");
  const descriptionCol = headers.indexOf("description");
  const categoryCol = headers.indexOf("category");

  if (dateCol === -1 || amountCol === -1) {
    return {
      transactions,
      warnings: [],
      skippedCount: 0,
      error: `The first row must include "date" and "amount" columns. Found: ${headers.join(", ")}`,
    };
  }

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (isBlankRow(row)) continue;

    const rowNumber = i + 1; // matches the row number you see in Excel

    // More cells than headers usually means an unquoted amount like 1,200 got split in two.
    // Skip the row instead of silently reading the wrong number.
    if (row.slice(headers.length).some((cell) => cell.trim() !== "")) {
      allWarnings.push(
        `Row ${rowNumber}: has more columns than the header. Put amounts that contain commas in quotes, like "1,200".`
      );
      continue;
    }
    const date = (row[dateCol] || "").trim();
    const rawAmount = row[amountCol] || "";
    const amount = parseAmount(rawAmount);

    if (!isValidDate(date)) {
      allWarnings.push(`Row ${rowNumber}: invalid date "${date}" (use YYYY-MM-DD)`);
      continue;
    }
    if (amount === null) {
      allWarnings.push(`Row ${rowNumber}: invalid amount "${rawAmount.trim()}"`);
      continue;
    }

    transactions.push({
      date: date,
      description: (descriptionCol === -1 ? "" : (row[descriptionCol] || "").trim()) || "(no description)",
      category: (categoryCol === -1 ? "" : (row[categoryCol] || "").trim()) || "Uncategorized",
      amount: amount,
    });
  }

  if (transactions.length === 0) {
    const reason = allWarnings.length > 0 ? " First problem: " + allWarnings[0] : "";
    return {
      transactions,
      warnings: [],
      skippedCount: allWarnings.length,
      error: "No valid transactions found." + reason,
    };
  }

  return {
    transactions,
    warnings: allWarnings.slice(0, MAX_WARNINGS),
    skippedCount: allWarnings.length,
    error: null,
  };
}

module.exports = { parseCsv };