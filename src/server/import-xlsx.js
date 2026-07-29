const ExcelJS = require("exceljs");

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const TRANSACTION_ALIASES = {
  "CAR MAINTENCE AND REPAIR": ["Transportation", "Maintenance/Repair"],
  "CAR MAINTENANCE AND REPAIR": ["Transportation", "Maintenance/Repair"],
  "CAR PAYMENT": ["Transportation", "Vehicle Payment"],
  "CAR PAYMENTS": ["Transportation", "Vehicle Payment"],
  "DINING OUT": ["Food", "Dining Out"],
  ENTERTAINMENT: ["Entertainment/Subscriptions", "Entertainment"],
  GAS: ["Transportation", "Fuel"],
  "GOING OUT ENTERTAINMENT": ["Entertainment/Subscriptions", "Going Out"],
  GROCERIES: ["Food", "Groceries"],
  "HOUSE CARE OTHER": ["Personal/Home Care", "Home Care"],
  KODA: ["Koda/Peaches", "Pet Expenses"],
  "KODA PEACHES": ["Koda/Peaches", "Pet Expenses"],
  "LIFE INSURANCE": ["Insurance", "Life Insurance"],
  "PERSONAL HOUSE CARE OTHER": ["Personal/Home Care", "Home Care"],
  "PET INSURANCE": ["Koda/Peaches", "Pet Insurance"],
  SAVINGS: ["Savings/Investments", "Savings"],
  SUBSCRIPTIONS: ["Entertainment/Subscriptions", "Subscriptions"],
  TRAVEL: ["Travel", "Activities"],
  TRAVELLING: ["Travel", "Activities"],
};

function cellValue(cell) {
  const value = cell.value;
  if (value && typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "result")) return value.result;
    if (Object.prototype.hasOwnProperty.call(value, "text")) return value.text;
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join("");
  }
  return value;
}

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/&/g, " AND ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

function numericValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[$,]/g, "");
  if (!normalized || normalized === "-") return null;
  const negative = normalized.startsWith("(") && normalized.endsWith(")");
  const parsed = Number(normalized.replace(/[()]/g, ""));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
}

function parseLooseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && value > 20000 && value < 80000) {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  if (typeof value !== "string") return null;

  const corrected = value
    .trim()
    .replace(/Janaury/gi, "January")
    .replace(/Feburary|Febuary/gi, "February")
    .replace(/Apirl/gi, "April")
    .replace(/\bJuy\b/gi, "July")
    .replace(/Septemeber/gi, "September")
    .replace(/(\d+)(st|nd|rd|th)/gi, "$1");
  const timestamp = Date.parse(corrected);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function dateParts(date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function formatDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseSheetIdentity(sheet) {
  const match = sheet.name.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s*\((\d{2,4})\))?$/i);
  if (!match) return null;

  const month = MONTHS[match[1].toLowerCase()];
  if (match[2]) {
    const parsedYear = Number(match[2]);
    return { month, year: parsedYear < 100 ? 2000 + parsedYear : parsedYear };
  }

  const yearCounts = new Map();
  sheet.eachRow(row => row.eachCell(cell => {
    const parsed = parseLooseDate(cellValue(cell));
    if (!parsed) return;
    const parts = dateParts(parsed);
    if (parts.year >= 2000 && parts.year <= 2100 && parts.month === month) {
      yearCounts.set(parts.year, (yearCounts.get(parts.year) || 0) + 1);
    }
  }));
  const mostCommonYear = [...yearCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  return mostCommonYear ? { month, year: mostCommonYear } : null;
}

function resolveInsurance(location) {
  const key = normalizeKey(location);
  if (/\b(CAR|AUTO|VEHICLE)\b/.test(key)) return ["Insurance", "Car Insurance"];
  if (/\bLIFE\b/.test(key)) return ["Insurance", "Life Insurance"];
  return ["Insurance", "Home Insurance"];
}

function resolveTransaction(title, location) {
  const key = normalizeKey(title);
  if (key === "INSURANCE") return resolveInsurance(location);
  return TRANSACTION_ALIASES[key] || null;
}

function resolveBudget(sectionValue, lineValue) {
  const section = normalizeKey(sectionValue);
  const line = normalizeKey(lineValue);

  if (section === "HOUSING") {
    const names = {
      MORTGAGE: "Mortgage",
      "PROPERTY TAX": "Property Tax",
      "ADDITIONAL MORTGAGE PAYMENT": "Additional Mortgage Payment",
      GAS: "Gas",
      HYDRO: "Hydro/Energy",
      "HYDRO ENERGY": "Hydro/Energy",
      WATER: "Water",
      INTERNET: "Internet",
    };
    return names[line] ? ["Housing", names[line]] : null;
  }
  if (section === "TRANSPORTATION") {
    const names = {
      "VEHICLE PAYMENT": "Vehicle Payment",
      FUEL: "Fuel",
      "MAINTENANCE REPAIR": "Maintenance/Repair",
    };
    return names[line] ? ["Transportation", names[line]] : null;
  }
  if (section === "INSURANCE") {
    const names = { HOME: "Home Insurance", CAR: "Car Insurance", LIFE: "Life Insurance" };
    return names[line] ? ["Insurance", names[line]] : null;
  }
  if (section === "ENTERTAINMENT SUBSCRIPTIONS") {
    const names = { SUBSCRIPTIONS: "Subscriptions", "GOING OUT": "Going Out" };
    return names[line] ? ["Entertainment/Subscriptions", names[line]] : null;
  }
  if (section === "FOOD") {
    const names = { GROCERIES: "Groceries", "DINING OUT": "Dining Out" };
    return names[line] ? ["Food", names[line]] : null;
  }
  if (section === "KODA" || section === "KODA PEACHES") {
    const names = {
      FOOD: "Pet Food",
      MEDICAL: "Pet Expenses",
      GROOMING: "Pet Grooming",
      TOYS: "Pet Expenses",
      EVERYTHING: "Pet Expenses",
      "PET INSURACNE": "Pet Insurance",
      "PET INSURANCE": "Pet Insurance",
    };
    return names[line] ? ["Koda/Peaches", names[line]] : null;
  }
  if (section === "PERSONAL HOME CARE") {
    const names = {
      MEDICAL: "Medical/Health",
      HAIR: "Hair/Grooming",
      CLOTHING: "Clothing",
      "HOUSE FUND": "Home Care",
      "HOUSE SUPPLIES": "Home Care",
    };
    return names[line] ? ["Personal/Home Care", names[line]] : null;
  }
  if (section === "SAVINGS OR INVESTMENTS" && line === "SAVINGS") {
    return ["Savings/Investments", "Savings"];
  }
  if (section === "TRAVEL" && (line === "TRAVEL" || line === "EVERYTHING")) {
    return ["Travel", "Activities"];
  }
  return null;
}

function mappingKey(category, subcategory) {
  return `${normalizeKey(category)}|${normalizeKey(subcategory)}`;
}

function transactionKey(transaction) {
  return [
    transaction.transaction_date,
    transaction.amount.toFixed(2),
    normalizeKey(transaction.category),
    normalizeKey(transaction.subcategory),
    normalizeKey(transaction.location),
    normalizeKey(transaction.paid_by),
  ].join("|");
}

function parseTransactionDate(value, identity, sheet, cellAddress, warnings) {
  const parsed = parseLooseDate(value);
  if (!parsed) {
    const label = normalizeText(value) || "unrecognized date";
    const day = /CHRISTMAS|CHIRSTMAS/i.test(label)
      ? 25
      : new Date(Date.UTC(identity.year, identity.month, 0)).getUTCDate();
    const fallback = formatDate(identity.year, identity.month, day);
    warnings.push({ sheet: sheet.name, cell: cellAddress, message: `Used ${fallback} for date label: ${label}` });
    return fallback;
  }

  const parts = dateParts(parsed);
  if (parts.month === identity.month && parts.year !== identity.year) {
    warnings.push({ sheet: sheet.name, cell: cellAddress, message: `Adjusted transaction year from ${parts.year} to ${identity.year} to match its sheet.` });
    return formatDate(identity.year, parts.month, parts.day);
  }
  if (parts.year < 2000 || parts.year > 2100) {
    const fallback = formatDate(identity.year, identity.month, new Date(Date.UTC(identity.year, identity.month, 0)).getUTCDate());
    warnings.push({ sheet: sheet.name, cell: cellAddress, message: `Used ${fallback} for out-of-range year: ${parts.year}` });
    return fallback;
  }
  if (parts.month !== identity.month) {
    warnings.push({ sheet: sheet.name, cell: cellAddress, message: `Transaction date falls outside its sheet month: ${formatDate(parts.year, parts.month, parts.day)}` });
  }
  return formatDate(parts.year, parts.month, parts.day);
}

function parseDetailedTransactions(sheet, identity, warnings) {
  const transactions = [];
  const detailedMappings = new Set();

  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    for (let column = 1; column <= sheet.columnCount - 3; column += 1) {
      const labels = [0, 1, 2, 3].map(offset => normalizeKey(cellValue(row.getCell(column + offset))));
      if (labels.join("|") !== "DATE|PRICE|LOCATION|PAID BY") continue;

      const title = normalizeText(cellValue(sheet.getRow(rowNumber - 1).getCell(column)));
      let recognizedRows = 0;
      for (let dataRow = rowNumber + 1; dataRow <= sheet.rowCount; dataRow += 1) {
        const dateCell = sheet.getRow(dataRow).getCell(column);
        const firstValue = cellValue(dateCell);
        if (normalizeKey(firstValue) === "TOTAL") break;

        const amount = numericValue(cellValue(sheet.getRow(dataRow).getCell(column + 1)));
        if (firstValue === null || firstValue === undefined || firstValue === "" || amount === null || amount === 0) continue;
        const location = normalizeText(cellValue(sheet.getRow(dataRow).getCell(column + 2))) || title;
        const mapping = resolveTransaction(title, location);
        if (!mapping) continue;

        const transactionDate = parseTransactionDate(firstValue, identity, sheet, dateCell.address, warnings);
        if (!transactionDate) continue;
        const [category, subcategory] = mapping;
        transactions.push({
          source_sheet: sheet.name,
          category,
          subcategory,
          transaction_date: transactionDate,
          amount,
          location,
          paid_by: normalizeText(cellValue(sheet.getRow(dataRow).getCell(column + 3))) || null,
          notes: null,
          generated: false,
        });
        detailedMappings.add(mappingKey(category, subcategory));
        recognizedRows += 1;
      }

      if (recognizedRows === 0 && !resolveTransaction(title, "")) {
        warnings.push({ sheet: sheet.name, cell: sheet.getRow(rowNumber - 1).getCell(column).address, message: `Unrecognized transaction table: ${title || "blank title"}` });
      }
    }
  }
  return { transactions, detailedMappings };
}

function parseBudgetRows(sheet, identity, detailedMappings, warnings) {
  const budgets = [];
  const actuals = [];

  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    for (let projectedColumn = 2; projectedColumn <= Math.min(sheet.columnCount - 1, 5); projectedColumn += 1) {
      if (normalizeKey(cellValue(row.getCell(projectedColumn))) !== "PROJECTED COST") continue;
      if (normalizeKey(cellValue(row.getCell(projectedColumn + 1))) !== "ACTUAL COST") continue;

      const nameColumn = projectedColumn - 1;
      const section = normalizeText(cellValue(row.getCell(nameColumn)));
      for (let dataRow = rowNumber + 1; dataRow <= sheet.rowCount; dataRow += 1) {
        const nameCell = sheet.getRow(dataRow).getCell(nameColumn);
        const line = normalizeText(cellValue(nameCell));
        if (!line) continue;
        if (normalizeKey(line) === "TOTAL") break;

        const mapping = resolveBudget(section, line);
        if (!mapping) {
          warnings.push({ sheet: sheet.name, cell: nameCell.address, message: `Unrecognized budget line: ${section} / ${line}` });
          continue;
        }
        const [category, subcategory] = mapping;
        const projectedAmount = numericValue(cellValue(sheet.getRow(dataRow).getCell(projectedColumn)));
        const actualAmount = numericValue(cellValue(sheet.getRow(dataRow).getCell(projectedColumn + 1)));
        if (projectedAmount !== null) {
          budgets.push({ source_sheet: sheet.name, year: identity.year, month: identity.month, category, subcategory, projected_amount: projectedAmount });
        }
        if (actualAmount !== null && actualAmount !== 0) {
          actuals.push({ source_sheet: sheet.name, category, subcategory, amount: actualAmount, line });
        }
      }
    }
  }

  const groupedActuals = new Map();
  for (const actual of actuals) {
    const key = mappingKey(actual.category, actual.subcategory);
    const current = groupedActuals.get(key) || { ...actual, amount: 0 };
    current.amount += actual.amount;
    groupedActuals.set(key, current);
  }

  const generatedTransactions = [];
  const lastDay = new Date(Date.UTC(identity.year, identity.month, 0)).getUTCDate();
  for (const [key, actual] of groupedActuals) {
    if (detailedMappings.has(key)) continue;
    generatedTransactions.push({
      source_sheet: sheet.name,
      category: actual.category,
      subcategory: actual.subcategory,
      transaction_date: formatDate(identity.year, identity.month, lastDay),
      amount: actual.amount,
      location: actual.line,
      paid_by: null,
      notes: `Imported monthly expense from ${sheet.name}`,
      generated: true,
    });
  }

  return { budgets, generatedTransactions };
}

function consolidateBudgets(budgets) {
  const grouped = new Map();
  for (const budget of budgets) {
    const key = [budget.year, budget.month, mappingKey(budget.category, budget.subcategory)].join("|");
    const current = grouped.get(key) || { ...budget, projected_amount: 0 };
    current.projected_amount += budget.projected_amount;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((left, right) => left.year - right.year || left.month - right.month || left.category.localeCompare(right.category) || left.subcategory.localeCompare(right.subcategory));
}

function deduplicateTransactions(transactions, warnings) {
  const unique = new Map();
  let duplicateCount = 0;
  for (const transaction of transactions) {
    const key = transactionKey(transaction);
    if (unique.has(key)) {
      duplicateCount += 1;
      continue;
    }
    unique.set(key, transaction);
  }
  if (duplicateCount > 0) {
    warnings.push({ sheet: "Workbook", cell: null, message: `Removed ${duplicateCount} exact duplicate transaction row${duplicateCount === 1 ? "" : "s"} from the workbook.` });
  }
  return [...unique.values()].sort((left, right) => left.transaction_date.localeCompare(right.transaction_date));
}

function deduplicateWarnings(warnings) {
  const unique = new Map();
  for (const warning of warnings) {
    unique.set(`${warning.sheet}|${warning.cell || ""}|${warning.message}`, warning);
  }
  return [...unique.values()];
}

async function parseBudgetWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const warnings = [];
  const budgets = [];
  const transactions = [];
  const sheets = [];

  for (const sheet of workbook.worksheets) {
    const identity = parseSheetIdentity(sheet);
    if (!identity) continue;

    const detailed = parseDetailedTransactions(sheet, identity, warnings);
    const budgetData = parseBudgetRows(sheet, identity, detailed.detailedMappings, warnings);
    const sheetTransactions = [...detailed.transactions, ...budgetData.generatedTransactions];
    budgets.push(...budgetData.budgets);
    transactions.push(...sheetTransactions);
    sheets.push({
      name: sheet.name,
      year: identity.year,
      month: identity.month,
      budget_lines: budgetData.budgets.length,
      transactions: sheetTransactions.length,
      generated_transactions: budgetData.generatedTransactions.length,
    });
  }

  if (sheets.length === 0) {
    throw new Error("No monthly budget sheets were found in this workbook.");
  }

  const uniqueTransactions = deduplicateTransactions(transactions, warnings);
  const uniqueWarnings = deduplicateWarnings(warnings);
  return {
    sheets: sheets.sort((left, right) => left.year - right.year || left.month - right.month),
    budgets: consolidateBudgets(budgets),
    transactions: uniqueTransactions,
    warnings: uniqueWarnings,
  };
}

module.exports = {
  parseBudgetWorkbook,
  normalizeKey,
  resolveBudget,
  resolveTransaction,
};