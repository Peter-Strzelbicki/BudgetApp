require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

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

app.get("/budget-lines", async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: "month and year are required" });
    }

    const queryText = dbType === "postgres"
      ? `SELECT bl.subcategory_id, sc.name AS subcategory, c.name AS category,
               bl.projected_amount, bl.actual_amount
         FROM public.budget_lines bl
         JOIN public.subcategories sc ON sc.subcategory_id = bl.subcategory_id
         JOIN public.categories c ON c.category_id = sc.category_id
         JOIN public.budget_periods bp ON bp.period_id = bl.period_id
         WHERE bp.month = @month AND bp.year = @year`
      : `SELECT bl.subcategory_id, sc.name AS subcategory, c.name AS category,
               bl.projected_amount, bl.actual_amount
         FROM dbo.budget_lines bl
         JOIN dbo.subcategories sc ON sc.subcategory_id = bl.subcategory_id
         JOIN dbo.categories c ON c.category_id = sc.category_id
         JOIN dbo.budget_periods bp ON bp.period_id = bl.period_id
         WHERE bp.month = @month AND bp.year = @year`;

    const rows = await query(queryText, { month: Number(month), year: Number(year) });
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch budget lines" });
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
         WHERE year = @year`
      : `SELECT goal_id, year, description
         FROM dbo.goals
         WHERE year = @year`;

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

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
