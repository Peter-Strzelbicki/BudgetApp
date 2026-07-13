-- =====================================================================
-- HOME BUDGET DATABASE SCHEMA
-- Modeled from Home_Budget.xlsx (monthly tabs: Housing, Transportation,
-- Insurance, Entertainment/Subscriptions, Food, Koda/Peaches, Personal/
-- Home Care, Savings/Investments, Travel — each with Projected vs Actual
-- totals and an itemized Date/Price/Location/Paid-by transaction log)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PEOPLE
-- Household members who earn income and/or pay expenses (Peter, Sailah,
-- plus "Joint" / "Both" as a pseudo-person for shared payments)
-- ---------------------------------------------------------------------
CREATE TABLE people (
    person_id       SERIAL PRIMARY KEY,
    name            VARCHAR(50) NOT NULL UNIQUE,   -- 'Peter', 'Sailah', 'Joint'
    is_household    BOOLEAN NOT NULL DEFAULT TRUE   -- FALSE for a placeholder like 'Joint' if you'd rather flag it
);

-- ---------------------------------------------------------------------
-- 2. CATEGORIES
-- The top-level budget sections in each monthly tab
-- ---------------------------------------------------------------------
CREATE TABLE categories (
    category_id     SERIAL PRIMARY KEY,
    name            VARCHAR(50) NOT NULL UNIQUE,    -- 'Housing', 'Transportation', 'Insurance',
                                                      -- 'Entertainment/Subscriptions', 'Food',
                                                      -- 'Koda/Peaches', 'Personal/Home Care',
                                                      -- 'Savings/Investments', 'Travel'
    display_order   SMALLINT
);

-- ---------------------------------------------------------------------
-- 3. SUBCATEGORIES
-- The line items within each category (Mortgage, Fuel, Groceries, etc.)
-- Each subcategory is also the thing an itemized transaction log ties to
-- (Gas, Subscriptions, Groceries, Dining Out, Insurance, Car Payments...)
-- ---------------------------------------------------------------------
CREATE TABLE subcategories (
    subcategory_id  SERIAL PRIMARY KEY,
    category_id     INT NOT NULL REFERENCES categories(category_id),
    name            VARCHAR(75) NOT NULL,           -- 'Mortgage', 'Property Tax', 'Gas', 'Hydro/Energy',
                                                      -- 'Water', 'Internet', 'Vehicle Payment', 'Fuel',
                                                      -- 'Maintenance/Repair', 'Home Insurance', 'Car Insurance',
                                                      -- 'Life Insurance', 'Subscriptions', 'Going Out',
                                                      -- 'Groceries', 'Dining Out', 'Pet Expenses', 'House Fund',
                                                      -- 'Savings', 'Travel', etc.
    display_order   SMALLINT,
    UNIQUE (category_id, name)
);

-- ---------------------------------------------------------------------
-- 4. BUDGET PERIODS
-- One row per month (each of your monthly tabs)
-- ---------------------------------------------------------------------
CREATE TABLE budget_periods (
    period_id       SERIAL PRIMARY KEY,
    year            SMALLINT NOT NULL,
    month           SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    UNIQUE (year, month)
);

-- ---------------------------------------------------------------------
-- 5. INCOME
-- Projected vs actual income per person per month
-- (top-left block of each monthly tab: "Peter Income", "Sailah Income")
-- ---------------------------------------------------------------------
CREATE TABLE income (
    income_id           SERIAL PRIMARY KEY,
    period_id           INT NOT NULL REFERENCES budget_periods(period_id),
    person_id           INT NOT NULL REFERENCES people(person_id),
    projected_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
    actual_amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
    notes               VARCHAR(255),                -- e.g. "Added christmas money"
    UNIQUE (period_id, person_id)
);

-- ---------------------------------------------------------------------
-- 6. BUDGET LINES
-- Projected vs actual cost per subcategory per month
-- (the "Projected Cost / Actual Cost / Difference" rows in each table)
-- Difference is a derived value, not stored.
-- ---------------------------------------------------------------------
CREATE TABLE budget_lines (
    budget_line_id      SERIAL PRIMARY KEY,
    period_id            INT NOT NULL REFERENCES budget_periods(period_id),
    subcategory_id        INT NOT NULL REFERENCES subcategories(subcategory_id),
    projected_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
    actual_amount         NUMERIC(10,2),              -- nullable: many rows are blank until reconciled
    notes                 VARCHAR(255),                -- e.g. "Paid by Peter - July 28"
    UNIQUE (period_id, subcategory_id)
);

-- ---------------------------------------------------------------------
-- 7. TRANSACTIONS
-- Every itemized entry from the Date/Price/Location/Paid-by tables
-- (Gas, Groceries, Dining Out, Koda/Peaches, Savings, Insurance, etc.)
-- These are what actually sum up to the "Actual Cost" in budget_lines.
-- ---------------------------------------------------------------------
CREATE TABLE transactions (
    transaction_id      SERIAL PRIMARY KEY,
    subcategory_id       INT NOT NULL REFERENCES subcategories(subcategory_id),
    transaction_date     DATE NOT NULL,
    amount                NUMERIC(10,2) NOT NULL,
    location              VARCHAR(100),                -- 'Costco', 'Allstate (home)', 'Hello Fresh', etc.
    paid_by_person_id    INT REFERENCES people(person_id),
    notes                 VARCHAR(255)                  -- e.g. "Paid by Joint - July 25th"
);

CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_subcategory ON transactions(subcategory_id);

-- ---------------------------------------------------------------------
-- 8. GOALS
-- Free-text yearly goals (the "2026 Goals" box on the Grand tabs)
-- ---------------------------------------------------------------------
CREATE TABLE goals (
    goal_id         SERIAL PRIMARY KEY,
    year            SMALLINT NOT NULL,
    description     VARCHAR(255) NOT NULL
);

-- =====================================================================
-- USEFUL VIEWS
-- These replace the "Grand", "YEAR TO DATE" and per-category rollup
-- sheets, which were all just aggregations of the tables above.
-- =====================================================================

-- Monthly actual spend by subcategory, computed straight from transactions
-- (an alternative source of truth to budget_lines.actual_amount, useful
-- for catching discrepancies between the two, like your spreadsheet's
-- occasional mismatches between "Actual Cost" and the itemized total)
CREATE VIEW v_monthly_actuals AS
SELECT
    bp.year,
    bp.month,
    sc.subcategory_id,
    sc.name         AS subcategory,
    c.name          AS category,
    SUM(t.amount)   AS actual_total
FROM transactions t
JOIN subcategories sc ON sc.subcategory_id = t.subcategory_id
JOIN categories c ON c.category_id = sc.category_id
JOIN budget_periods bp
    ON bp.year = EXTRACT(YEAR FROM t.transaction_date)
   AND bp.month = EXTRACT(MONTH FROM t.transaction_date)
GROUP BY bp.year, bp.month, sc.subcategory_id, sc.name, c.name;

-- Monthly income vs household expenses vs net (the "Budget / Expenses /
-- Net / Reason" table on the YEAR TO DATE tabs)
CREATE VIEW v_monthly_summary AS
SELECT
    bp.period_id,
    bp.year,
    bp.month,
    (SELECT COALESCE(SUM(actual_amount), 0) FROM income i WHERE i.period_id = bp.period_id) AS actual_income,
    (SELECT COALESCE(SUM(actual_amount), 0) FROM budget_lines bl WHERE bl.period_id = bp.period_id) AS actual_expenses,
    (SELECT COALESCE(SUM(actual_amount), 0) FROM income i WHERE i.period_id = bp.period_id)
      - (SELECT COALESCE(SUM(actual_amount), 0) FROM budget_lines bl WHERE bl.period_id = bp.period_id) AS net
FROM budget_periods bp;

-- Category totals per month, projected vs actual (the category "TOTAL"
-- rows, e.g. HOUSING TOTAL, FOOD TOTAL)
CREATE VIEW v_category_totals AS
SELECT
    bp.year,
    bp.month,
    c.name AS category,
    SUM(bl.projected_amount) AS projected_total,
    SUM(bl.actual_amount)    AS actual_total
FROM budget_lines bl
JOIN subcategories sc ON sc.subcategory_id = bl.subcategory_id
JOIN categories c ON c.category_id = sc.category_id
JOIN budget_periods bp ON bp.period_id = bl.period_id
GROUP BY bp.year, bp.month, c.name;

-- Per-person spend by month (splits "Sailah Expenses" / "Peter Expenses"
-- from the Grand tabs, based on who paid)
CREATE VIEW v_spend_by_person AS
SELECT
    EXTRACT(YEAR FROM t.transaction_date)  AS year,
    EXTRACT(MONTH FROM t.transaction_date) AS month,
    p.name AS paid_by,
    SUM(t.amount) AS total_spent
FROM transactions t
JOIN people p ON p.person_id = t.paid_by_person_id
GROUP BY 1, 2, 3;
