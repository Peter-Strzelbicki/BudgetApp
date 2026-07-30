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

test("does not return a negative transfer", () => {
  const summary = calculateContributionSummary({
    people: [{ person_id: 1, name: "Peter" }],
    incomeConfig: [{ person_id: 1, biweekly_amount: 500 }],
    personalExpenses: [{ person_id: 1, amount: 600 }],
    plannedExpenses: 1000,
  });

  assert.equal(summary.people[0].transfer_due, 0);
  assert.equal(summary.people[0].credit, 100);
});