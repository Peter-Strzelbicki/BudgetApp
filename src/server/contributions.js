const DEFAULT_PAY_PERIODS = 2;

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculateContributionSummary({
  people,
  incomeConfig,
  extraIncome = [],
  personalExpenses,
  plannedExpenses,
  payPeriods = DEFAULT_PAY_PERIODS,
}) {
  const biweeklyByPerson = new Map();
  for (const config of incomeConfig) {
    biweeklyByPerson.set(Number(config.person_id), Number(config.biweekly_amount));
  }

  const extraByPerson = new Map();
  for (const extra of extraIncome) {
    const personId = Number(extra.person_id);
    extraByPerson.set(personId, (extraByPerson.get(personId) || 0) + Number(extra.amount));
  }

  const expensesByPerson = new Map();
  for (const expense of personalExpenses) {
    const personId = Number(expense.person_id);
    expensesByPerson.set(personId, (expensesByPerson.get(personId) || 0) + Number(expense.amount));
  }

  const monthlyByPerson = new Map();
  for (const [personId, biweekly] of biweeklyByPerson) {
    monthlyByPerson.set(personId, biweekly * payPeriods + (extraByPerson.get(personId) || 0));
  }

  const householdIncome = Array.from(monthlyByPerson.values()).reduce((sum, amount) => sum + amount, 0);
  const monthlyExpenses = Number(plannedExpenses) || 0;

  return {
    household_income: roundMoney(householdIncome),
    planned_expenses: roundMoney(monthlyExpenses),
    pay_periods: payPeriods,
    people: people.map(person => {
      const personId = Number(person.person_id);
      const biweekly = biweeklyByPerson.get(personId) || 0;
      const extra = extraByPerson.get(personId) || 0;
      const monthlyIncome = biweekly * payPeriods + extra;
      const incomeShare = householdIncome > 0 ? monthlyIncome / householdIncome : 0;
      const monthlyShare = monthlyExpenses * incomeShare;
      const paidPersonally = expensesByPerson.get(personId) || 0;
      const transferBeforeCredit = monthlyShare / payPeriods;

      return {
        person_id: personId,
        name: person.name,
        biweekly_amount: roundMoney(biweekly),
        extra_income: roundMoney(extra),
        income: roundMoney(monthlyIncome),
        income_percentage: incomeShare * 100,
        monthly_share: roundMoney(monthlyShare),
        paid_personally: roundMoney(paidPersonally),
        transfer_due: roundMoney(Math.max(transferBeforeCredit - paidPersonally, 0)),
        credit: roundMoney(Math.max(paidPersonally - transferBeforeCredit, 0)),
      };
    }),
  };
}

module.exports = { calculateContributionSummary };
