-- =====================================================================
-- SEED DATA FOR HOME BUDGET DATABASE
-- =====================================================================

-- Clear existing data (in reverse order of foreign key dependencies)
DELETE FROM transactions;
DELETE FROM goals;
DELETE FROM budget_lines;
DELETE FROM income;
DELETE FROM budget_periods;
DELETE FROM subcategories;
DELETE FROM categories;
DELETE FROM people;

-- PEOPLE
INSERT INTO people (name, is_household) VALUES
('Peter', 1),
('Sailah', 1);

-- CATEGORIES
INSERT INTO categories (name, display_order) VALUES
('Housing', 1),
('Transportation', 2),
('Insurance', 3),
('Entertainment/Subscriptions', 4),
('Food', 5),
('Koda/Peaches', 6),
('Personal/Home Care', 7),
('Savings/Investments', 8),
('Travel', 9);

-- SUBCATEGORIES
-- Housing
INSERT INTO subcategories (category_id, name, display_order) VALUES
(1, 'Mortgage', 1),
(1, 'Property Tax', 2),
(1, 'Hydro/Energy', 3),
(1, 'Water', 4),
(1, 'Internet', 5),
(1, 'Maintenance/Repair', 6);

-- Transportation
INSERT INTO subcategories (category_id, name, display_order) VALUES
(2, 'Vehicle Payment', 1),
(2, 'Fuel', 2),
(2, 'Maintenance/Repair', 3),
(2, 'Public Transit', 4);

-- Insurance
INSERT INTO subcategories (category_id, name, display_order) VALUES
(3, 'Home Insurance', 1),
(3, 'Car Insurance', 2),
(3, 'Life Insurance', 3);

-- Entertainment/Subscriptions
INSERT INTO subcategories (category_id, name, display_order) VALUES
(4, 'Subscriptions', 1),
(4, 'Going Out', 2),
(4, 'Entertainment', 3);

-- Food
INSERT INTO subcategories (category_id, name, display_order) VALUES
(5, 'Groceries', 1),
(5, 'Dining Out', 2),
(5, 'Coffee/Snacks', 3);

-- Koda/Peaches
INSERT INTO subcategories (category_id, name, display_order) VALUES
(6, 'Pet Food', 1),
(6, 'Pet Expenses', 2),
(6, 'Pet Grooming', 3);

-- Personal/Home Care
INSERT INTO subcategories (category_id, name, display_order) VALUES
(7, 'Hair/Grooming', 1),
(7, 'Medical/Health', 2),
(7, 'Home Care', 3),
(7, 'Clothing', 4);

-- Savings/Investments
INSERT INTO subcategories (category_id, name, display_order) VALUES
(8, 'Savings', 1),
(8, 'House Fund', 2),
(8, 'Investments', 3);

-- Travel
INSERT INTO subcategories (category_id, name, display_order) VALUES
(9, 'Flights', 1),
(9, 'Accommodation', 2),
(9, 'Activities', 3),
(9, 'Dining', 4);
