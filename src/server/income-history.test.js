const assert = require("node:assert/strict");
const test = require("node:test");

const { buildIncomeYearSummary, resolveIncomeConfig } = require("./income-history");

const people = [
  { person_id: 1, name: "Peter" },
  { person_id: 2, name: "Sailah" },
];

const defaults = [
  { person_id: 1, biweekly_amount: 1000, payday_anchor: "2026-07-10" },
  { person_id: 2, biweekly_amount: 800, payday_anchor: "2026-07-17" },
];

test("uses the latest monthly schedule without changing later explicit months", () => {
  const records = [
    { person_id: 1, month: 6, year: 2026, biweekly_amount: 900, payday_anchor: "2026-06-12" },
    { person_id: 1, month: 7, year: 2026, biweekly_amount: 1000, payday_anchor: "2026-07-10" },
  ];

  assert.equal(resolveIncomeConfig(people, defaults, records, 6, 2026)[0].biweekly_amount, 900);
  assert.equal(resolveIncomeConfig(people, defaults, records, 7, 2026)[0].biweekly_amount, 1000);
  assert.equal(resolveIncomeConfig(people, defaults, records, 8, 2026)[0].biweekly_amount, 1000);
});

test("reports extra income in monthly totals without changing regular income", () => {
  const summary = buildIncomeYearSummary({
    people,
    defaults,
    records: [{ person_id: 1, month: 7, year: 2026, biweekly_amount: 1100, payday_anchor: "2026-07-10" }],
    extraIncome: [{ person_id: 1, month: 7, year: 2026, amount: 500 }],
    year: 2026,
  });

  assert.deepEqual(summary[6], {
    month: 7,
    year: 2026,
    regular_income: 3800,
    extra_income: 500,
    total_income: 4300,
  });
});