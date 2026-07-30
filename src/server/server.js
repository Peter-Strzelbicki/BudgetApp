require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { Pool } = require("pg");
const { calculateContributionSummary } = require("./contributions");
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

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function readMonthYear(req, res) {
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    res.status(400).json({ error: "A valid month and year are required" });
    return null;
  }
  return { month, year };
}

async function ensureFeatureSchema() {
  if (dbType === "postgres") {
    await query(`
      CREATE TABLE IF NOT EXISTS public.paychecks (
        paycheck_id BIGSERIAL PRIMARY KEY,
        person_id INTEGER NOT NULL REFERENCES public.people(person_id) ON DELETE CASCADE,
        paycheck_date DATE NOT NULL,
        amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0)
      )`);
    await query(`
      CREATE INDEX IF NOT EXISTS ix_paychecks_person_date
      ON public.paychecks (person_id, paycheck_date)`);
    await query(`
      CREATE TABLE IF NOT EXISTS public.income_config (
        person_id INTEGER PRIMARY KEY REFERENCES public.people(person_id) ON DELETE CASCADE,
        biweekly_amount NUMERIC(10, 2) NOT NULL DEFAULT 0
      )`);
    return;
  }

  await query(`
    IF OBJECT_ID(N'dbo.paychecks', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.paychecks (
        paycheck_id INT IDENTITY(1,1) PRIMARY KEY,
        person_id INT NOT NULL,
        paycheck_date DATE NOT NULL,
        amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
        CONSTRAINT FK_paychecks_people FOREIGN KEY (person_id)
          REFERENCES dbo.people(person_id) ON DELETE CASCADE
      );
    END`);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_paychecks_person_date' AND object_id = OBJECT_ID(N'dbo.paychecks'))
      CREATE INDEX IX_paychecks_person_date ON dbo.paychecks(person_id, paycheck_date)`);
  await query(`
    IF OBJECT_ID(N'dbo.income_config', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.income_config (
        person_id INT PRIMARY KEY,
        biweekly_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        CONSTRAINT FK_income_config_people FOREIGN KEY (person_id)
          REFERENCES dbo.people(person_id) ON DELETE CASCADE
      );
    END`);
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
         SELECT t.transaction_id, t.subcategory_id, sc.category_id, t.paid_by_person_id,
           t.transaction_date, t.amount, t.location, t.notes,
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
         SELECT t.transaction_id, t.subcategory_id, sc.category_id, t.paid_by_person_id,
           t.transaction_date, t.amount, t.location, t.notes,
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

app.get("/transactions/:transactionId", async (req, res) => {
  try {
    const transactionId = Number(req.params.transactionId);
    if (!Number.isInteger(transactionId)) {
      return res.status(400).json({ error: "A valid transaction ID is required" });
    }

    const queryText = dbType === "postgres"
      ? `SELECT t.transaction_id, t.subcategory_id, sc.category_id, t.paid_by_person_id,
                t.transaction_date, t.amount, t.location, t.notes,
                sc.name AS subcategory, c.name AS category, p.name AS paid_by
         FROM public.transactions t
         JOIN public.subcategories sc ON sc.subcategory_id = t.subcategory_id
         JOIN public.categories c ON c.category_id = sc.category_id
         LEFT JOIN public.people p ON p.person_id = t.paid_by_person_id
         WHERE t.transaction_id = @transaction_id`
      : `SELECT t.transaction_id, t.subcategory_id, sc.category_id, t.paid_by_person_id,
                t.transaction_date, t.amount, t.location, t.notes,
                sc.name AS subcategory, c.name AS category, p.name AS paid_by
         FROM dbo.transactions t
         JOIN dbo.subcategories sc ON sc.subcategory_id = t.subcategory_id
         JOIN dbo.categories c ON c.category_id = sc.category_id
         LEFT JOIN dbo.people p ON p.person_id = t.paid_by_person_id
         WHERE t.transaction_id = @transaction_id`;
    const rows = await query(queryText, { transaction_id: transactionId });
    if (rows.length === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch transaction" });
  }
});

app.post("/transactions", async (req, res) => {
  try {
    const { subcategory_id, transaction_date, amount, location, paid_by_person_id, notes } = req.body;

    if (!Number.isInteger(Number(subcategory_id)) || !isIsoDate(transaction_date) ||
        !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Valid subcategory, transaction date, and amount are required" });
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

app.put("/transactions/:transactionId", async (req, res) => {
  try {
    const transactionId = Number(req.params.transactionId);
    const { subcategory_id, transaction_date, amount, location, paid_by_person_id, notes } = req.body;
    if (!Number.isInteger(transactionId) || !Number.isInteger(Number(subcategory_id)) ||
        !isIsoDate(transaction_date) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Valid transaction, subcategory, date, and amount are required" });
    }

    const params = {
      transaction_id: transactionId,
      subcategory_id: Number(subcategory_id),
      transaction_date,
      amount: Number(amount),
      location: location || null,
      paid_by_person_id: paid_by_person_id ? Number(paid_by_person_id) : null,
      notes: notes || null,
    };

    if (dbType === "postgres") {
      const rows = await query(
        `UPDATE public.transactions
         SET subcategory_id = @subcategory_id,
             transaction_date = @transaction_date,
             amount = @amount,
             location = @location,
             paid_by_person_id = @paid_by_person_id,
             notes = @notes
         WHERE transaction_id = @transaction_id
         RETURNING transaction_id`,
        params
      );
      if (rows.length === 0) return res.status(404).json({ error: "Transaction not found" });
      return res.json({ transaction_id: rows[0].transaction_id });
    }

    const db = await getDb();
    const request = db.request();
    request.input("transaction_id", mssql.Int, transactionId);
    request.input("subcategory_id", mssql.Int, params.subcategory_id);
    request.input("transaction_date", mssql.Date, transaction_date);
    request.input("amount", mssql.Decimal(10, 2), params.amount);
    request.input("location", mssql.NVarChar(100), params.location);
    request.input("paid_by_person_id", mssql.Int, params.paid_by_person_id);
    request.input("notes", mssql.NVarChar(255), params.notes);
    const result = await request.query(`
      UPDATE dbo.transactions
      SET subcategory_id = @subcategory_id,
          transaction_date = @transaction_date,
          amount = @amount,
          location = @location,
          paid_by_person_id = @paid_by_person_id,
          notes = @notes
      OUTPUT INSERTED.transaction_id AS transaction_id
      WHERE transaction_id = @transaction_id
    `);
    if (result.recordset.length === 0) return res.status(404).json({ error: "Transaction not found" });
    res.json({ transaction_id: result.recordset[0].transaction_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update transaction" });
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

app.get("/paychecks", async (req, res) => {
  try {
    const period = readMonthYear(req, res);
    if (!period) return;
    const queryText = dbType === "postgres"
      ? `SELECT pc.paycheck_id, pc.person_id, p.name AS person_name, pc.paycheck_date, pc.amount
         FROM public.paychecks pc
         JOIN public.people p ON p.person_id = pc.person_id
         WHERE EXTRACT(MONTH FROM pc.paycheck_date) = @month
           AND EXTRACT(YEAR FROM pc.paycheck_date) = @year
         ORDER BY pc.paycheck_date DESC, pc.paycheck_id DESC`
      : `SELECT pc.paycheck_id, pc.person_id, p.name AS person_name, pc.paycheck_date, pc.amount
         FROM dbo.paychecks pc
         JOIN dbo.people p ON p.person_id = pc.person_id
         WHERE MONTH(pc.paycheck_date) = @month AND YEAR(pc.paycheck_date) = @year
         ORDER BY pc.paycheck_date DESC, pc.paycheck_id DESC`;
    res.json(await query(queryText, period));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch paychecks" });
  }
});

app.post("/paychecks", async (req, res) => {
  try {
    const personId = Number(req.body.person_id);
    const amount = Number(req.body.amount);
    const paycheckDate = req.body.paycheck_date;
    if (!Number.isInteger(personId) || !isIsoDate(paycheckDate) || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Valid person, paycheck date, and amount are required" });
    }

    const peopleTable = dbType === "postgres" ? "public.people" : "dbo.people";
    const householdPredicate = dbType === "postgres" ? "is_household = TRUE" : "is_household = 1";
    const people = await query(
      `SELECT person_id FROM ${peopleTable}
       WHERE person_id = @person_id AND ${householdPredicate} AND LOWER(name) <> 'joint'`,
      { person_id: personId }
    );
    if (people.length === 0) {
      return res.status(400).json({ error: "Choose a household member other than the joint account" });
    }

    const queryText = dbType === "postgres"
      ? `INSERT INTO public.paychecks (person_id, paycheck_date, amount)
         VALUES (@person_id, @paycheck_date, @amount)
         RETURNING paycheck_id`
      : `INSERT INTO dbo.paychecks (person_id, paycheck_date, amount)
         OUTPUT INSERTED.paycheck_id AS paycheck_id
         VALUES (@person_id, @paycheck_date, @amount)`;
    const rows = await query(queryText, { person_id: personId, paycheck_date: paycheckDate, amount });
    res.status(201).json({ paycheck_id: rows[0].paycheck_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add paycheck" });
  }
});

app.delete("/paychecks/:paycheckId", async (req, res) => {
  try {
    const paycheckId = Number(req.params.paycheckId);
    if (!Number.isInteger(paycheckId)) {
      return res.status(400).json({ error: "A valid paycheck ID is required" });
    }
    const queryText = dbType === "postgres"
      ? `DELETE FROM public.paychecks WHERE paycheck_id = @paycheck_id RETURNING paycheck_id`
      : `DELETE FROM dbo.paychecks OUTPUT DELETED.paycheck_id AS paycheck_id WHERE paycheck_id = @paycheck_id`;
    const rows = await query(queryText, { paycheck_id: paycheckId });
    if (rows.length === 0) return res.status(404).json({ error: "Paycheck not found" });
    res.json({ paycheck_id: rows[0].paycheck_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete paycheck" });
  }
});

app.get("/contributions", async (req, res) => {
  try {
    const period = readMonthYear(req, res);
    if (!period) return;
    const prefix = dbType === "postgres" ? "public" : "dbo";
    const householdPredicate = dbType === "postgres" ? "is_household = TRUE" : "is_household = 1";
    const monthExpression = column => dbType === "postgres"
      ? `EXTRACT(MONTH FROM ${column}) = @month AND EXTRACT(YEAR FROM ${column}) = @year`
      : `MONTH(${column}) = @month AND YEAR(${column}) = @year`;

    const [people, incomeConfig, personalExpenses, plannedRows] = await Promise.all([
      query(
        `SELECT person_id, name FROM ${prefix}.people
         WHERE ${householdPredicate} AND LOWER(name) <> 'joint'
         ORDER BY person_id`,
        period
      ),
      query(
        `SELECT p.person_id, COALESCE(ic.biweekly_amount, 0) AS biweekly_amount
         FROM ${prefix}.people p
         LEFT JOIN ${prefix}.income_config ic ON ic.person_id = p.person_id
         WHERE ${householdPredicate} AND LOWER(p.name) <> 'joint'`
      ),
      query(
        `SELECT paid_by_person_id AS person_id, SUM(amount) AS amount
         FROM ${prefix}.transactions
         WHERE paid_by_person_id IS NOT NULL AND ${monthExpression("transaction_date")}
         GROUP BY paid_by_person_id`,
        period
      ),
      query(
        `SELECT COALESCE(SUM(bl.projected_amount), 0) AS planned_expenses
         FROM ${prefix}.budget_periods bp
         LEFT JOIN ${prefix}.budget_lines bl ON bl.period_id = bp.period_id
         WHERE bp.month = @month AND bp.year = @year`,
        period
      ),
    ]);

    res.json(calculateContributionSummary({
      people,
      incomeConfig,
      personalExpenses,
      plannedExpenses: plannedRows[0]?.planned_expenses || 0,
    }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to calculate contributions" });
  }
});

app.get("/income-config", async (req, res) => {
  try {
    const prefix = dbType === "postgres" ? "public" : "dbo";
    const householdPredicate = dbType === "postgres" ? "is_household = TRUE" : "is_household = 1";
    const rows = await query(
      `SELECT p.person_id, p.name, COALESCE(ic.biweekly_amount, 0) AS biweekly_amount
       FROM ${prefix}.people p
       LEFT JOIN ${prefix}.income_config ic ON ic.person_id = p.person_id
       WHERE ${householdPredicate} AND LOWER(p.name) <> 'joint'
       ORDER BY p.person_id`
    );
    res.json(rows.map(row => ({ ...row, biweekly_amount: Number(row.biweekly_amount) })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch income config" });
  }
});

app.put("/income-config/:personId", async (req, res) => {
  try {
    const personId = Number(req.params.personId);
    const amount = Number(req.body.biweekly_amount);
    if (!Number.isInteger(personId) || !Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: "Valid person ID and non-negative amount are required" });
    }
    const queryText = dbType === "postgres"
      ? `INSERT INTO public.income_config (person_id, biweekly_amount)
         VALUES (@person_id, @amount)
         ON CONFLICT (person_id) DO UPDATE SET biweekly_amount = EXCLUDED.biweekly_amount
         RETURNING person_id, biweekly_amount`
      : `MERGE dbo.income_config AS target
         USING (SELECT @person_id AS person_id, @amount AS biweekly_amount) AS source
         ON target.person_id = source.person_id
         WHEN MATCHED THEN UPDATE SET biweekly_amount = source.biweekly_amount
         WHEN NOT MATCHED THEN INSERT (person_id, biweekly_amount) VALUES (source.person_id, source.biweekly_amount);
         SELECT person_id, biweekly_amount FROM dbo.income_config WHERE person_id = @person_id`;
    const rows = await query(queryText, { person_id: personId, amount });
    res.json({ person_id: personId, biweekly_amount: Number(rows[0].biweekly_amount) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to save income config" });
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

app.get("/summary/ytd", async (req, res) => {
  try {
    const requestedYear = Number(req.query.year);
    if (!Number.isInteger(requestedYear)) {
      return res.status(400).json({ error: "A valid year is required" });
    }

    const today = new Date();
    const currentYear = today.getFullYear();
    const monthsElapsed = requestedYear < currentYear
      ? 12
      : requestedYear === currentYear
        ? today.getMonth() + 1
        : 1;
    const monthRows = Array.from({ length: monthsElapsed }, (_, index) => `(${index + 1})`).join(", ");

    const categoryQuery = dbType === "postgres"
      ? `SELECT c.category_id, c.name AS category,
                COALESCE(SUM(t.amount), 0) AS total,
                COALESCE(SUM(t.amount), 0) / @months_elapsed AS monthly_average
         FROM public.categories c
         LEFT JOIN public.subcategories sc ON sc.category_id = c.category_id
         LEFT JOIN public.transactions t
           ON t.subcategory_id = sc.subcategory_id
          AND EXTRACT(YEAR FROM t.transaction_date) = @year
          AND EXTRACT(MONTH FROM t.transaction_date) <= @months_elapsed
         GROUP BY c.category_id, c.name, c.display_order
         ORDER BY total DESC, c.display_order`
      : `SELECT c.category_id, c.name AS category,
                COALESCE(SUM(t.amount), 0) AS total,
                COALESCE(SUM(t.amount), 0) / @months_elapsed AS monthly_average
         FROM dbo.categories c
         LEFT JOIN dbo.subcategories sc ON sc.category_id = c.category_id
         LEFT JOIN dbo.transactions t
           ON t.subcategory_id = sc.subcategory_id
          AND YEAR(t.transaction_date) = @year
          AND MONTH(t.transaction_date) <= @months_elapsed
         GROUP BY c.category_id, c.name, c.display_order
         ORDER BY total DESC, c.display_order`;

    const varianceQuery = dbType === "postgres"
      ? `WITH months(month) AS (VALUES ${monthRows}),
           actuals AS (
             SELECT EXTRACT(MONTH FROM transaction_date) AS month, SUM(amount) AS actual
             FROM public.transactions
             WHERE EXTRACT(YEAR FROM transaction_date) = @year
               AND EXTRACT(MONTH FROM transaction_date) <= @months_elapsed
             GROUP BY EXTRACT(MONTH FROM transaction_date)
           ),
           plans AS (
             SELECT bp.month, SUM(bl.projected_amount) AS planned
             FROM public.budget_periods bp
             JOIN public.budget_lines bl ON bl.period_id = bp.period_id
             WHERE bp.year = @year AND bp.month <= @months_elapsed
             GROUP BY bp.month
           )
         SELECT m.month,
                COALESCE(p.planned, 0) AS planned,
                COALESCE(a.actual, 0) AS actual,
                COALESCE(p.planned, 0) - COALESCE(a.actual, 0) AS variance
         FROM months m
         LEFT JOIN plans p ON p.month = m.month
         LEFT JOIN actuals a ON a.month = m.month
         ORDER BY m.month`
      : `WITH months(month) AS (SELECT month FROM (VALUES ${monthRows}) AS values_table(month)),
           actuals AS (
             SELECT MONTH(transaction_date) AS month, SUM(amount) AS actual
             FROM dbo.transactions
             WHERE YEAR(transaction_date) = @year
               AND MONTH(transaction_date) <= @months_elapsed
             GROUP BY MONTH(transaction_date)
           ),
           plans AS (
             SELECT bp.month, SUM(bl.projected_amount) AS planned
             FROM dbo.budget_periods bp
             JOIN dbo.budget_lines bl ON bl.period_id = bp.period_id
             WHERE bp.year = @year AND bp.month <= @months_elapsed
             GROUP BY bp.month
           )
         SELECT m.month,
                COALESCE(p.planned, 0) AS planned,
                COALESCE(a.actual, 0) AS actual,
                COALESCE(p.planned, 0) - COALESCE(a.actual, 0) AS variance
         FROM months m
         LEFT JOIN plans p ON p.month = m.month
         LEFT JOIN actuals a ON a.month = m.month
         ORDER BY m.month`;

    const params = { year: requestedYear, months_elapsed: monthsElapsed };
    const [categoryAverages, monthlyVariance] = await Promise.all([
      query(categoryQuery, params),
      query(varianceQuery, params),
    ]);

    res.json({
      year: requestedYear,
      months_elapsed: monthsElapsed,
      category_averages: categoryAverages,
      monthly_variance: monthlyVariance,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch YTD summary" });
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

app.post("/subcategories", async (req, res) => {
  try {
    const { category_id, name } = req.body;
    if (!Number.isInteger(Number(category_id)) || !name?.trim()) {
      return res.status(400).json({ error: "category_id and name are required" });
    }

    const queryText = dbType === "postgres"
      ? `INSERT INTO public.subcategories (category_id, name, display_order)
         SELECT @category_id, @name, COALESCE(MAX(display_order), 0) + 1
         FROM public.subcategories WHERE category_id = @category_id
         ON CONFLICT (category_id, name) DO NOTHING
         RETURNING subcategory_id, category_id, name, display_order`
      : `IF NOT EXISTS (SELECT 1 FROM dbo.subcategories WHERE category_id = @category_id AND name = @name)
         BEGIN
           DECLARE @next_order SMALLINT;
           SELECT @next_order = COALESCE(MAX(display_order), 0) + 1 FROM dbo.subcategories WHERE category_id = @category_id;
           INSERT INTO dbo.subcategories (category_id, name, display_order) VALUES (@category_id, @name, @next_order);
           SELECT * FROM dbo.subcategories WHERE subcategory_id = SCOPE_IDENTITY();
         END`;

    const rows = await query(queryText, { category_id: Number(category_id), name: name.trim() });
    if (!rows?.length) return res.status(409).json({ error: "A subcategory with that name already exists in this category" });
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create subcategory" });
  }
});

app.delete("/subcategories/:subcategoryId", async (req, res) => {
  try {
    const subcategoryId = Number(req.params.subcategoryId);
    if (!Number.isInteger(subcategoryId)) {
      return res.status(400).json({ error: "A valid subcategory ID is required" });
    }

    const countQuery = dbType === "postgres"
      ? "SELECT COUNT(*)::int AS cnt FROM public.transactions WHERE subcategory_id = @subcategory_id"
      : "SELECT COUNT(*) AS cnt FROM dbo.transactions WHERE subcategory_id = @subcategory_id";
    const countRows = await query(countQuery, { subcategory_id: subcategoryId });
    const cnt = Number(countRows[0]?.cnt ?? 0);
    if (cnt > 0) {
      return res.status(409).json({
        error: `This line has ${cnt} recorded transaction${cnt === 1 ? "" : "s"} and cannot be removed. Set its budget amount to $0 to exclude it from your plan.`,
      });
    }

    const deleteLines = dbType === "postgres"
      ? "DELETE FROM public.budget_lines WHERE subcategory_id = @subcategory_id"
      : "DELETE FROM dbo.budget_lines WHERE subcategory_id = @subcategory_id";
    await query(deleteLines, { subcategory_id: subcategoryId });

    const deleteQuery = dbType === "postgres"
      ? "DELETE FROM public.subcategories WHERE subcategory_id = @subcategory_id RETURNING subcategory_id"
      : "DELETE FROM dbo.subcategories OUTPUT DELETED.subcategory_id AS subcategory_id WHERE subcategory_id = @subcategory_id";
    const rows = await query(deleteQuery, { subcategory_id: subcategoryId });
    if (!rows?.length) return res.status(404).json({ error: "Subcategory not found" });
    res.json({ subcategory_id: rows[0].subcategory_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete subcategory" });
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

async function start() {
  try {
    await ensureFeatureSchema();
    app.listen(process.env.PORT || 3000, () => {
      console.log("Server running");
    });
  } catch (error) {
    console.error("Failed to initialize the database", error);
    process.exitCode = 1;
  }
}

start();
