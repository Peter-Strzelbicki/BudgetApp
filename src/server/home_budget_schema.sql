SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.v_spend_by_person', N'V') IS NOT NULL
    DROP VIEW dbo.v_spend_by_person;
IF OBJECT_ID(N'dbo.v_category_totals', N'V') IS NOT NULL
    DROP VIEW dbo.v_category_totals;
IF OBJECT_ID(N'dbo.v_monthly_summary', N'V') IS NOT NULL
    DROP VIEW dbo.v_monthly_summary;
IF OBJECT_ID(N'dbo.v_monthly_actuals', N'V') IS NOT NULL
    DROP VIEW dbo.v_monthly_actuals;
IF OBJECT_ID(N'dbo.transactions', N'U') IS NOT NULL
    DROP TABLE dbo.transactions;
IF OBJECT_ID(N'dbo.goals', N'U') IS NOT NULL
    DROP TABLE dbo.goals;
IF OBJECT_ID(N'dbo.budget_lines', N'U') IS NOT NULL
    DROP TABLE dbo.budget_lines;
IF OBJECT_ID(N'dbo.income', N'U') IS NOT NULL
    DROP TABLE dbo.income;
IF OBJECT_ID(N'dbo.budget_periods', N'U') IS NOT NULL
    DROP TABLE dbo.budget_periods;
IF OBJECT_ID(N'dbo.subcategories', N'U') IS NOT NULL
    DROP TABLE dbo.subcategories;
IF OBJECT_ID(N'dbo.categories', N'U') IS NOT NULL
    DROP TABLE dbo.categories;
IF OBJECT_ID(N'dbo.people', N'U') IS NOT NULL
    DROP TABLE dbo.people;

CREATE TABLE dbo.people (
    person_id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(50) NOT NULL UNIQUE,
    is_household BIT NOT NULL DEFAULT 1
);

CREATE TABLE dbo.categories (
    category_id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(50) NOT NULL UNIQUE,
    display_order SMALLINT NULL
);

CREATE TABLE dbo.subcategories (
    subcategory_id INT IDENTITY(1,1) PRIMARY KEY,
    category_id INT NOT NULL,
    name NVARCHAR(75) NOT NULL,
    display_order SMALLINT NULL,
    CONSTRAINT FK_subcategories_categories FOREIGN KEY (category_id)
        REFERENCES dbo.categories(category_id),
    CONSTRAINT UQ_subcategories_category_name UNIQUE (category_id, name)
);

CREATE TABLE dbo.budget_periods (
    period_id INT IDENTITY(1,1) PRIMARY KEY,
    year SMALLINT NOT NULL,
    month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    CONSTRAINT UQ_budget_periods_year_month UNIQUE (year, month)
);

CREATE TABLE dbo.income (
    income_id INT IDENTITY(1,1) PRIMARY KEY,
    period_id INT NOT NULL,
    person_id INT NOT NULL,
    projected_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    actual_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    notes NVARCHAR(255) NULL,
    CONSTRAINT FK_income_budget_periods FOREIGN KEY (period_id)
        REFERENCES dbo.budget_periods(period_id),
    CONSTRAINT FK_income_people FOREIGN KEY (person_id)
        REFERENCES dbo.people(person_id),
    CONSTRAINT UQ_income_period_person UNIQUE (period_id, person_id)
);

CREATE TABLE dbo.budget_lines (
    budget_line_id INT IDENTITY(1,1) PRIMARY KEY,
    period_id INT NOT NULL,
    subcategory_id INT NOT NULL,
    projected_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    actual_amount DECIMAL(10,2) NULL,
    notes NVARCHAR(255) NULL,
    CONSTRAINT FK_budget_lines_budget_periods FOREIGN KEY (period_id)
        REFERENCES dbo.budget_periods(period_id),
    CONSTRAINT FK_budget_lines_subcategories FOREIGN KEY (subcategory_id)
        REFERENCES dbo.subcategories(subcategory_id),
    CONSTRAINT UQ_budget_lines_period_subcategory UNIQUE (period_id, subcategory_id)
);

CREATE TABLE dbo.transactions (
    transaction_id INT IDENTITY(1,1) PRIMARY KEY,
    subcategory_id INT NOT NULL,
    transaction_date DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    location NVARCHAR(100) NULL,
    paid_by_person_id INT NULL,
    notes NVARCHAR(255) NULL,
    CONSTRAINT FK_transactions_subcategories FOREIGN KEY (subcategory_id)
        REFERENCES dbo.subcategories(subcategory_id),
    CONSTRAINT FK_transactions_people FOREIGN KEY (paid_by_person_id)
        REFERENCES dbo.people(person_id)
);

CREATE INDEX IX_transactions_date ON dbo.transactions(transaction_date);
CREATE INDEX IX_transactions_subcategory ON dbo.transactions(subcategory_id);

CREATE TABLE dbo.goals (
    goal_id INT IDENTITY(1,1) PRIMARY KEY,
    year SMALLINT NOT NULL,
    description NVARCHAR(255) NOT NULL
);

CREATE VIEW dbo.v_monthly_actuals AS
SELECT
    bp.year,
    bp.month,
    sc.subcategory_id,
    sc.name AS subcategory,
    c.name AS category,
    SUM(t.amount) AS actual_total
FROM dbo.transactions t
JOIN dbo.subcategories sc ON sc.subcategory_id = t.subcategory_id
JOIN dbo.categories c ON c.category_id = sc.category_id
JOIN dbo.budget_periods bp
    ON bp.year = YEAR(t.transaction_date)
   AND bp.month = MONTH(t.transaction_date)
GROUP BY bp.year, bp.month, sc.subcategory_id, sc.name, c.name;

CREATE VIEW dbo.v_monthly_summary AS
SELECT
    bp.period_id,
    bp.year,
    bp.month,
    (SELECT COALESCE(SUM(actual_amount), 0) FROM dbo.income i WHERE i.period_id = bp.period_id) AS actual_income,
    (SELECT COALESCE(SUM(actual_amount), 0) FROM dbo.budget_lines bl WHERE bl.period_id = bp.period_id) AS actual_expenses,
    (SELECT COALESCE(SUM(actual_amount), 0) FROM dbo.income i WHERE i.period_id = bp.period_id)
      - (SELECT COALESCE(SUM(actual_amount), 0) FROM dbo.budget_lines bl WHERE bl.period_id = bp.period_id) AS net
FROM dbo.budget_periods bp;

CREATE VIEW dbo.v_category_totals AS
SELECT
    bp.year,
    bp.month,
    c.name AS category,
    SUM(bl.projected_amount) AS projected_total,
    SUM(bl.actual_amount) AS actual_total
FROM dbo.budget_lines bl
JOIN dbo.subcategories sc ON sc.subcategory_id = bl.subcategory_id
JOIN dbo.categories c ON c.category_id = sc.category_id
JOIN dbo.budget_periods bp ON bp.period_id = bl.period_id
GROUP BY bp.year, bp.month, c.name;

CREATE VIEW dbo.v_spend_by_person AS
SELECT
    YEAR(t.transaction_date) AS year,
    MONTH(t.transaction_date) AS month,
    p.name AS paid_by,
    SUM(t.amount) AS total_spent
FROM dbo.transactions t
JOIN dbo.people p ON p.person_id = t.paid_by_person_id
GROUP BY YEAR(t.transaction_date), MONTH(t.transaction_date), p.name;
