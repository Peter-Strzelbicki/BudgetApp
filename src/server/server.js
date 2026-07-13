require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: true }
});

app.get("/", (req, res) => {
  res.send("Budget API running");
});

app.get("/test-db", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT NOW() AS time");
    res.json(rows);
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
  }
});

// ---------- TRANSACTIONS ----------

// GET /transactions?month=7&year=2026
app.get("/transactions", async (req, res) => {
  try {
    const { month, year } = req.query;
    let query = `
      SELECT t.transaction_id, t.transaction_date, t.amount, t.location, t.notes,
             sc.name AS subcategory, c.name AS category, p.name AS paid_by
      FROM transactions t
      JOIN subcategories sc ON sc.subcategory_id = t.subcategory_id
      JOIN categories c ON c.category_id = sc.category_id
      LEFT JOIN people p ON p.person_id = t.paid_by_person_id
    `;
    const params = [];
    if (month && year) {
      query += " WHERE MONTH(t.transaction_date) = ? AND YEAR(t.transaction_date) = ?";
      params.push(month, year);
    }
    query += " ORDER BY t.transaction_date DESC";

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// POST /transactions  (used by add-transaction.tsx)
app.post("/transactions", async (req, res) => {
  try {
    const { subcategory_id, transaction_date, amount, location, paid_by_person_id, notes } = req.body;

    if (!subcategory_id || !transaction_date || !amount) {
      return res.status(400).json({ error: "subcategory_id, transaction_date, and amount are required" });
    }

    const [result] = await db.query(
      `INSERT INTO transactions (subcategory_id, transaction_date, amount, location, paid_by_person_id, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [subcategory_id, transaction_date, amount, location || null, paid_by_person_id || null, notes || null]
    );

    res.status(201).json({ transaction_id: result.insertId });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to add transaction" });
  }
});

// ---------- BUDGET SUMMARY (for your homepage chart) ----------

// GET /summary/monthly?year=2026 -> one row per month with total spend
app.get("/summary/monthly", async (req, res) => {
  try {
    const { year } = req.query;
    const [rows] = await db.query(
      `SELECT MONTH(transaction_date) AS month, SUM(amount) AS total
       FROM transactions
       WHERE YEAR(transaction_date) = ?
       GROUP BY MONTH(transaction_date)
       ORDER BY month`,
      [year]
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
    const [rows] = await db.query(
      `SELECT bl.subcategory_id, sc.name AS subcategory, c.name AS category,
              bl.projected_amount, bl.actual_amount
       FROM budget_lines bl
       JOIN subcategories sc ON sc.subcategory_id = bl.subcategory_id
       JOIN categories c ON c.category_id = sc.category_id
       JOIN budget_periods bp ON bp.period_id = bl.period_id
       WHERE bp.month = ? AND bp.year = ?`,
      [month, year]
    );
    res.json(rows);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch budget lines" });
  }
});

// ---------- GOALS ----------

app.get("/goals", async (req, res) => {
  try {
    const { year } = req.query;
    const [rows] = await db.query("SELECT * FROM goals WHERE year = ?", [year]);
    res.json(rows);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch goals" });
  }
});

app.post("/goals", async (req, res) => {
  try {
    const { year, description } = req.body;
    const [result] = await db.query(
      "INSERT INTO goals (year, description) VALUES (?, ?)",
      [year, description]
    );
    res.status(201).json({ goal_id: result.insertId });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to add goal" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});