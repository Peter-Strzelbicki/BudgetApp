const assert = require("node:assert/strict");
const test = require("node:test");

const { calculateContributionSummary } = require("./contributions");

test("splits a half-month transfer by income and credits personal spending", () => {
  const summary = calculateContributionSummary({
    people: [
      { person_id: 1, name: "Peter" },
      { person_id: 2, name: "Sailah" },
    ],
    incomeConfig: [
      { person_id: 1, biweekly_amount: 2092.31 },
      { person_id: 2, biweekly_amount: 2011.70 },
    ],
    personalExpenses: [{ person_id: 1, amount: 10.29 }],
    plannedExpenses: 6709.37,
  });

  assert.equal(summary.household_income, 8208.02);
  assert.equal(summary.people[0].biweekly_amount, 2092.31);
  assert.equal(summary.people[0].income_percentage.toFixed(2), "50.98");
  assert.equal(summary.people[0].remaining_due, 1700);
  assert.equal(summary.people[0].transfer_due, 1700);
  assert.equal(summary.people[1].transfer_due, 1644.40);
});

test("returns no transfer before income is configured", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [],
    personalExpenses: [],
    plannedExpenses: 2000,
  });

  assert.equal(summary.people[0].income_percentage, 0);
  assert.equal(summary.people[0].transfer_due, 0);
});

test("does not return a negative transfer when personal spending covers the monthly share", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 500 }],
    personalExpenses: [{ person_id: 1, amount: 600 }],
    plannedExpenses: 1000,
  });

  assert.equal(summary.people[0].transfer_due, 0);
  assert.equal(summary.people[0].credit, 100);
});

test("adds extra income to the pool without affecting personal expense credit", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 1000 }],
    extraIncome: [{ person_id: 1, amount: 500 }],
    personalExpenses: [],
    plannedExpenses: 2000,
  });

  // Monthly income = 1000×2 + 500 = 2500
  assert.equal(summary.people[0].income, 2500);
  assert.equal(summary.people[0].extra_income, 500);
  // transfer_due = 2500/2500 × 2000 / 2 = 1000
  assert.equal(summary.people[0].transfer_due, 1000);
});

test("carries shortfall when the previous paycheck transfer was less than target", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 1000, payday_anchor: "2026-07-10" }],
    jointPayments: [{ person_id: 1, payment_date: "2026-07-10", amount: 700 }],
    personalExpenses: [],
    plannedExpenses: 2000,
    month: 7,
    year: 2026,
    asOfDate: "2026-07-24",
  });

  assert.equal(summary.people[0].remaining_due, 1300);
  assert.equal(summary.people[0].remaining_pay_periods, 0);
  assert.equal(summary.people[0].transfer_due, 1300);
});

test("accrues staggered Peter and Sailah paydays only when each date arrives", () => {
  const input = {
    people: [
      { person_id: 1, name: "Peter" },
      { person_id: 2, name: "Sailah" },
    ],
    incomeConfig: [
      { person_id: 1, biweekly_amount: 1000, payday_anchor: "2026-07-10" },
      { person_id: 2, biweekly_amount: 1000, payday_anchor: "2026-07-17" },
    ],
    personalExpenses: [],
    plannedExpenses: 2000,
    month: 7,
    year: 2026,
  };

  const july30 = calculateContributionSummary({ ...input, asOfDate: "2026-07-30" });
  assert.deepEqual(july30.people[0].scheduled_pay_dates, ["2026-07-10", "2026-07-24"]);
  assert.deepEqual(july30.people[1].scheduled_pay_dates, ["2026-07-17", "2026-07-31"]);
  assert.equal(july30.people[0].installments_due, 2);
  assert.equal(july30.people[0].remaining_due, 1000);
  assert.equal(july30.people[1].installments_due, 1);
  assert.equal(july30.people[1].remaining_due, 500);
  assert.equal(july30.people[1].next_pay_date, "2026-07-31");

  const july31 = calculateContributionSummary({ ...input, asOfDate: "2026-07-31" });
  assert.equal(july31.people[1].installments_due, 2);
  assert.equal(july31.people[1].remaining_due, 1000);
});

test("dated joint payments reduce only the balance accrued by that date", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 1000, payday_anchor: "2026-07-10" }],
    jointPayments: [
      { person_id: 1, payment_date: "2026-07-24", amount: 700 },
      { person_id: 1, payment_date: "2026-07-31", amount: 200 },
    ],
    personalExpenses: [],
    plannedExpenses: 2000,
    month: 7,
    year: 2026,
    asOfDate: "2026-07-30",
  });

  assert.equal(summary.people[0].transferred_to_joint, 700);
  assert.equal(summary.people[0].remaining_due, 1300);
});
