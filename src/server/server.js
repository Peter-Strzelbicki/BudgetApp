require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { Pool } = require("pg");
const { parseBudgetWorkbook } = require("./import-xlsx");
const { commitBudgetImport, findUnmatchedPayers } = require("./import-xlsx-db");

const app = express();

app.use(cors());
app.use(express.json());

const IMPORT_TTL_MS = 30 * 60 * 1000;
const pendingImports = new Map();
const workbookUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 10 * 1024 * 1024 },
});

function uploadWorkbook(req, res, next) {
  workbookUpload.single("file")(req, res, error => {
    if (!error) return next();
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ error: error.code === "LIMIT_FILE_SIZE" ? "Workbook must be 10 MB or smaller" : error.message });
  });
}

function cleanupPendingImports() {
  const now = Date.now();
  for (const [importId, pending] of pendingImports) {
    if (pending.expiresAt <= now) pendingImports.delete(importId);
  }
  while (pendingImports.size > 10) {
    pendingImports.delete(pendingImports.keys().next().value);
  }
}

const dbType = process.env.DB_TYPE || "postgres";
let pool;
let mssql;

if (dbType === "postgres") {
  pool = new Pool({
    connectionString: process.env.DB_CONNECTION_STRING,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT || 30000),
  });
} else {
  mssql = require("mssql");
  const connectionString = process.env.DB_CONNECTION_STRING || process.env.SQLSERVER_CONNECTION_STRING;
  const databaseName = process.env.DB_NAME || "HomeBudget";

  const poolConfig = connectionString
    ? {
        connectionString: connectionString.includes("Initial Catalog=")
          ? connectionString
          : `${connectionString};Initial Catalog=${databaseName}`,
        options: {
          encrypt: false,
          trustServerCertificate: true,
          enableArithAbort: true,
        },
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000,
        },
      }
    : {
        server: process.env.DB_SERVER || process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT || 1433),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: databaseName,
        options: {
          encrypt: false,
          trustServerCertificate: true,
          enableArithAbort: true,
        },
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000,
        },
      };

  pool = new mssql.ConnectionPool(poolConfig);
}

let dbConnected = false;

async function getDb() {
  if (dbType === "postgres") {
    return pool;
  }

  if (!dbConnected) {
    await pool.connect();
    dbConnected = true;
  }

  return pool;
}

function buildQuery(sqlText, params = {}) {
  const values = [];
  const paramIndex = {};

  const text = sqlText.replace(/@([a-zA-Z0-9_]+)/g, (_, name) => {
    if (!(name in params)) {
      throw new Error(`Missing SQL parameter: ${name}`);
    }

    if (!(name in paramIndex)) {
      values.push(params[name]);
      paramIndex[name] = values.length;
    }

    return `$${paramIndex[name]}`;
  });

  return { text, values };
}

async function query(sqlText, params = {}) {
  const db = await getDb();

  if (dbType === "postgres") {
    const { text, values } = buildQuery(sqlText, params);
    const result = await db.query(text, values);
    return result.rows;
  }

  const request = db.request();
  Object.entries(params).forEach(([name, value]) => {
    request.input(name, value);
  });

  const result = await request.query(sqlText);
  return result.recordset;
}

app.get("/", (req, res) => {
  res.send("Budget API running");
});

app.get("/test-db", async (req, res) => {
  try {
    const queryText = dbType === "postgres" ? "SELECT NOW() AS time" : "SELECT GETDATE() AS time";
    const rows = await query(queryText);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Database error" });
  }
});

app.get("/transactions", async (req, res) => {
  try {
    const { month, year } = req.query;
    const params = {};
    let queryText;

    if (dbType === "postgres") {
      queryText = `
        SELECT t.transaction_id, t.transaction_date, t.amount, t.location, t.notes,
               sc.name AS subcategory, c.name AS category, p.name AS paid_by
        FROM public.transactions t
        JOIN public.subcategories sc ON sc.subcategory_id = t.subcategory_id
        JOIN public.categories c ON c.category_id = sc.category_id
        LEFT JOIN public.people p ON p.person_id = t.paid_by_person_id
      `;

      if (month && year) {
        queryText += " WHERE EXTRACT(MONTH FROM t.transaction_date) = @month AND EXTRACT(YEAR FROM t.transaction_date) = @year";
        params.month = Number(month);
        params.year = Number(year);
      }
    } else {
      queryText = `
        SELECT t.transaction_id, t.transaction_date, t.amount, t.location, t.notes,
               sc.name AS subcategory, c.name AS category, p.name AS paid_by
        FROM dbo.transactions t
        JOIN dbo.subcategories sc ON sc.subcategory_id = t.subcategory_id
        JOIN dbo.categories c ON c.category_id = sc.category_id
        LEFT JOIN dbo.people p ON p.person_id = t.paid_by_person_id
      `;

      if (month && year) {
        queryText += " WHERE MONTH(t.transaction_date) = @month AND YEAR(t.transaction_date) = @year";
        params.month = Number(month);
        params.year = Number(year);
      }
    }

    queryText += " ORDER BY t.transaction_date DESC";
    const rows = await query(queryText, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

app.post("/transactions", async (req, res) => {
  try {
    const { subcategory_id, transaction_date, amount, location, paid_by_person_id, notes } = req.body;

    if (!subcategory_id || !transaction_date || !amount) {
      return res.status(400).json({ error: "subcategory_id, transaction_date, and amount are required" });
    }

    if (dbType === "postgres") {
      const rows = await query(
        `
          INSERT INTO public.transactions (subcategory_id, transaction_date, amount, location, paid_by_person_id, notes)
          VALUES (@subcategory_id, @transaction_date, @amount, @location, @paid_by_person_id, @notes)
          RETURNING transaction_id`,
        {
          subcategory_id: Number(subcategory_id),
          transaction_date,
          amount: Number(amount),
          location: location || null,
          paid_by_person_id: paid_by_person_id ? Number(paid_by_person_id) : null,
          notes: notes || null,
        }
      );

      return res.status(201).json({ transaction_id: rows[0].transaction_id });
    }

    const db = await getDb();
    const request = db.request();
    request.input("subcategory_id", mssql.Int, Number(subcategory_id));
    request.input("transaction_date", mssql.Date, transaction_date);
    request.input("amount", mssql.Decimal(10, 2), Number(amount));
    request.input("location", mssql.NVarChar(100), location || null);
    request.input("paid_by_person_id", mssql.Int, paid_by_person_id ? Number(paid_by_person_id) : null);
    request.input("notes", mssql.NVarChar(255), notes || null);

    const result = await request.query(`
      INSERT INTO dbo.transactions (subcategory_id, transaction_date, amount, location, paid_by_person_id, notes)
      OUTPUT INSERTED.transaction_id AS transaction_id
      VALUES (@subcategory_id, @transaction_date, @amount, @location, @paid_by_person_id, @notes)
    `);

    return res.status(201).json({ transaction_id: result.recordset[0].transaction_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add transaction" });
  }
});

app.delete("/transactions/:transactionId", async (req, res) => {
  try {
    const transactionId = Number(req.params.transactionId);
    if (!Number.isInteger(transactionId)) {
      return res.status(400).json({ error: "A valid transaction ID is required" });
    }

    const queryText = dbType === "postgres"
      ? `DELETE FROM public.transactions
         WHERE transaction_id = @transaction_id
         RETURNING transaction_id`
      : `DELETE FROM dbo.transactions
         OUTPUT DELETED.transaction_id AS transaction_id
         WHERE transaction_id = @transaction_id`;
    const rows = await query(queryText, { transaction_id: transactionId });

    if (rows.length === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json({ transaction_id: rows[0].transaction_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete transaction" });
  }
});

app.get("/summary/monthly", async (req, res) => {
  try {
    const { year } = req.query;
    if (!year) {
      return res.status(400).json({ error: "year is required" });
    }

    const queryText = dbType === "postgres"
      ? `SELECT EXTRACT(MONTH FROM transaction_date) AS month, SUM(amount) AS total
         FROM public.transactions
         WHERE EXTRACT(YEAR FROM transaction_date) = @year
         GROUP BY EXTRACT(MONTH FROM transaction_date)
         ORDER BY month`
      : `SELECT MONTH(transaction_date) AS month, SUM(amount) AS total
         FROM dbo.transactions
         WHERE YEAR(transaction_date) = @year
         GROUP BY MONTH(transaction_date)
         ORDER BY month`;

    const rows = await query(queryText, { year: Number(year) });
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch monthly summary" });
  }
});

app.get("/summary/categories", async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: "month and year are required" });
    }

    const queryText = dbType === "postgres"
      ? `SELECT c.category_id, c.name AS category, COALESCE(SUM(t.amount), 0) AS total
         FROM public.categories c
         LEFT JOIN public.subcategories sc ON sc.category_id = c.category_id
         LEFT JOIN public.transactions t
           ON t.subcategory_id = sc.subcategory_id
          AND EXTRACT(MONTH FROM t.transaction_date) = @month
          AND EXTRACT(YEAR FROM t.transaction_date) = @year
         GROUP BY c.category_id, c.name, c.display_order
         ORDER BY total DESC, c.display_order`
      : `SELECT c.category_id, c.name AS category, COALESCE(SUM(t.amount), 0) AS total
         FROM dbo.categories c
         LEFT JOIN dbo.subcategories sc ON sc.category_id = c.category_id
         LEFT JOIN dbo.transactions t
           ON t.subcategory_id = sc.subcategory_id
          AND MONTH(t.transaction_date) = @month
          AND YEAR(t.transaction_date) = @year
         GROUP BY c.category_id, c.name, c.display_order
         ORDER BY total DESC, c.display_order`;

    const rows = await query(queryText, { month: Number(month), year: Number(year) });
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch category summary" });
  }
});

app.get("/budget-lines", async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: "month and year are required" });
    }

    const queryText = dbType === "postgres"
      ? `SELECT sc.subcategory_id, sc.name AS subcategory, c.name AS category,
               COALESCE(bl.projected_amount, 0) AS projected_amount,
               COALESCE(SUM(t.amount), 0) AS actual_amount
         FROM public.subcategories sc
         JOIN public.categories c ON c.category_id = sc.category_id
         LEFT JOIN public.budget_periods bp ON bp.month = @month AND bp.year = @year
         LEFT JOIN public.budget_lines bl
           ON bl.period_id = bp.period_id AND bl.subcategory_id = sc.subcategory_id
         LEFT JOIN public.transactions t
           ON t.subcategory_id = sc.subcategory_id
          AND EXTRACT(MONTH FROM t.transaction_date) = @month
          AND EXTRACT(YEAR FROM t.transaction_date) = @year
         GROUP BY sc.subcategory_id, sc.name, sc.display_order, c.name, c.display_order,
                  bl.projected_amount
         ORDER BY c.display_order, sc.display_order`
      : `SELECT sc.subcategory_id, sc.name AS subcategory, c.name AS category,
               COALESCE(bl.projected_amount, 0) AS projected_amount,
               COALESCE(SUM(t.amount), 0) AS actual_amount
         FROM dbo.subcategories sc
         JOIN dbo.categories c ON c.category_id = sc.category_id
         LEFT JOIN dbo.budget_periods bp ON bp.month = @month AND bp.year = @year
         LEFT JOIN dbo.budget_lines bl
           ON bl.period_id = bp.period_id AND bl.subcategory_id = sc.subcategory_id
         LEFT JOIN dbo.transactions t
           ON t.subcategory_id = sc.subcategory_id
          AND MONTH(t.transaction_date) = @month
          AND YEAR(t.transaction_date) = @year
         GROUP BY sc.subcategory_id, sc.name, sc.display_order, c.name, c.display_order,
                  bl.projected_amount
         ORDER BY c.display_order, sc.display_order`;

    const rows = await query(queryText, { month: Number(month), year: Number(year) });
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch budget lines" });
  }
});

app.put("/budget-lines/:subcategoryId", async (req, res) => {
  try {
    const subcategoryId = Number(req.params.subcategoryId);
    const month = Number(req.body.month);
    const year = Number(req.body.year);
    const projectedAmount = Number(req.body.projected_amount);

    if (!Number.isInteger(subcategoryId) || !Number.isInteger(month) || month < 1 || month > 12 ||
        !Number.isInteger(year) || !Number.isFinite(projectedAmount) || projectedAmount < 0) {
      return res.status(400).json({ error: "Valid subcategory, month, year, and projected amount are required" });
    }

    if (dbType === "postgres") {
      const rows = await query(
        `WITH period AS (
           INSERT INTO public.budget_periods (year, month)
           VALUES (@year, @month)
           ON CONFLICT (year, month) DO UPDATE SET year = EXCLUDED.year
           RETURNING period_id
         )
         INSERT INTO public.budget_lines (period_id, subcategory_id, projected_amount)
         SELECT period_id, @subcategory_id, @projected_amount FROM period
         ON CONFLICT (period_id, subcategory_id)
         DO UPDATE SET projected_amount = EXCLUDED.projected_amount
         RETURNING subcategory_id, projected_amount`,
        {
          year,
          month,
          subcategory_id: subcategoryId,
          projected_amount: projectedAmount,
        }
      );
      return res.json(rows[0]);
    }

    const db = await getDb();
    const transaction = new mssql.Transaction(db);
    await transaction.begin();
    try {
      const periodRequest = new mssql.Request(transaction);
      periodRequest.input("year", mssql.SmallInt, year);
      periodRequest.input("month", mssql.SmallInt, month);
      const periodResult = await periodRequest.query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.budget_periods WHERE year = @year AND month = @month)
          INSERT INTO dbo.budget_periods (year, month) VALUES (@year, @month);
        SELECT period_id FROM dbo.budget_periods WHERE year = @year AND month = @month;
      `);
      const periodId = periodResult.recordset[0].period_id;

      const lineRequest = new mssql.Request(transaction);
      lineRequest.input("period_id", mssql.Int, periodId);
      lineRequest.input("subcategory_id", mssql.Int, subcategoryId);
      lineRequest.input("projected_amount", mssql.Decimal(10, 2), projectedAmount);
      await lineRequest.query(`
        IF EXISTS (SELECT 1 FROM dbo.budget_lines WHERE period_id = @period_id AND subcategory_id = @subcategory_id)
          UPDATE dbo.budget_lines SET projected_amount = @projected_amount
          WHERE period_id = @period_id AND subcategory_id = @subcategory_id;
        ELSE
          INSERT INTO dbo.budget_lines (period_id, subcategory_id, projected_amount)
          VALUES (@period_id, @subcategory_id, @projected_amount);
      `);
      await transaction.commit();
      return res.json({ subcategory_id: subcategoryId, projected_amount: projectedAmount });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to save budget line" });
  }
});

app.get("/categories", async (req, res) => {
  try {
    const queryText = dbType === "postgres"
      ? `SELECT c.category_id, c.name, c.display_order
         FROM public.categories c
         ORDER BY c.display_order`
      : `SELECT c.category_id, c.name, c.display_order
         FROM dbo.categories c
         ORDER BY c.display_order`;

    const rows = await query(queryText);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

app.get("/subcategories", async (req, res) => {
  try {
    const { category_id } = req.query;
    const params = {};
    let queryText = dbType === "postgres"
      ? `SELECT sc.subcategory_id, sc.category_id, sc.name, sc.display_order
         FROM public.subcategories sc`
      : `SELECT sc.subcategory_id, sc.category_id, sc.name, sc.display_order
         FROM dbo.subcategories sc`;

    if (category_id) {
      queryText += " WHERE sc.category_id = @category_id";
      params.category_id = Number(category_id);
    }
    queryText += " ORDER BY sc.display_order";

    const rows = await query(queryText, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch subcategories" });
  }
});

app.get("/people", async (req, res) => {
  try {
    const queryText = dbType === "postgres"
      ? `SELECT person_id, name, is_household
         FROM public.people
         WHERE is_household = TRUE
         ORDER BY name`
      : `SELECT person_id, name, is_household
         FROM dbo.people
         WHERE is_household = 1
         ORDER BY name`;

    const rows = await query(queryText);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch people" });
  }
});

app.get("/goals", async (req, res) => {
  try {
    const { year } = req.query;
    if (!year) {
      return res.status(400).json({ error: "year is required" });
    }

    const queryText = dbType === "postgres"
      ? `SELECT goal_id, year, description
         FROM public.goals
        WHERE year = @year
        ORDER BY goal_id DESC`
      : `SELECT goal_id, year, description
         FROM dbo.goals
        WHERE year = @year
        ORDER BY goal_id DESC`;

    const rows = await query(queryText, { year: Number(year) });
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch goals" });
  }
});

app.post("/goals", async (req, res) => {
  try {
    const { year, description } = req.body;

    if (!year || !description) {
      return res.status(400).json({ error: "year and description are required" });
    }

    if (dbType === "postgres") {
      const rows = await query(
        `INSERT INTO public.goals (year, description)
         VALUES (@year, @description)
         RETURNING goal_id`,
        {
          year: Number(year),
          description,
        }
      );
      return res.status(201).json({ goal_id: rows[0].goal_id });
    }

    const db = await getDb();
    const request = db.request();
    request.input("year", mssql.SmallInt, Number(year));
    request.input("description", mssql.NVarChar(255), description);
    const result = await request.query(`
      INSERT INTO dbo.goals (year, description)
      OUTPUT INSERTED.goal_id AS goal_id
      VALUES (@year, @description)`);

    res.status(201).json({ goal_id: result.recordset[0].goal_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add goal" });
  }
});

app.delete("/goals/:goalId", async (req, res) => {
  try {
    const goalId = Number(req.params.goalId);
    if (!Number.isInteger(goalId)) {
      return res.status(400).json({ error: "A valid goal ID is required" });
    }

    const queryText = dbType === "postgres"
      ? `DELETE FROM public.goals WHERE goal_id = @goal_id RETURNING goal_id`
      : `DELETE FROM dbo.goals OUTPUT DELETED.goal_id AS goal_id WHERE goal_id = @goal_id`;
    const rows = await query(queryText, { goal_id: goalId });

    if (rows.length === 0) {
      return res.status(404).json({ error: "Goal not found" });
    }

    res.json({ goal_id: rows[0].goal_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete goal" });
  }
});

app.post("/imports/xlsx/preview", uploadWorkbook, async (req, res) => {
  try {
    if (dbType !== "postgres") {
      return res.status(501).json({ error: "Workbook import currently requires PostgreSQL" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Choose an .xlsx workbook to import" });
    }
    if (path.extname(req.file.originalname).toLowerCase() !== ".xlsx") {
      return res.status(400).json({ error: "Only .xlsx workbooks are supported" });
    }

    cleanupPendingImports();
    const parsed = await parseBudgetWorkbook(req.file.buffer);
    const unmatchedPayers = await findUnmatchedPayers(pool, parsed);
    const importId = crypto.randomUUID();
    const expiresAt = Date.now() + IMPORT_TTL_MS;
    pendingImports.set(importId, { parsed, expiresAt, committing: false });

    const warnings = [
      ...parsed.warnings,
      ...unmatchedPayers.map(name => ({
        sheet: "Workbook",
        cell: null,
        message: `Payer not found in the database and will be left unassigned: ${name}`,
      })),
    ];
    const generatedTransactions = parsed.transactions.filter(transaction => transaction.generated).length;
    const firstMonth = parsed.sheets[0];
    const lastMonth = parsed.sheets[parsed.sheets.length - 1];

    res.json({
      import_id: importId,
      file_name: req.file.originalname,
      expires_at: new Date(expiresAt).toISOString(),
      summary: {
        months: parsed.sheets.length,
        first_month: `${firstMonth.year}-${String(firstMonth.month).padStart(2, "0")}`,
        last_month: `${lastMonth.year}-${String(lastMonth.month).padStart(2, "0")}`,
        budget_lines: parsed.budgets.length,
        transactions: parsed.transactions.length,
        detailed_transactions: parsed.transactions.length - generatedTransactions,
        generated_transactions: generatedTransactions,
      },
      sheets: parsed.sheets,
      warning_count: warnings.length,
      warnings: warnings.slice(0, 50),
      sample_budgets: parsed.budgets.filter(row => row.projected_amount > 0).slice(0, 8),
      sample_transactions: parsed.transactions.slice(0, 8),
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || "Failed to read workbook" });
  }
});

app.post("/imports/xlsx/:importId/commit", async (req, res) => {
  const pending = pendingImports.get(req.params.importId);
  if (!pending || pending.expiresAt <= Date.now()) {
    pendingImports.delete(req.params.importId);
    return res.status(404).json({ error: "Import preview expired; choose the workbook again" });
  }
  if (pending.committing) {
    return res.status(409).json({ error: "This workbook import is already running" });
  }

  pending.committing = true;
  try {
    const result = await commitBudgetImport(pool, pending.parsed);
    pendingImports.delete(req.params.importId);
    res.json(result);
  } catch (error) {
    pending.committing = false;
    console.error(error);
    res.status(500).json({ error: error.message || "Failed to import workbook" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
