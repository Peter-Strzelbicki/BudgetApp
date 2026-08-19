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

test("subtracts personal expenses from the upcoming biweekly joint target", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Sailah" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 2000, payday_anchor: "2026-08-14" }],
    personalExpenses: [{ person_id: 1, transaction_date: "2026-08-01", amount: 300 }],
    plannedExpenses: 2000,
    personalExpensesBudget: [{ person_id: 1, amount: 2000 }],
    month: 8,
    year: 2026,
    asOfDate: "2026-08-01",
  });

  assert.equal(summary.people[0].biweekly_share, 1000);
  assert.equal(summary.people[0].next_payday_share, 1000);
  assert.equal(summary.people[0].remaining_due, 0);
  assert.equal(summary.people[0].transfer_due, 700);
  assert.equal(summary.people[0].credit, 0);
});

test("shows a person ahead when expenses exceed the upcoming biweekly target", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Sailah" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 2000, payday_anchor: "2026-08-14" }],
    personalExpenses: [{ person_id: 1, transaction_date: "2026-08-01", amount: 1200 }],
    plannedExpenses: 2000,
    personalExpensesBudget: [{ person_id: 1, amount: 2000 }],
    month: 8,
    year: 2026,
    asOfDate: "2026-08-01",
  });

  assert.equal(summary.people[0].transfer_due, 0);
  assert.equal(summary.people[0].credit, 200);
});

test("does not target a future, not-yet-due payday once the current one has arrived", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 1762.17, payday_anchor: "2026-07-24" }],
    personalExpenses: [{ person_id: 1, transaction_date: "2026-07-25", amount: 1049.23 }],
    lastJointPayments: [{ person_id: 1, last_payment_date: "2026-07-24" }],
    plannedExpenses: 3524.34,
    month: 8,
    year: 2026,
    asOfDate: "2026-08-07",
  });

  assert.deepEqual(summary.people[0].scheduled_pay_dates, ["2026-08-07", "2026-08-21"]);
  assert.equal(summary.people[0].installments_due, 1);
  assert.equal(summary.people[0].biweekly_share, 1762.17);
  assert.equal(summary.people[0].remaining_due, 712.94);
  assert.equal(summary.people[0].transfer_due, 712.94);
  assert.equal(summary.people[0].credit, 0);
});

test("clears the balance once a joint payment settles the currently accrued installment", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 1762.17, payday_anchor: "2026-07-24" }],
    personalExpenses: [{ person_id: 1, transaction_date: "2026-07-25", amount: 1049.23 }],
    jointPayments: [{ person_id: 1, payment_date: "2026-08-07", amount: 712.94 }],
    lastJointPayments: [{ person_id: 1, last_payment_date: "2026-08-07" }],
    plannedExpenses: 3524.34,
    month: 8,
    year: 2026,
    asOfDate: "2026-08-07",
  });

  assert.equal(summary.people[0].paid_personally, 0);
  assert.equal(summary.people[0].transferred_to_joint, 712.94);
  assert.equal(summary.people[0].installments_due, 0);
  assert.equal(summary.people[0].remaining_due, 0);
  assert.equal(summary.people[0].transfer_due, 0);
  assert.equal(summary.people[0].credit, 0);
});

test("tracks only new expenses made after a settling payment, without prematurely previewing the next payday", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 1762.17, payday_anchor: "2026-07-24" }],
    personalExpenses: [
      { person_id: 1, transaction_date: "2026-07-25", amount: 1049.23 },
      { person_id: 1, transaction_date: "2026-08-10", amount: 40 },
    ],
    jointPayments: [{ person_id: 1, payment_date: "2026-08-07", amount: 712.94 }],
    lastJointPayments: [{ person_id: 1, last_payment_date: "2026-08-07" }],
    plannedExpenses: 3524.34,
    month: 8,
    year: 2026,
    asOfDate: "2026-08-12",
  });

  assert.equal(summary.people[0].paid_personally, 40);
  assert.equal(summary.people[0].remaining_due, 0);
  assert.equal(summary.people[0].transfer_due, 0);
  assert.equal(summary.people[0].credit, 40);
});

test("accrues the next installment once its payday arrives, netting expenses made since the last payment", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 1762.17, payday_anchor: "2026-07-24" }],
    personalExpenses: [
      { person_id: 1, transaction_date: "2026-07-25", amount: 1049.23 },
      { person_id: 1, transaction_date: "2026-08-10", amount: 40 },
    ],
    jointPayments: [{ person_id: 1, payment_date: "2026-08-07", amount: 712.94 }],
    lastJointPayments: [{ person_id: 1, last_payment_date: "2026-08-07" }],
    plannedExpenses: 3524.34,
    month: 8,
    year: 2026,
    asOfDate: "2026-08-21",
  });

  assert.equal(summary.people[0].installments_due, 1);
  assert.equal(summary.people[0].paid_personally, 40);
  assert.equal(summary.people[0].remaining_due, 1722.17);
  assert.equal(summary.people[0].transfer_due, 1722.17);
});

test("adds extra income to monthly totals without changing joint contribution shares", () => {
  const summary = calculateContributionSummary({
    people: [
      { person_id: 1, name: "Peter" },
      { person_id: 2, name: "Sailah" },
    ],
    incomeConfig: [
      { person_id: 1, biweekly_amount: 1000 },
      { person_id: 2, biweekly_amount: 1000 },
    ],
    extraIncome: [{ person_id: 1, amount: 500 }],
    personalExpenses: [],
    plannedExpenses: 2000,
  });

  assert.equal(summary.household_income, 4500);
  assert.equal(summary.people[0].income, 2500);
  assert.equal(summary.people[0].extra_income, 500);
  assert.equal(summary.people[0].income_percentage, 50);
  assert.equal(summary.people[1].income_percentage, 50);
  assert.equal(summary.people[0].transfer_due, 500);
  assert.equal(summary.people[1].transfer_due, 500);
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

test("uses personal expenses since the latest joint payment date", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 1000, payday_anchor: "2026-08-08" }],
    personalExpenses: [
      { person_id: 1, transaction_date: "2026-07-30", amount: 90 },
      { person_id: 1, transaction_date: "2026-08-02", amount: 110 },
      { person_id: 1, transaction_date: "2026-08-05", amount: 40 },
    ],
    jointPayments: [{ person_id: 1, payment_date: "2026-08-01", amount: 200 }],
    lastJointPayments: [{ person_id: 1, last_payment_date: "2026-08-01" }],
    plannedExpenses: 2000,
    month: 8,
    year: 2026,
    asOfDate: "2026-08-10",
  });

  assert.equal(summary.people[0].paid_personally, 150);
  assert.equal(summary.people[0].last_joint_payment_date, "2026-08-01");
});

test("falls back to month-start personal expenses when no joint payment exists", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Sailah" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 1000 }],
    personalExpenses: [
      { person_id: 1, transaction_date: "2026-07-31", amount: 80 },
      { person_id: 1, transaction_date: "2026-08-01", amount: 120 },
    ],
    plannedExpenses: 2000,
    month: 8,
    year: 2026,
    asOfDate: "2026-08-02",
  });

  assert.equal(summary.people[0].paid_personally, 120);
  assert.equal(summary.people[0].last_joint_payment_date, null);
});

test("counts same-day expenses when they occur after a joint payment timestamp", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Sailah" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 2000, payday_anchor: "2026-07-17" }],
    personalExpenses: [
      {
        person_id: 1,
        transaction_date: "2026-07-31",
        transaction_at: "2026-07-31T19:30:00.000Z",
        amount: 150,
      },
    ],
    lastJointPayments: [
      {
        person_id: 1,
        last_payment_date: "2026-07-31",
        last_payment_at: "2026-07-31T16:00:00.000Z",
      },
    ],
    plannedExpenses: 2000,
    month: 7,
    year: 2026,
    asOfDate: "2026-07-31",
  });

  assert.equal(summary.people[0].paid_personally, 150);
  assert.equal(summary.people[0].last_joint_payment_date, "2026-07-31");
  assert.equal(summary.people[0].last_joint_payment_at, "2026-07-31T16:00:00.000Z");
});

test("does not include pre-payment dates even when created_at is later", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Sailah" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 2000, payday_anchor: "2026-07-17" }],
    personalExpenses: [
      {
        person_id: 1,
        transaction_date: "2026-07-15",
        created_at: "2026-08-01T22:50:00.000Z",
        amount: 250,
      },
    ],
    lastJointPayments: [
      {
        person_id: 1,
        last_payment_date: "2026-07-31",
        last_payment_at: "2026-07-31T16:00:00.000Z",
      },
    ],
    plannedExpenses: 2000,
    month: 7,
    year: 2026,
    asOfDate: "2026-08-01",
  });

  assert.equal(summary.people[0].paid_personally, 0);
});

test("returns included expense rows scoped to the active pay statement window", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 1000, payday_anchor: "2026-07-10" }],
    personalExpenses: [
      {
        person_id: 1,
        transaction_date: "2026-07-23",
        amount: 20,
        category: "Groceries",
        subcategory: "Produce",
        location: "Market",
      },
      {
        person_id: 1,
        transaction_date: "2026-07-24",
        created_at: "2026-07-24T18:20:00.000Z",
        amount: 35,
        category: "Groceries",
        subcategory: "Pantry",
        location: "Trader Joe",
      },
      {
        person_id: 1,
        transaction_date: "2026-07-25",
        amount: 15,
        category: "Fuel",
        subcategory: "Gas",
        location: "Shell",
      },
    ],
    lastJointPayments: [
      {
        person_id: 1,
        last_payment_date: "2026-07-24",
        last_payment_at: "2026-07-24T16:00:00.000Z",
      },
    ],
    plannedExpenses: 2000,
    month: 7,
    year: 2026,
    asOfDate: "2026-07-25",
  });

  assert.equal(summary.people[0].paid_personally, 50);
  assert.equal(summary.people[0].included_expense_count, 2);
  assert.equal(summary.people[0].included_expenses[0].subcategory, "Gas");
  assert.equal(summary.people[0].included_expenses[1].subcategory, "Pantry");
});

test("uses each person's own Personal Expenses budget line for the joint target from August 2026 onward", () => {
  const summary = calculateContributionSummary({
    people: [
      { person_id: 1, name: "Peter" },
      { person_id: 2, name: "Sailah" },
    ],
    incomeConfig: [
      { person_id: 1, biweekly_amount: 2103.57 },
      { person_id: 2, biweekly_amount: 2011.70 },
    ],
    personalExpenses: [],
    plannedExpenses: 0,
    personalExpensesBudget: [
      { person_id: 1, amount: 682.78 },
      { person_id: 2, amount: 652.97 },
    ],
    month: 8,
    year: 2026,
  });

  assert.equal(summary.uses_personal_expense_budgets, true);
  assert.equal(summary.people[0].personal_expenses_budget, 682.78);
  assert.equal(summary.people[0].monthly_share, 3524.36);
  assert.equal(summary.people[0].biweekly_share, 1762.18);
  assert.equal(summary.people[1].personal_expenses_budget, 652.97);
  assert.equal(summary.people[1].monthly_share, 3370.43);
  assert.equal(summary.people[1].biweekly_share, 1685.22);
});

test("keeps the legacy shared-budget split for months before August 2026", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 2103.57 }],
    personalExpenses: [],
    plannedExpenses: 3524.36,
    personalExpensesBudget: [{ person_id: 1, amount: 682.78 }],
    month: 7,
    year: 2026,
  });

  assert.equal(summary.uses_personal_expense_budgets, false);
  assert.equal(summary.people[0].monthly_share, 3524.36);
  assert.equal(summary.people[0].biweekly_share, 1762.18);
});

test("does not double-count a transaction posted under a person's own Personal Expenses budget line", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 2103.57, payday_anchor: "2026-08-07" }],
    personalExpenses: [{ person_id: 1, transaction_date: "2026-08-05", amount: 682.78, subcategory: "Personal Expenses - Peter" }],
    plannedExpenses: 0,
    personalExpensesBudget: [{ person_id: 1, amount: 682.78 }],
    month: 8,
    year: 2026,
    asOfDate: "2026-08-19",
  });

  assert.equal(summary.people[0].paid_personally, 0);
  assert.equal(summary.people[0].included_expense_count, 0);
  assert.equal(summary.people[0].transfer_due, 1762.18);
});

test("still counts a shared expense fronted personally even when a Personal Expenses budget line exists", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 2103.57, payday_anchor: "2026-08-07" }],
    personalExpenses: [{ person_id: 1, transaction_date: "2026-08-05", amount: 100, subcategory: "Groceries" }],
    plannedExpenses: 0,
    personalExpensesBudget: [{ person_id: 1, amount: 682.78 }],
    month: 8,
    year: 2026,
    asOfDate: "2026-08-19",
  });

  assert.equal(summary.people[0].paid_personally, 100);
  assert.equal(summary.people[0].transfer_due, 1662.18);
});
