require("dotenv").config();

const express = require("express");
const sql = require("mssql");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

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

const pool = new sql.ConnectionPool(poolConfig);

let dbConnected = false;

async function getDb() {
  if (!dbConnected) {
    await pool.connect();
    dbConnected = true;
  }
  return pool;
}

async function query(sqlText, params = {}) {
  const db = await getDb();
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
    const rows = await query("SELECT GETDATE() AS time");
    res.json(rows);
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
  }
});

// ---------- TRANSACTIONS ----------
app.get("/transactions", async (req, res) => {
  try {
    const { month, year } = req.query;
    let queryText = `
      SELECT t.transaction_id, t.transaction_date, t.amount, t.location, t.notes,
             sc.name AS subcategory, c.name AS category, p.name AS paid_by
      FROM dbo.transactions t
      JOIN dbo.subcategories sc ON sc.subcategory_id = t.subcategory_id
      JOIN dbo.categories c ON c.category_id = sc.category_id
      LEFT JOIN dbo.people p ON p.person_id = t.paid_by_person_id
    `;
    const params = {};
    if (month && year) {
      queryText += " WHERE MONTH(t.transaction_date) = @month AND YEAR(t.transaction_date) = @year";
      params.month = Number(month);
      params.year = Number(year);
    }
    queryText += " ORDER BY t.transaction_date DESC";

    const rows = await query(queryText, params);
    res.json(rows);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

app.post("/transactions", async (req, res) => {
  try {
    const { subcategory_id, transaction_date, amount, location, paid_by_person_id, notes } = req.body;

    if (!subcategory_id || !transaction_date || !amount) {
      return res.status(400).json({ error: "subcategory_id, transaction_date, and amount are required" });
    }

    const db = await getDb();
    const request = db.request();
    request.input("subcategory_id", sql.Int, Number(subcategory_id));
    request.input("transaction_date", sql.Date, transaction_date);
    request.input("amount", sql.Decimal(10, 2), Number(amount));
    request.input("location", sql.NVarChar(100), location || null);
    request.input("paid_by_person_id", sql.Int, paid_by_person_id ? Number(paid_by_person_id) : null);
    request.input("notes", sql.NVarChar(255), notes || null);

    const result = await request.query(`
      INSERT INTO dbo.transactions (subcategory_id, transaction_date, amount, location, paid_by_person_id, notes)
      OUTPUT INSERTED.transaction_id AS transaction_id
      VALUES (@subcategory_id, @transaction_date, @amount, @location, @paid_by_person_id, @notes)
    `);

    res.status(201).json({ transaction_id: result.recordset[0].transaction_id });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to add transaction" });
  }
});

// ---------- BUDGET SUMMARY ----------
app.get("/summary/monthly", async (req, res) => {
  try {
    const { year } = req.query;
    const rows = await query(
      `SELECT MONTH(transaction_date) AS month, SUM(amount) AS total
       FROM dbo.transactions
       WHERE YEAR(transaction_date) = @year
       GROUP BY MONTH(transaction_date)
       ORDER BY month`,
      { year: Number(year) }
    );
    res.json(rows);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch monthly summary" });
  }
});

// ---------- BUDGET LINES ----------
app.get("/budget-lines", async (req, res) => {
  try {
    const { month, year } = req.query;
    const rows = await query(
      `SELECT bl.subcategory_id, sc.name AS subcategory, c.name AS category,
              bl.projected_amount, bl.actual_amount
       FROM dbo.budget_lines bl
       JOIN dbo.subcategories sc ON sc.subcategory_id = bl.subcategory_id
       JOIN dbo.categories c ON c.category_id = sc.category_id
       JOIN dbo.budget_periods bp ON bp.period_id = bl.period_id
       WHERE bp.month = @month AND bp.year = @year`,
      { month: Number(month), year: Number(year) }
    );
    res.json(rows);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch budget lines" });
  }
});

// ---------- CATEGORIES & SUBCATEGORIES ----------
app.get("/categories", async (req, res) => {
  try {
    const rows = await query(`
      SELECT c.category_id, c.name, c.display_order
      FROM dbo.categories c
      ORDER BY c.display_order
    `);
    res.json(rows);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

app.get("/subcategories", async (req, res) => {
  try {
    const { category_id } = req.query;
    let queryText = `
      SELECT sc.subcategory_id, sc.category_id, sc.name, sc.display_order
      FROM dbo.subcategories sc
    `;
    const params = {};
    if (category_id) {
      queryText += " WHERE sc.category_id = @category_id";
      params.category_id = Number(category_id);
    }
    queryText += " ORDER BY sc.display_order";

    const rows = await query(queryText, params);
    res.json(rows);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch subcategories" });
  }
});

// ---------- PEOPLE ----------
app.get("/people", async (req, res) => {
  try {
    const rows = await query(`
      SELECT person_id, name, is_household
      FROM dbo.people
      WHERE is_household = 1
      ORDER BY name
    `);
    res.json(rows);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch people" });
  }
});

// ---------- GOALS ----------
app.get("/goals", async (req, res) => {
  try {
    const { year } = req.query;
    const rows = await query("SELECT * FROM dbo.goals WHERE year = @year", { year: Number(year) });
    res.json(rows);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch goals" });
  }
});

app.post("/goals", async (req, res) => {
  try {
    const { year, description } = req.body;
    const db = await getDb();
    const request = db.request();
    request.input("year", sql.SmallInt, Number(year));
    request.input("description", sql.NVarChar(255), description);
    const result = await request.query(`
      INSERT INTO dbo.goals (year, description)
      OUTPUT INSERTED.goal_id AS goal_id
      VALUES (@year, @description)
    `);
    res.status(201).json({ goal_id: result.recordset[0].goal_id });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to add goal" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});