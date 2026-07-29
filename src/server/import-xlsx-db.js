const { normalizeKey } = require("./import-xlsx");

function referenceKey(category, subcategory) {
  return `${normalizeKey(category)}|${normalizeKey(subcategory)}`;
}

async function loadReferences(client) {
  const categoryResult = await client.query("SELECT category_id, name FROM public.categories");
  const subcategoryResult = await client.query(
    `SELECT sc.subcategory_id, sc.name, c.name AS category
     FROM public.subcategories sc
     JOIN public.categories c ON c.category_id = sc.category_id`
  );
  const peopleResult = await client.query("SELECT person_id, name FROM public.people");

  return {
    categories: new Map(categoryResult.rows.map(row => [normalizeKey(row.name), row])),
    subcategories: new Map(subcategoryResult.rows.map(row => [referenceKey(row.category, row.name), row])),
    people: new Map(peopleResult.rows.map(row => [normalizeKey(row.name), row])),
  };
}

async function ensureSubcategories(client, parsed, references) {
  const required = new Map();
  for (const row of [...parsed.budgets, ...parsed.transactions]) {
    required.set(referenceKey(row.category, row.subcategory), {
      category: row.category,
      subcategory: row.subcategory,
    });
  }

  const created = [];
  for (const [key, item] of required) {
    if (references.subcategories.has(key)) continue;
    const category = references.categories.get(normalizeKey(item.category));
    if (!category) throw new Error(`Database category not found: ${item.category}`);

    const result = await client.query(
      `INSERT INTO public.subcategories (category_id, name, display_order)
       SELECT $1, $2, COALESCE(MAX(display_order), 0) + 1
       FROM public.subcategories
       WHERE category_id = $1
       ON CONFLICT (category_id, name)
       DO UPDATE SET name = EXCLUDED.name
       RETURNING subcategory_id, name`,
      [category.category_id, item.subcategory]
    );
    const row = { ...result.rows[0], category: item.category };
    references.subcategories.set(key, row);
    created.push(`${item.category} / ${item.subcategory}`);
  }
  return created;
}

async function upsertBudgets(client, budgets, references) {
  const periods = new Map();
  for (const budget of budgets) {
    const periodKey = `${budget.year}-${budget.month}`;
    let periodId = periods.get(periodKey);
    if (!periodId) {
      const periodResult = await client.query(
        `INSERT INTO public.budget_periods (year, month)
         VALUES ($1, $2)
         ON CONFLICT (year, month) DO UPDATE SET year = EXCLUDED.year
         RETURNING period_id`,
        [budget.year, budget.month]
      );
      periodId = periodResult.rows[0].period_id;
      periods.set(periodKey, periodId);
    }

    const subcategory = references.subcategories.get(referenceKey(budget.category, budget.subcategory));
    await client.query(
      `INSERT INTO public.budget_lines (period_id, subcategory_id, projected_amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (period_id, subcategory_id)
       DO UPDATE SET projected_amount = EXCLUDED.projected_amount`,
      [periodId, subcategory.subcategory_id, budget.projected_amount]
    );
  }
}

async function insertTransactions(client, transactions, references) {
  let inserted = 0;
  let skipped = 0;
  const unmatchedPayers = new Set();

  for (const transaction of transactions) {
    const subcategory = references.subcategories.get(referenceKey(transaction.category, transaction.subcategory));
    const payer = transaction.paid_by
      ? references.people.get(normalizeKey(transaction.paid_by))
      : null;
    if (transaction.paid_by && !payer) unmatchedPayers.add(transaction.paid_by.trim());

    const result = await client.query(
      `INSERT INTO public.transactions
         (subcategory_id, transaction_date, amount, location, paid_by_person_id, notes)
       SELECT $1::integer, $2::date, $3::numeric(10, 2), $4::varchar(100), $5::integer, $6::varchar(255)
       WHERE NOT EXISTS (
         SELECT 1
         FROM public.transactions
         WHERE subcategory_id = $1
           AND transaction_date = $2
           AND amount = $3
           AND COALESCE(LOWER(TRIM(location)), '') = COALESCE(LOWER(TRIM($4::varchar(100))), '')
           AND paid_by_person_id IS NOT DISTINCT FROM $5
       )
       RETURNING transaction_id`,
      [
        subcategory.subcategory_id,
        transaction.transaction_date,
        transaction.amount,
        transaction.location || null,
        payer?.person_id || null,
        transaction.notes || null,
      ]
    );
    if (result.rowCount === 1) inserted += 1;
    else skipped += 1;
  }

  return { inserted, skipped, unmatchedPayers: [...unmatchedPayers].sort() };
}

async function commitBudgetImport(pool, parsed) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const references = await loadReferences(client);
    const subcategoriesCreated = await ensureSubcategories(client, parsed, references);
    await upsertBudgets(client, parsed.budgets, references);
    const transactionResult = await insertTransactions(client, parsed.transactions, references);
    await client.query("COMMIT");

    return {
      months_imported: parsed.sheets.length,
      budget_lines_upserted: parsed.budgets.length,
      transactions_inserted: transactionResult.inserted,
      transactions_skipped: transactionResult.skipped,
      subcategories_created: subcategoriesCreated,
      unmatched_payers: transactionResult.unmatchedPayers,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function findUnmatchedPayers(pool, parsed) {
  const result = await pool.query("SELECT name FROM public.people");
  const known = new Set(result.rows.map(row => normalizeKey(row.name)));
  return [...new Set(parsed.transactions
    .map(transaction => transaction.paid_by)
    .filter(name => name && !known.has(normalizeKey(name)))
    .map(name => name.trim()))]
    .sort();
}

module.exports = {
  commitBudgetImport,
  findUnmatchedPayers,
};