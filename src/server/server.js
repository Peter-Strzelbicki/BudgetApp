require("dotenv").config();

const crypto = require("crypto");
const { execFile } = require("child_process");
const fs = require("fs/promises");
const { promisify } = require("util");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { Pool } = require("pg");
const { calculateContributionSummary } = require("./contributions");
const {
  INCOME_TRACKING_START_MONTH,
  INCOME_TRACKING_START_YEAR,
  buildIncomeYearSummary,
  resolveIncomeConfig,
} = require("./income-history");
const { parseBudgetWorkbook } = require("./import-xlsx");
const { commitBudgetImport, findUnmatchedPayers } = require("./import-xlsx-db");

const app = express();
const execFileAsync = promisify(execFile);
const backupScriptPath = process.env.BACKUP_SCRIPT_PATH || path.resolve(__dirname, "..", "..", "scripts", "backup-db.sh");
const backupStatusPath = process.env.BACKUP_STATUS_FILE || "/home/pstrzelbicki/.local/share/homebudget/backup-status.json";
let backupRunPromise = null;

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

async function readBackupStatus() {
  try {
    const statusText = await fs.readFile(backupStatusPath, "utf8");
    return JSON.parse(statusText);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        last_backup_utc: null,
        backup_name: null,
        backup_size_bytes: null,
        backup_target: null,
      };
    }

    if (error instanceof SyntaxError) {
      console.warn(`Ignoring malformed backup status file at ${backupStatusPath}`);
      return {
        last_backup_utc: null,
        backup_name: null,
        backup_size_bytes: null,
        backup_target: null,
      };
    }

    throw error;
  }
}

async function runBackupJob() {
  if (!backupRunPromise) {
    backupRunPromise = execFileAsync("/usr/bin/env", ["bash", backupScriptPath], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: process.env,
      maxBuffer: 5 * 1024 * 1024,
    }).finally(() => {
      backupRunPromise = null;
    });
  }

  return backupRunPromise;
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

function isIsoTime(value) {
  return typeof value === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(value);
}

function currentIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function serializeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
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

async function loadIncomeConfiguration(month, year) {
  const prefix = dbType === "postgres" ? "public" : "dbo";
  const householdPredicate = dbType === "postgres" ? "is_household = TRUE" : "is_household = 1";
  const period = { month, year };
  const [people, defaults, records] = await Promise.all([
    query(
      `SELECT person_id, name FROM ${prefix}.people
       WHERE ${householdPredicate} AND LOWER(name) <> 'joint'
       ORDER BY person_id`
    ),
    query(
      `SELECT person_id, biweekly_amount, payday_anchor
       FROM ${prefix}.income_config`
    ),
    query(
      `SELECT person_id, month, year, biweekly_amount, payday_anchor
       FROM ${prefix}.monthly_income_config
       WHERE year < @year OR (year = @year AND month <= @month)
       ORDER BY person_id, year, month`,
      period
    ),
  ]);
  const normalizedDefaults = defaults.map(row => ({
    ...row,
    biweekly_amount: Number(row.biweekly_amount),
    payday_anchor: serializeDate(row.payday_anchor),
  }));
  const normalizedRecords = records.map(row => ({
    ...row,
    month: Number(row.month),
    year: Number(row.year),
    biweekly_amount: Number(row.biweekly_amount),
    payday_anchor: serializeDate(row.payday_anchor),
  }));
  return {
    people,
    defaults: normalizedDefaults,
    records: normalizedRecords,
    config: resolveIncomeConfig(people, normalizedDefaults, normalizedRecords, month, year),
  };
}

async function ensureFeatureSchema() {
  const today = new Date();
  const currentPeriod = { month: today.getMonth() + 1, year: today.getFullYear() };
  if (dbType === "postgres") {
    await query(`
      CREATE TABLE IF NOT EXISTS public.paychecks (
        paycheck_id BIGSERIAL PRIMARY KEY,
        person_id INTEGER NOT NULL REFERENCES public.people(person_id) ON DELETE CASCADE,
        paycheck_date DATE NOT NULL,
        amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0)
      )`);
    await query(`
      ALTER TABLE public.paychecks
      ADD COLUMN IF NOT EXISTS transferred_amount NUMERIC(10, 2) NOT NULL DEFAULT 0`);
    await query(`
      ALTER TABLE public.paychecks
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await query(`
      CREATE INDEX IF NOT EXISTS ix_paychecks_person_date
      ON public.paychecks (person_id, paycheck_date)`);
    await query(`
      CREATE TABLE IF NOT EXISTS public.income_config (
        person_id INTEGER PRIMARY KEY REFERENCES public.people(person_id) ON DELETE CASCADE,
        biweekly_amount NUMERIC(10, 2) NOT NULL DEFAULT 0
      )`);
    await query(`
      ALTER TABLE public.income_config
      ADD COLUMN IF NOT EXISTS payday_anchor DATE`);
    await query(`
      UPDATE public.income_config AS ic
      SET payday_anchor = CASE LOWER(p.name)
        WHEN 'peter' THEN DATE '2026-07-10'
        WHEN 'sailah' THEN DATE '2026-07-17'
      END
      FROM public.people AS p
      WHERE p.person_id = ic.person_id
        AND ic.payday_anchor IS NULL
        AND LOWER(p.name) IN ('peter', 'sailah')`);
    await query(`
      CREATE TABLE IF NOT EXISTS public.monthly_income_config (
        person_id INTEGER NOT NULL REFERENCES public.people(person_id) ON DELETE CASCADE,
        month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
        year SMALLINT NOT NULL,
        biweekly_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
        payday_anchor DATE,
        PRIMARY KEY (person_id, month, year)
      )`);
    await query(`
      INSERT INTO public.monthly_income_config (person_id, month, year, biweekly_amount, payday_anchor)
      SELECT person_id, @month, @year, biweekly_amount, payday_anchor
      FROM public.income_config
      ON CONFLICT (person_id, month, year) DO NOTHING`, currentPeriod);
    await query(`
      CREATE TABLE IF NOT EXISTS public.joint_payments (
        joint_payment_id BIGSERIAL PRIMARY KEY,
        person_id INTEGER NOT NULL REFERENCES public.people(person_id) ON DELETE CASCADE,
        payment_date DATE NOT NULL,
        amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0)
      )`);
    await query(`
      ALTER TABLE public.joint_payments
      DROP CONSTRAINT IF EXISTS joint_payments_amount_check`);
    await query(`
      ALTER TABLE public.joint_payments
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await query(`
      CREATE INDEX IF NOT EXISTS ix_joint_payments_person_date
      ON public.joint_payments (person_id, payment_date)`);
    await query(`
      ALTER TABLE public.transactions
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await query(`
      ALTER TABLE public.transactions
      ADD COLUMN IF NOT EXISTS transaction_time TIME`);
    await query(`
      CREATE INDEX IF NOT EXISTS ix_transactions_date
      ON public.transactions (transaction_date)`);
    await query(`
      CREATE INDEX IF NOT EXISTS ix_transactions_subcategory
      ON public.transactions (subcategory_id)`);
    await query(`
      CREATE INDEX IF NOT EXISTS ix_transactions_person_date
      ON public.transactions (paid_by_person_id, transaction_date)`);
    await query(`
      CREATE TABLE IF NOT EXISTS public.extra_income (
        extra_income_id BIGSERIAL PRIMARY KEY,
        person_id INTEGER NOT NULL REFERENCES public.people(person_id) ON DELETE CASCADE,
        month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
        year SMALLINT NOT NULL,
        amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
        description VARCHAR(255)
      )`);
    await query(`
      CREATE TABLE IF NOT EXISTS public.recurring_transactions (
        recurring_id BIGSERIAL PRIMARY KEY,
        subcategory_id INTEGER NOT NULL REFERENCES public.subcategories(subcategory_id),
        amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
        location VARCHAR(100),
        paid_by_person_id INTEGER REFERENCES public.people(person_id),
        notes VARCHAR(255),
        day_of_month SMALLINT NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 31),
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      )`);
    await query(`
      CREATE TABLE IF NOT EXISTS public.recurring_applied (
        applied_id BIGSERIAL PRIMARY KEY,
        recurring_id BIGINT NOT NULL REFERENCES public.recurring_transactions(recurring_id) ON DELETE CASCADE,
        month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
        year SMALLINT NOT NULL,
        transaction_id BIGINT REFERENCES public.transactions(transaction_id) ON DELETE SET NULL,
        UNIQUE(recurring_id, month, year)
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
    IF COL_LENGTH('dbo.paychecks', 'transferred_amount') IS NULL
      ALTER TABLE dbo.paychecks ADD transferred_amount DECIMAL(10,2) NOT NULL CONSTRAINT DF_paychecks_transferred_amount DEFAULT (0)`);
  await query(`
    IF COL_LENGTH('dbo.paychecks', 'created_at') IS NULL
      ALTER TABLE dbo.paychecks ADD created_at DATETIME2(0) NOT NULL CONSTRAINT DF_paychecks_created_at DEFAULT (SYSUTCDATETIME())`);
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
  await query(`
    IF COL_LENGTH('dbo.income_config', 'payday_anchor') IS NULL
      ALTER TABLE dbo.income_config ADD payday_anchor DATE NULL`);
  await query(`
    UPDATE ic
    SET payday_anchor = CASE LOWER(p.name)
      WHEN 'peter' THEN CONVERT(DATE, '2026-07-10')
      WHEN 'sailah' THEN CONVERT(DATE, '2026-07-17')
    END
    FROM dbo.income_config ic
    JOIN dbo.people p ON p.person_id = ic.person_id
    WHERE ic.payday_anchor IS NULL AND LOWER(p.name) IN ('peter', 'sailah')`);
  await query(`
    IF OBJECT_ID(N'dbo.monthly_income_config', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.monthly_income_config (
        person_id INT NOT NULL,
        month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
        year SMALLINT NOT NULL,
        biweekly_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        payday_anchor DATE NULL,
        CONSTRAINT PK_monthly_income_config PRIMARY KEY (person_id, month, year),
        CONSTRAINT FK_monthly_income_config_people FOREIGN KEY (person_id)
          REFERENCES dbo.people(person_id) ON DELETE CASCADE
      );
    END`);
  await query(`
    MERGE dbo.monthly_income_config AS target
    USING (
      SELECT person_id, @month AS month, @year AS year, biweekly_amount, payday_anchor
      FROM dbo.income_config
    ) AS source
    ON target.person_id = source.person_id AND target.month = source.month AND target.year = source.year
    WHEN NOT MATCHED THEN
      INSERT (person_id, month, year, biweekly_amount, payday_anchor)
      VALUES (source.person_id, source.month, source.year, source.biweekly_amount, source.payday_anchor);`, currentPeriod);
  await query(`
    IF OBJECT_ID(N'dbo.joint_payments', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.joint_payments (
        joint_payment_id INT IDENTITY(1,1) PRIMARY KEY,
        person_id INT NOT NULL,
        payment_date DATE NOT NULL,
        amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
        CONSTRAINT FK_joint_payments_people FOREIGN KEY (person_id)
          REFERENCES dbo.people(person_id) ON DELETE CASCADE
      );
    END`);
  await query(`
    DECLARE @jointPaymentAmountConstraint sysname;
    SELECT TOP 1 @jointPaymentAmountConstraint = cc.name
    FROM sys.check_constraints cc
    JOIN sys.columns col
      ON col.object_id = cc.parent_object_id
     AND col.column_id = cc.parent_column_id
    WHERE cc.parent_object_id = OBJECT_ID(N'dbo.joint_payments')
      AND col.name = N'amount';
    IF @jointPaymentAmountConstraint IS NOT NULL
      EXEC(N'ALTER TABLE dbo.joint_payments DROP CONSTRAINT ' + QUOTENAME(@jointPaymentAmountConstraint));`);
  await query(`
    IF COL_LENGTH('dbo.joint_payments', 'created_at') IS NULL
      ALTER TABLE dbo.joint_payments ADD created_at DATETIME2(0) NOT NULL CONSTRAINT DF_joint_payments_created_at DEFAULT (SYSUTCDATETIME())`);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_joint_payments_person_date' AND object_id = OBJECT_ID(N'dbo.joint_payments'))
      CREATE INDEX IX_joint_payments_person_date ON dbo.joint_payments(person_id, payment_date)`);
  await query(`
    IF COL_LENGTH('dbo.transactions', 'created_at') IS NULL
      ALTER TABLE dbo.transactions ADD created_at DATETIME2(0) NOT NULL CONSTRAINT DF_transactions_created_at DEFAULT (SYSUTCDATETIME())`);
  await query(`
    IF COL_LENGTH('dbo.transactions', 'transaction_time') IS NULL
      ALTER TABLE dbo.transactions ADD transaction_time TIME NULL`);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_transactions_date' AND object_id = OBJECT_ID(N'dbo.transactions'))
      CREATE INDEX IX_transactions_date ON dbo.transactions(transaction_date)`);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_transactions_subcategory' AND object_id = OBJECT_ID(N'dbo.transactions'))
      CREATE INDEX IX_transactions_subcategory ON dbo.transactions(subcategory_id)`);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_transactions_person_date' AND object_id = OBJECT_ID(N'dbo.transactions'))
      CREATE INDEX IX_transactions_person_date ON dbo.transactions(paid_by_person_id, transaction_date)`);
  await query(`
    IF OBJECT_ID(N'dbo.extra_income', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.extra_income (
        extra_income_id INT IDENTITY(1,1) PRIMARY KEY,
        person_id INT NOT NULL,
        month SMALLINT NOT NULL,
        year SMALLINT NOT NULL,
        amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
        description NVARCHAR(255) NULL,
        CONSTRAINT FK_extra_income_people FOREIGN KEY (person_id)
          REFERENCES dbo.people(person_id) ON DELETE CASCADE
      );
    END`);
  await query(`
    IF OBJECT_ID(N'dbo.recurring_transactions', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.recurring_transactions (
        recurring_id INT IDENTITY(1,1) PRIMARY KEY,
        subcategory_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
        location NVARCHAR(100) NULL,
        paid_by_person_id INT NULL,
        notes NVARCHAR(255) NULL,
        day_of_month SMALLINT NOT NULL DEFAULT 1,
        is_active BIT NOT NULL DEFAULT 1,
        CONSTRAINT FK_recurring_subcategories FOREIGN KEY (subcategory_id)
          REFERENCES dbo.subcategories(subcategory_id)
      );
    END`);
  await query(`
    IF OBJECT_ID(N'dbo.recurring_applied', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.recurring_applied (
        applied_id INT IDENTITY(1,1) PRIMARY KEY,
        recurring_id INT NOT NULL,
        month SMALLINT NOT NULL,
        year SMALLINT NOT NULL,
        transaction_id BIGINT NULL,
        CONSTRAINT FK_recurring_applied_rt FOREIGN KEY (recurring_id)
          REFERENCES dbo.recurring_transactions(recurring_id) ON DELETE CASCADE,
        CONSTRAINT UQ_recurring_applied UNIQUE (recurring_id, month, year)
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

app.get("/backup-status", async (req, res) => {
  try {
    res.json(await readBackupStatus());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch backup status" });
  }
});

app.post("/backup-now", async (req, res) => {
  try {
    if (backupRunPromise) {
      return res.status(409).json({ error: "A backup is already running" });
    }

    await runBackupJob();
    res.json(await readBackupStatus());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to run backup" });
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
           t.transaction_date, t.transaction_time, t.amount, t.location, t.notes,
           sc.name AS subcategory, c.name AS category, p.name AS paid_by,
           EXISTS(
             SELECT 1
             FROM public.recurring_applied ra
             WHERE ra.transaction_id = t.transaction_id
           ) AS is_recurring,
           (
             SELECT ra.recurring_id
             FROM public.recurring_applied ra
             WHERE ra.transaction_id = t.transaction_id
             ORDER BY ra.applied_id DESC
             LIMIT 1
           ) AS recurring_id
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
           t.transaction_date, t.transaction_time, t.amount, t.location, t.notes,
           sc.name AS subcategory, c.name AS category, p.name AS paid_by,
           CASE WHEN EXISTS(
             SELECT 1
             FROM dbo.recurring_applied ra
             WHERE ra.transaction_id = t.transaction_id
           ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS is_recurring,
           (
             SELECT TOP 1 ra.recurring_id
             FROM dbo.recurring_applied ra
             WHERE ra.transaction_id = t.transaction_id
             ORDER BY ra.applied_id DESC
           ) AS recurring_id
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
                t.transaction_date, t.transaction_time, t.amount, t.location, t.notes,
                sc.name AS subcategory, c.name AS category, p.name AS paid_by,
                EXISTS(
                  SELECT 1
                  FROM public.recurring_applied ra
                  WHERE ra.transaction_id = t.transaction_id
                ) AS is_recurring,
                (
                  SELECT ra.recurring_id
                  FROM public.recurring_applied ra
                  WHERE ra.transaction_id = t.transaction_id
                  ORDER BY ra.applied_id DESC
                  LIMIT 1
                ) AS recurring_id
         FROM public.transactions t
         JOIN public.subcategories sc ON sc.subcategory_id = t.subcategory_id
         JOIN public.categories c ON c.category_id = sc.category_id
         LEFT JOIN public.people p ON p.person_id = t.paid_by_person_id
         WHERE t.transaction_id = @transaction_id`
      : `SELECT t.transaction_id, t.subcategory_id, sc.category_id, t.paid_by_person_id,
                t.transaction_date, t.transaction_time, t.amount, t.location, t.notes,
                sc.name AS subcategory, c.name AS category, p.name AS paid_by,
                CASE WHEN EXISTS(
                  SELECT 1
                  FROM dbo.recurring_applied ra
                  WHERE ra.transaction_id = t.transaction_id
                ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS is_recurring,
                (
                  SELECT TOP 1 ra.recurring_id
                  FROM dbo.recurring_applied ra
                  WHERE ra.transaction_id = t.transaction_id
                  ORDER BY ra.applied_id DESC
                ) AS recurring_id
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
    const { subcategory_id, transaction_date, transaction_time, amount, location, paid_by_person_id, notes } = req.body;

    if (!Number.isInteger(Number(subcategory_id)) || !isIsoDate(transaction_date) ||
        !Number.isFinite(Number(amount)) || Number(amount) === 0 ||
        (transaction_time && !isIsoTime(transaction_time))) {
      return res.status(400).json({ error: "Valid subcategory, transaction date, and amount are required" });
    }

    if (dbType === "postgres") {
      const rows = await query(
        `
          INSERT INTO public.transactions (subcategory_id, transaction_date, transaction_time, amount, location, paid_by_person_id, notes)
          VALUES (@subcategory_id, @transaction_date, @transaction_time, @amount, @location, @paid_by_person_id, @notes)
          RETURNING transaction_id`,
        {
          subcategory_id: Number(subcategory_id),
          transaction_date,
          transaction_time: transaction_time || null,
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
    request.input("transaction_time", mssql.Time, transaction_time || null);
    request.input("amount", mssql.Decimal(10, 2), Number(amount));
    request.input("location", mssql.NVarChar(100), location || null);
    request.input("paid_by_person_id", mssql.Int, paid_by_person_id ? Number(paid_by_person_id) : null);
    request.input("notes", mssql.NVarChar(255), notes || null);

    const result = await request.query(`
      INSERT INTO dbo.transactions (subcategory_id, transaction_date, transaction_time, amount, location, paid_by_person_id, notes)
      OUTPUT INSERTED.transaction_id AS transaction_id
      VALUES (@subcategory_id, @transaction_date, @transaction_time, @amount, @location, @paid_by_person_id, @notes)
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
    const { subcategory_id, transaction_date, transaction_time, amount, location, paid_by_person_id, notes } = req.body;
    if (!Number.isInteger(transactionId) || !Number.isInteger(Number(subcategory_id)) ||
        !isIsoDate(transaction_date) || !Number.isFinite(Number(amount)) || Number(amount) === 0 ||
        (transaction_time && !isIsoTime(transaction_time))) {
      return res.status(400).json({ error: "Valid transaction, subcategory, date, and amount are required" });
    }

    const params = {
      transaction_id: transactionId,
      subcategory_id: Number(subcategory_id),
      transaction_date,
      transaction_time: transaction_time || null,
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
             transaction_time = @transaction_time,
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
    request.input("transaction_time", mssql.Time, params.transaction_time);
    request.input("amount", mssql.Decimal(10, 2), params.amount);
    request.input("location", mssql.NVarChar(100), params.location);
    request.input("paid_by_person_id", mssql.Int, params.paid_by_person_id);
    request.input("notes", mssql.NVarChar(255), params.notes);
    const result = await request.query(`
      UPDATE dbo.transactions
      SET subcategory_id = @subcategory_id,
          transaction_date = @transaction_date,
          transaction_time = @transaction_time,
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
      ? `SELECT pc.paycheck_id, pc.person_id, p.name AS person_name, pc.paycheck_date, pc.amount, pc.transferred_amount
         FROM public.paychecks pc
         JOIN public.people p ON p.person_id = pc.person_id
         WHERE EXTRACT(MONTH FROM pc.paycheck_date) = @month
           AND EXTRACT(YEAR FROM pc.paycheck_date) = @year
         ORDER BY pc.paycheck_date DESC, pc.paycheck_id DESC`
      : `SELECT pc.paycheck_id, pc.person_id, p.name AS person_name, pc.paycheck_date, pc.amount, pc.transferred_amount
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
    const transferredAmount = req.body.transferred_amount === undefined ? 0 : Number(req.body.transferred_amount);
    const paycheckDate = req.body.paycheck_date;
    if (!Number.isInteger(personId) || !isIsoDate(paycheckDate) || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(transferredAmount) || transferredAmount < 0) {
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
      ? `INSERT INTO public.paychecks (person_id, paycheck_date, amount, transferred_amount)
         VALUES (@person_id, @paycheck_date, @amount, @transferred_amount)
         RETURNING paycheck_id`
      : `INSERT INTO dbo.paychecks (person_id, paycheck_date, amount, transferred_amount)
         OUTPUT INSERTED.paycheck_id AS paycheck_id
         VALUES (@person_id, @paycheck_date, @amount, @transferred_amount)`;
    const rows = await query(queryText, { person_id: personId, paycheck_date: paycheckDate, amount, transferred_amount: transferredAmount });
    res.status(201).json({ paycheck_id: rows[0].paycheck_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add paycheck" });
  }
});

app.put("/paychecks/:paycheckId", async (req, res) => {
  try {
    const paycheckId = Number(req.params.paycheckId);
    const transferredAmount = Number(req.body.transferred_amount);
    if (!Number.isInteger(paycheckId) || !Number.isFinite(transferredAmount) || transferredAmount < 0) {
      return res.status(400).json({ error: "Valid paycheck and transferred amount are required" });
    }
    const queryText = dbType === "postgres"
      ? `UPDATE public.paychecks
         SET transferred_amount = @transferred_amount
         WHERE paycheck_id = @paycheck_id
         RETURNING paycheck_id`
      : `UPDATE dbo.paychecks
         SET transferred_amount = @transferred_amount
         OUTPUT INSERTED.paycheck_id AS paycheck_id
         WHERE paycheck_id = @paycheck_id`;
    const rows = await query(queryText, { paycheck_id: paycheckId, transferred_amount: transferredAmount });
    if (rows.length === 0) return res.status(404).json({ error: "Paycheck not found" });
    res.json({ paycheck_id: rows[0].paycheck_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update paycheck" });
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

app.get("/joint-payments", async (req, res) => {
  try {
    const period = readMonthYear(req, res);
    if (!period) return;
    const queryText = dbType === "postgres"
      ? `SELECT jp.joint_payment_id, jp.person_id, p.name AS person_name, jp.payment_date, jp.amount
         FROM public.joint_payments jp
         JOIN public.people p ON p.person_id = jp.person_id
         WHERE EXTRACT(MONTH FROM jp.payment_date) = @month
           AND EXTRACT(YEAR FROM jp.payment_date) = @year
         ORDER BY jp.payment_date DESC, jp.joint_payment_id DESC`
      : `SELECT jp.joint_payment_id, jp.person_id, p.name AS person_name, jp.payment_date, jp.amount
         FROM dbo.joint_payments jp
         JOIN dbo.people p ON p.person_id = jp.person_id
         WHERE MONTH(jp.payment_date) = @month AND YEAR(jp.payment_date) = @year
         ORDER BY jp.payment_date DESC, jp.joint_payment_id DESC`;
    const rows = await query(queryText, period);
    res.json(rows.map(row => ({ ...row, payment_date: serializeDate(row.payment_date), amount: Number(row.amount) })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch joint payments" });
  }
});

app.post("/joint-payments", async (req, res) => {
  try {
    const personId = Number(req.body.person_id);
    const paymentDate = req.body.payment_date;
    const amount = Number(req.body.amount);
    if (!Number.isInteger(personId) || !isIsoDate(paymentDate) || !Number.isFinite(amount) || amount === 0) {
      return res.status(400).json({ error: "Valid person, payment date, and non-zero amount are required" });
    }

    const prefix = dbType === "postgres" ? "public" : "dbo";
    const householdPredicate = dbType === "postgres" ? "is_household = TRUE" : "is_household = 1";
    const people = await query(
      `SELECT person_id FROM ${prefix}.people
       WHERE person_id = @person_id AND ${householdPredicate} AND LOWER(name) <> 'joint'`,
      { person_id: personId }
    );
    if (people.length === 0) {
      return res.status(400).json({ error: "Choose a household member other than the joint account" });
    }

    const queryText = dbType === "postgres"
      ? `INSERT INTO public.joint_payments (person_id, payment_date, amount)
         VALUES (@person_id, @payment_date, @amount)
         RETURNING joint_payment_id`
      : `INSERT INTO dbo.joint_payments (person_id, payment_date, amount)
         OUTPUT INSERTED.joint_payment_id AS joint_payment_id
         VALUES (@person_id, @payment_date, @amount)`;
    const rows = await query(queryText, { person_id: personId, payment_date: paymentDate, amount });
    res.status(201).json({ joint_payment_id: rows[0].joint_payment_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add joint payment" });
  }
});

app.delete("/joint-payments/:jointPaymentId", async (req, res) => {
  try {
    const jointPaymentId = Number(req.params.jointPaymentId);
    if (!Number.isInteger(jointPaymentId)) {
      return res.status(400).json({ error: "A valid joint payment ID is required" });
    }
    const queryText = dbType === "postgres"
      ? `DELETE FROM public.joint_payments
         WHERE joint_payment_id = @joint_payment_id
         RETURNING joint_payment_id`
      : `DELETE FROM dbo.joint_payments
         OUTPUT DELETED.joint_payment_id AS joint_payment_id
         WHERE joint_payment_id = @joint_payment_id`;
    const rows = await query(queryText, { joint_payment_id: jointPaymentId });
    if (rows.length === 0) return res.status(404).json({ error: "Joint payment not found" });
    res.json({ joint_payment_id: rows[0].joint_payment_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete joint payment" });
  }
});

app.get("/contributions", async (req, res) => {
  try {
    const period = readMonthYear(req, res);
    if (!period) return;
    const asOfDate = currentIsoDate();
    const prefix = dbType === "postgres" ? "public" : "dbo";
    const monthExpression = column => dbType === "postgres"
      ? `EXTRACT(MONTH FROM ${column}) = @month AND EXTRACT(YEAR FROM ${column}) = @year`
      : `MONTH(${column}) = @month AND YEAR(${column}) = @year`;

    const [income, extraIncome, paychecks, jointPayments, personalExpenses, lastJointPayments, plannedRows] = await Promise.all([
      loadIncomeConfiguration(period.month, period.year),
      query(
        `SELECT person_id, SUM(amount) AS amount
         FROM ${prefix}.extra_income
         WHERE month = @month AND year = @year
         GROUP BY person_id`,
        period
      ),
      query(
        `SELECT person_id, paycheck_date, transferred_amount, created_at
         FROM ${prefix}.paychecks
         WHERE ${monthExpression("paycheck_date")}`,
        period
      ),
      query(
        `SELECT person_id, payment_date, amount, created_at
         FROM ${prefix}.joint_payments
         WHERE ${monthExpression("payment_date")}`,
        period
      ),
      query(
        `SELECT tx.paid_by_person_id AS person_id,
                tx.transaction_date,
                tx.amount,
                tx.created_at,
                c.name AS category,
                sc.name AS subcategory,
                tx.location
         FROM ${prefix}.transactions tx
         LEFT JOIN ${prefix}.subcategories sc ON sc.subcategory_id = tx.subcategory_id
         LEFT JOIN ${prefix}.categories c ON c.category_id = sc.category_id
         WHERE tx.paid_by_person_id IS NOT NULL AND tx.transaction_date <= @as_of_date`,
        { as_of_date: asOfDate }
      ),
      query(
        `SELECT person_id, payment_date AS last_payment_date, created_at AS last_payment_at, joint_payment_id AS event_id
         FROM (
           SELECT person_id, payment_date, created_at, joint_payment_id
           FROM ${prefix}.joint_payments
           WHERE amount >= 0 AND payment_date <= @as_of_date

           UNION ALL

           SELECT person_id, paycheck_date AS payment_date, created_at, paycheck_id AS joint_payment_id
           FROM ${prefix}.paychecks
           WHERE transferred_amount > 0 AND paycheck_date <= @as_of_date
         ) payment_events`,
        { as_of_date: asOfDate }
      ),
      query(
        `SELECT COALESCE(SUM(
           CASE
             WHEN LOWER(COALESCE(sc.name, '')) = @personal_expenses_name THEN 0
             ELSE COALESCE(bl.projected_amount, 0)
           END
         ), 0) AS planned_expenses
         FROM ${prefix}.budget_periods bp
         LEFT JOIN ${prefix}.budget_lines bl ON bl.period_id = bp.period_id
         LEFT JOIN ${prefix}.subcategories sc ON sc.subcategory_id = bl.subcategory_id
         WHERE bp.month = @month AND bp.year = @year`,
        { ...period, personal_expenses_name: "personal expenses" }
      ),
    ]);

    res.json(calculateContributionSummary({
      people: income.people,
      incomeConfig: income.config,
      extraIncome,
      paychecks,
      jointPayments,
      lastJointPayments,
      personalExpenses,
      plannedExpenses: plannedRows[0]?.planned_expenses || 0,
      month: period.month,
      year: period.year,
      asOfDate,
    }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to calculate contributions" });
  }
});

app.get("/income-config", async (req, res) => {
  try {
    const period = readMonthYear(req, res);
    if (!period) return;
    const income = await loadIncomeConfiguration(period.month, period.year);
    res.json(income.config);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch income config" });
  }
});

app.put("/income-config/:personId", async (req, res) => {
  try {
    const personId = Number(req.params.personId);
    const month = Number(req.body.month);
    const year = Number(req.body.year);
    const amount = Number(req.body.biweekly_amount);
    const paydayAnchor = req.body.payday_anchor || null;
    if (!Number.isInteger(personId) || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) ||
        !Number.isFinite(amount) || amount < 0 || (paydayAnchor !== null && !isIsoDate(paydayAnchor))) {
      return res.status(400).json({ error: "Valid person, month, year, non-negative amount, and payday anchor are required" });
    }
    const queryText = dbType === "postgres"
      ? `INSERT INTO public.monthly_income_config (person_id, month, year, biweekly_amount, payday_anchor)
         VALUES (@person_id, @month, @year, @amount, @payday_anchor)
         ON CONFLICT (person_id, month, year) DO UPDATE
         SET biweekly_amount = EXCLUDED.biweekly_amount,
             payday_anchor = COALESCE(EXCLUDED.payday_anchor, public.monthly_income_config.payday_anchor)
         RETURNING person_id, month, year, biweekly_amount, payday_anchor`
      : `MERGE dbo.monthly_income_config AS target
         USING (SELECT @person_id AS person_id, @month AS month, @year AS year, @amount AS biweekly_amount, @payday_anchor AS payday_anchor) AS source
         ON target.person_id = source.person_id AND target.month = source.month AND target.year = source.year
         WHEN MATCHED THEN UPDATE SET biweekly_amount = source.biweekly_amount, payday_anchor = COALESCE(source.payday_anchor, target.payday_anchor)
         WHEN NOT MATCHED THEN INSERT (person_id, month, year, biweekly_amount, payday_anchor) VALUES (source.person_id, source.month, source.year, source.biweekly_amount, source.payday_anchor);
         SELECT person_id, month, year, biweekly_amount, payday_anchor FROM dbo.monthly_income_config
         WHERE person_id = @person_id AND month = @month AND year = @year`;
    const rows = await query(queryText, { person_id: personId, month, year, amount, payday_anchor: paydayAnchor });
    res.json({
      person_id: personId,
      month,
      year,
      biweekly_amount: Number(rows[0].biweekly_amount),
      payday_anchor: serializeDate(rows[0].payday_anchor),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to save income config" });
  }
});

app.get("/income-summary", async (req, res) => {
  try {
    const year = Number(req.query.year);
    if (!Number.isInteger(year)) {
      return res.status(400).json({ error: "A valid year is required" });
    }
    const prefix = dbType === "postgres" ? "public" : "dbo";
    const [income, extraIncome] = await Promise.all([
      loadIncomeConfiguration(12, year),
      query(
        `SELECT person_id, month, year, SUM(amount) AS amount
         FROM ${prefix}.extra_income
         WHERE year = @year
         GROUP BY person_id, month, year`,
        { year }
      ),
    ]);
    res.json(buildIncomeYearSummary({
      people: income.people,
      defaults: income.defaults,
      records: income.records,
      extraIncome,
      year,
    }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch income summary" });
  }
});

app.get("/extra-income", async (req, res) => {
  try {
    const period = readMonthYear(req, res);
    if (!period) return;
    const prefix = dbType === "postgres" ? "public" : "dbo";
    const householdPredicate = dbType === "postgres" ? "is_household = TRUE" : "is_household = 1";
    const rows = await query(
      `SELECT ei.extra_income_id, ei.person_id, p.name AS person_name,
              ei.month, ei.year, ei.amount, ei.description
       FROM ${prefix}.extra_income ei
       JOIN ${prefix}.people p ON p.person_id = ei.person_id
       WHERE ei.month = @month AND ei.year = @year
         AND ${householdPredicate.replace("is_household", "p.is_household")}
       ORDER BY ei.extra_income_id`,
      period
    );
    res.json(rows.map(row => ({ ...row, amount: Number(row.amount) })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch extra income" });
  }
});

app.post("/extra-income", async (req, res) => {
  try {
    const personId = Number(req.body.person_id);
    const month = Number(req.body.month);
    const year = Number(req.body.year);
    const amount = Number(req.body.amount);
    const description = req.body.description?.trim() || null;
    if (!Number.isInteger(personId) || !Number.isInteger(month) || month < 1 || month > 12 ||
        !Number.isInteger(year) || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Valid person, month, year, and positive amount are required" });
    }
    const queryText = dbType === "postgres"
      ? `INSERT INTO public.extra_income (person_id, month, year, amount, description)
         VALUES (@person_id, @month, @year, @amount, @description)
         RETURNING extra_income_id`
      : `INSERT INTO dbo.extra_income (person_id, month, year, amount, description)
         OUTPUT INSERTED.extra_income_id AS extra_income_id
         VALUES (@person_id, @month, @year, @amount, @description)`;
    const rows = await query(queryText, { person_id: personId, month, year, amount, description });
    res.status(201).json({ extra_income_id: rows[0].extra_income_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add extra income" });
  }
});

app.delete("/extra-income/:extraIncomeId", async (req, res) => {
  try {
    const extraIncomeId = Number(req.params.extraIncomeId);
    if (!Number.isInteger(extraIncomeId)) {
      return res.status(400).json({ error: "A valid extra income ID is required" });
    }
    const queryText = dbType === "postgres"
      ? "DELETE FROM public.extra_income WHERE extra_income_id = @extra_income_id RETURNING extra_income_id"
      : "DELETE FROM dbo.extra_income OUTPUT DELETED.extra_income_id AS extra_income_id WHERE extra_income_id = @extra_income_id";
    const rows = await query(queryText, { extra_income_id: extraIncomeId });
    if (!rows?.length) return res.status(404).json({ error: "Extra income not found" });
    res.json({ extra_income_id: rows[0].extra_income_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete extra income" });
  }
});

app.get("/summary/monthly", async (req, res) => {
  try {
    const requestedYear = Number(req.query.year);
    if (!Number.isInteger(requestedYear)) {
      return res.status(400).json({ error: "year is required" });
    }

    const trackedRange = getTrackedMonthRangeForYear(requestedYear);
    if (!trackedRange) {
      return res.json([]);
    }

    const queryText = dbType === "postgres"
      ? `SELECT EXTRACT(MONTH FROM transaction_date) AS month, SUM(amount) AS total
         FROM public.transactions
         WHERE EXTRACT(YEAR FROM transaction_date) = @year
           AND EXTRACT(MONTH FROM transaction_date) >= @start_month
           AND EXTRACT(MONTH FROM transaction_date) <= @end_month
         GROUP BY EXTRACT(MONTH FROM transaction_date)
         ORDER BY month`
      : `SELECT MONTH(transaction_date) AS month, SUM(amount) AS total
         FROM dbo.transactions
         WHERE YEAR(transaction_date) = @year
           AND MONTH(transaction_date) >= @start_month
           AND MONTH(transaction_date) <= @end_month
         GROUP BY MONTH(transaction_date)
         ORDER BY month`;

    const rows = await query(queryText, {
      year: requestedYear,
      start_month: trackedRange.startMonth,
      end_month: trackedRange.endMonth,
    });
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch monthly summary" });
  }
});

// ────────── RECURRING TRANSACTIONS ──────────

app.get("/recurring-transactions", async (req, res) => {
  try {
    const prefix = dbType === "postgres" ? "public" : "dbo";
    const rows = await query(
      `SELECT rt.recurring_id, rt.subcategory_id, sc.name AS subcategory,
              c.name AS category, rt.amount, rt.location,
              rt.paid_by_person_id, p.name AS paid_by,
              rt.notes, rt.day_of_month, rt.is_active
       FROM ${prefix}.recurring_transactions rt
       JOIN ${prefix}.subcategories sc ON sc.subcategory_id = rt.subcategory_id
       JOIN ${prefix}.categories c ON c.category_id = sc.category_id
       LEFT JOIN ${prefix}.people p ON p.person_id = rt.paid_by_person_id
       WHERE rt.is_active = ${dbType === "postgres" ? "TRUE" : "1"}
       ORDER BY c.display_order, sc.display_order, rt.recurring_id`
    );
    res.json(rows.map(row => ({ ...row, amount: Number(row.amount), day_of_month: Number(row.day_of_month) })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch recurring transactions" });
  }
});

app.get("/recurring-transactions/pending", async (req, res) => {
  try {
    const period = readMonthYear(req, res);
    if (!period) return;
    const prefix = dbType === "postgres" ? "public" : "dbo";
    const isActiveExpr = dbType === "postgres" ? "rt.is_active = TRUE" : "rt.is_active = 1";
    const rows = await query(
      `SELECT COUNT(*) AS pending
       FROM ${prefix}.recurring_transactions rt
       WHERE ${isActiveExpr}
         AND NOT EXISTS (
           SELECT 1 FROM ${prefix}.recurring_applied ra
           WHERE ra.recurring_id = rt.recurring_id
             AND ra.month = @month AND ra.year = @year
         )`,
      period
    );
    res.json({ pending: Number(rows[0]?.pending ?? 0) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch pending recurring count" });
  }
});

app.post("/recurring-transactions", async (req, res) => {
  try {
    const { subcategory_id, amount, location, paid_by_person_id, notes, day_of_month } = req.body;
    if (!Number.isInteger(Number(subcategory_id)) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Valid subcategory and positive amount are required" });
    }
    const day = Math.min(Math.max(Number.isInteger(Number(day_of_month)) ? Number(day_of_month) : 1, 1), 31);
    const queryText = dbType === "postgres"
      ? `INSERT INTO public.recurring_transactions (subcategory_id, amount, location, paid_by_person_id, notes, day_of_month)
         VALUES (@subcategory_id, @amount, @location, @paid_by_person_id, @notes, @day_of_month)
         RETURNING recurring_id`
      : `INSERT INTO dbo.recurring_transactions (subcategory_id, amount, location, paid_by_person_id, notes, day_of_month)
         OUTPUT INSERTED.recurring_id AS recurring_id
         VALUES (@subcategory_id, @amount, @location, @paid_by_person_id, @notes, @day_of_month)`;
    const rows = await query(queryText, {
      subcategory_id: Number(subcategory_id), amount: Number(amount),
      location: location?.trim() || null, paid_by_person_id: paid_by_person_id ? Number(paid_by_person_id) : null,
      notes: notes?.trim() || null, day_of_month: day,
    });
    res.status(201).json({ recurring_id: rows[0].recurring_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create recurring transaction" });
  }
});

app.put("/recurring-transactions/:recurringId", async (req, res) => {
  try {
    const recurringId = Number(req.params.recurringId);
    const { amount, location, paid_by_person_id, notes, day_of_month } = req.body;
    if (!Number.isInteger(recurringId) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Valid recurring ID and positive amount are required" });
    }
    const day = Math.min(Math.max(Number.isInteger(Number(day_of_month)) ? Number(day_of_month) : 1, 1), 31);
    // Only updates the template; previously created transactions are intentionally untouched
    const queryText = dbType === "postgres"
      ? `UPDATE public.recurring_transactions
         SET amount = @amount, location = @location, paid_by_person_id = @paid_by_person_id,
             notes = @notes, day_of_month = @day_of_month
         WHERE recurring_id = @recurring_id
         RETURNING recurring_id`
      : `UPDATE dbo.recurring_transactions
         SET amount = @amount, location = @location, paid_by_person_id = @paid_by_person_id,
             notes = @notes, day_of_month = @day_of_month
         OUTPUT INSERTED.recurring_id AS recurring_id
         WHERE recurring_id = @recurring_id`;
    const rows = await query(queryText, {
      recurring_id: recurringId, amount: Number(amount),
      location: location?.trim() || null, paid_by_person_id: paid_by_person_id ? Number(paid_by_person_id) : null,
      notes: notes?.trim() || null, day_of_month: day,
    });
    if (!rows?.length) return res.status(404).json({ error: "Recurring transaction not found" });
    res.json({ recurring_id: rows[0].recurring_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update recurring transaction" });
  }
});

app.delete("/recurring-transactions/:recurringId", async (req, res) => {
  try {
    const recurringId = Number(req.params.recurringId);
    if (!Number.isInteger(recurringId)) {
      return res.status(400).json({ error: "A valid recurring transaction ID is required" });
    }
    // Soft-delete preserves history of applied transactions
    const queryText = dbType === "postgres"
      ? `UPDATE public.recurring_transactions SET is_active = FALSE WHERE recurring_id = @recurring_id RETURNING recurring_id`
      : `UPDATE dbo.recurring_transactions SET is_active = 0 OUTPUT INSERTED.recurring_id AS recurring_id WHERE recurring_id = @recurring_id`;
    const rows = await query(queryText, { recurring_id: recurringId });
    if (!rows?.length) return res.status(404).json({ error: "Recurring transaction not found" });
    res.json({ recurring_id: rows[0].recurring_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete recurring transaction" });
  }
});

app.post("/recurring-transactions/apply", async (req, res) => {
  try {
    const month = Number(req.body.month);
    const year = Number(req.body.year);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
      return res.status(400).json({ error: "A valid month and year are required" });
    }
    const prefix = dbType === "postgres" ? "public" : "dbo";
    const isActiveExpr = dbType === "postgres" ? "is_active = TRUE" : "is_active = 1";
    const pending = await query(
      `SELECT rt.recurring_id, rt.subcategory_id, rt.amount, rt.location,
              rt.paid_by_person_id, rt.notes, rt.day_of_month
       FROM ${prefix}.recurring_transactions rt
       WHERE ${isActiveExpr}
         AND NOT EXISTS (
           SELECT 1 FROM ${prefix}.recurring_applied ra
           WHERE ra.recurring_id = rt.recurring_id
             AND ra.month = @month AND ra.year = @year
         )`,
      { month, year }
    );

    const daysInMonth = new Date(year, month, 0).getDate();
    const created = [];

    for (const rt of pending) {
      const day = Math.min(Number(rt.day_of_month), daysInMonth);
      const transactionDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      if (dbType === "postgres") {
        const txRows = await query(
          `INSERT INTO public.transactions (subcategory_id, transaction_date, amount, location, paid_by_person_id, notes)
           VALUES (@subcategory_id, @transaction_date, @amount, @location, @paid_by_person_id, @notes)
           RETURNING transaction_id`,
          { subcategory_id: Number(rt.subcategory_id), transaction_date: transactionDate, amount: Number(rt.amount), location: rt.location || null, paid_by_person_id: rt.paid_by_person_id ? Number(rt.paid_by_person_id) : null, notes: rt.notes || null }
        );
        await query(
          `INSERT INTO public.recurring_applied (recurring_id, month, year, transaction_id)
           VALUES (@recurring_id, @month, @year, @transaction_id)
           ON CONFLICT (recurring_id, month, year) DO NOTHING`,
          { recurring_id: Number(rt.recurring_id), month, year, transaction_id: txRows[0].transaction_id }
        );
        created.push(txRows[0].transaction_id);
      } else {
        const txRows = await query(
          `INSERT INTO dbo.transactions (subcategory_id, transaction_date, amount, location, paid_by_person_id, notes)
           OUTPUT INSERTED.transaction_id AS transaction_id
           VALUES (@subcategory_id, @transaction_date, @amount, @location, @paid_by_person_id, @notes)`,
          { subcategory_id: Number(rt.subcategory_id), transaction_date: transactionDate, amount: Number(rt.amount), location: rt.location || null, paid_by_person_id: rt.paid_by_person_id ? Number(rt.paid_by_person_id) : null, notes: rt.notes || null }
        );
        await query(
          `IF NOT EXISTS (SELECT 1 FROM dbo.recurring_applied WHERE recurring_id = @recurring_id AND month = @month AND year = @year)
           INSERT INTO dbo.recurring_applied (recurring_id, month, year, transaction_id) VALUES (@recurring_id, @month, @year, @transaction_id)`,
          { recurring_id: Number(rt.recurring_id), month, year, transaction_id: txRows[0].transaction_id }
        );
        created.push(txRows[0].transaction_id);
      }
    }

    res.json({ applied: created.length, transactions_created: created });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to apply recurring transactions" });
  }
});

app.get("/summary/ytd", async (req, res) => {
  try {
    const requestedYear = Number(req.query.year);
    if (!Number.isInteger(requestedYear)) {
      return res.status(400).json({ error: "A valid year is required" });
    }

    const trackedRange = getTrackedMonthRangeForYear(requestedYear);
    if (!trackedRange) {
      return res.json({
        year: requestedYear,
        months_elapsed: 0,
        category_averages: [],
        monthly_variance: [],
      });
    }

    const monthRows = trackedRange.months.map(month => `(${month})`).join(", ");

    const categoryQuery = dbType === "postgres"
      ? `SELECT c.category_id, c.name AS category,
                COALESCE(SUM(t.amount), 0) AS total,
                COALESCE(SUM(t.amount), 0) / @months_count AS monthly_average
         FROM public.categories c
         LEFT JOIN public.subcategories sc ON sc.category_id = c.category_id
         LEFT JOIN public.transactions t
           ON t.subcategory_id = sc.subcategory_id
          AND EXTRACT(YEAR FROM t.transaction_date) = @year
          AND EXTRACT(MONTH FROM t.transaction_date) >= @start_month
          AND EXTRACT(MONTH FROM t.transaction_date) <= @end_month
         GROUP BY c.category_id, c.name, c.display_order
         ORDER BY total DESC, c.display_order`
      : `SELECT c.category_id, c.name AS category,
                COALESCE(SUM(t.amount), 0) AS total,
                COALESCE(SUM(t.amount), 0) / @months_count AS monthly_average
         FROM dbo.categories c
         LEFT JOIN dbo.subcategories sc ON sc.category_id = c.category_id
         LEFT JOIN dbo.transactions t
           ON t.subcategory_id = sc.subcategory_id
          AND YEAR(t.transaction_date) = @year
          AND MONTH(t.transaction_date) >= @start_month
          AND MONTH(t.transaction_date) <= @end_month
         GROUP BY c.category_id, c.name, c.display_order
         ORDER BY total DESC, c.display_order`;

    const varianceQuery = dbType === "postgres"
      ? `WITH months(month) AS (VALUES ${monthRows}),
           actuals AS (
             SELECT EXTRACT(MONTH FROM transaction_date) AS month, SUM(amount) AS actual
             FROM public.transactions
             WHERE EXTRACT(YEAR FROM transaction_date) = @year
               AND EXTRACT(MONTH FROM transaction_date) >= @start_month
               AND EXTRACT(MONTH FROM transaction_date) <= @end_month
             GROUP BY EXTRACT(MONTH FROM transaction_date)
           ),
           plans AS (
             SELECT bp.month, SUM(bl.projected_amount) AS planned
             FROM public.budget_periods bp
             JOIN public.budget_lines bl ON bl.period_id = bp.period_id
             WHERE bp.year = @year
               AND bp.month >= @start_month
               AND bp.month <= @end_month
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
               AND MONTH(transaction_date) >= @start_month
               AND MONTH(transaction_date) <= @end_month
             GROUP BY MONTH(transaction_date)
           ),
           plans AS (
             SELECT bp.month, SUM(bl.projected_amount) AS planned
             FROM dbo.budget_periods bp
             JOIN dbo.budget_lines bl ON bl.period_id = bp.period_id
             WHERE bp.year = @year
               AND bp.month >= @start_month
               AND bp.month <= @end_month
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

    const params = {
      year: requestedYear,
      start_month: trackedRange.startMonth,
      end_month: trackedRange.endMonth,
      months_count: trackedRange.months.length,
    };
    const [categoryAverages, monthlyVariance] = await Promise.all([
      query(categoryQuery, params),
      query(varianceQuery, params),
    ]);

    res.json({
      year: requestedYear,
      months_elapsed: trackedRange.months.length,
      category_averages: categoryAverages,
      monthly_variance: monthlyVariance,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch YTD summary" });
  }
});

function getTrackedMonthRangeForYear(year) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < INCOME_TRACKING_START_YEAR || year > currentYear) {
    return null;
  }

  const startMonth = year === INCOME_TRACKING_START_YEAR ? INCOME_TRACKING_START_MONTH : 1;
  const endMonth = year === currentYear ? currentMonth : 12;
  if (endMonth < startMonth) {
    return null;
  }

  const months = Array.from({ length: endMonth - startMonth + 1 }, (_, index) => startMonth + index);
  return {
    startMonth,
    endMonth,
    months,
  };
}

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
