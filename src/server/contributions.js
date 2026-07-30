const DEFAULT_PAY_PERIODS = 2;
const BIWEEKLY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseIsoDate(value) {
  if (value instanceof Date) {
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatIsoDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getScheduledPayDates(anchorValue, month, year, payPeriods) {
  const anchor = parseIsoDate(anchorValue);
  if (anchor === null || !Number.isInteger(month) || !Number.isInteger(year)) return [];

  const periodStart = Date.UTC(year, month - 1, 1);
  const periodEnd = Date.UTC(year, month, 0);
  if (anchor > periodEnd) return [];

  const periodsFromAnchor = Math.max(0, Math.ceil((periodStart - anchor) / (BIWEEKLY_DAYS * DAY_MS)));
  let paycheckDate = anchor + periodsFromAnchor * BIWEEKLY_DAYS * DAY_MS;
  const dates = [];
  while (paycheckDate <= periodEnd && dates.length < payPeriods) {
    if (paycheckDate >= periodStart) dates.push(formatIsoDate(paycheckDate));
    paycheckDate += BIWEEKLY_DAYS * DAY_MS;
  }
  return dates;
}

function occurredBy(value, asOfTimestamp) {
  const timestamp = parseIsoDate(value);
  return timestamp === null || timestamp <= asOfTimestamp;
}

function calculateContributionSummary({
  people,
  incomeConfig,
  extraIncome = [],
  paychecks = [],
  jointPayments = [],
  personalExpenses,
  plannedExpenses,
  month,
  year,
  asOfDate = new Date().toISOString().slice(0, 10),
  payPeriods = DEFAULT_PAY_PERIODS,
}) {
  const asOfTimestamp = parseIsoDate(asOfDate) ?? Date.now();
  const biweeklyByPerson = new Map();
  const paydayAnchorByPerson = new Map();
  for (const config of incomeConfig) {
    const personId = Number(config.person_id);
    biweeklyByPerson.set(personId, Number(config.biweekly_amount));
    if (config.payday_anchor) paydayAnchorByPerson.set(personId, config.payday_anchor);
  }

  const extraByPerson = new Map();
  for (const extra of extraIncome) {
    const personId = Number(extra.person_id);
    extraByPerson.set(personId, (extraByPerson.get(personId) || 0) + Number(extra.amount));
  }

  const expensesByPerson = new Map();
  for (const expense of personalExpenses) {
    if (!occurredBy(expense.transaction_date, asOfTimestamp)) continue;
    const personId = Number(expense.person_id);
    expensesByPerson.set(personId, (expensesByPerson.get(personId) || 0) + Number(expense.amount));
  }

  const transfersByPerson = new Map();
  for (const paycheck of paychecks) {
    if (!occurredBy(paycheck.paycheck_date, asOfTimestamp)) continue;
    const personId = Number(paycheck.person_id);
    transfersByPerson.set(personId, (transfersByPerson.get(personId) || 0) + Number(paycheck.transferred_amount || 0));
  }
  for (const payment of jointPayments) {
    if (!occurredBy(payment.payment_date, asOfTimestamp)) continue;
    const personId = Number(payment.person_id);
    transfersByPerson.set(personId, (transfersByPerson.get(personId) || 0) + Number(payment.amount || 0));
  }

  const regularMonthlyByPerson = new Map();
  for (const [personId, biweekly] of biweeklyByPerson) {
    regularMonthlyByPerson.set(personId, biweekly * payPeriods);
  }

  const regularHouseholdIncome = Array.from(regularMonthlyByPerson.values()).reduce((sum, amount) => sum + amount, 0);
  const extraHouseholdIncome = Array.from(extraByPerson.values()).reduce((sum, amount) => sum + amount, 0);
  const householdIncome = regularHouseholdIncome + extraHouseholdIncome;
  const monthlyExpenses = Number(plannedExpenses) || 0;

  return {
    household_income: roundMoney(householdIncome),
    planned_expenses: roundMoney(monthlyExpenses),
    pay_periods: payPeriods,
    people: people.map(person => {
      const personId = Number(person.person_id);
      const biweekly = biweeklyByPerson.get(personId) || 0;
      const extra = extraByPerson.get(personId) || 0;
      const regularMonthlyIncome = biweekly * payPeriods;
      const monthlyIncome = regularMonthlyIncome + extra;
      const incomeShare = regularHouseholdIncome > 0 ? regularMonthlyIncome / regularHouseholdIncome : 0;
      const monthlyShare = monthlyExpenses * incomeShare;
      const paidPersonally = expensesByPerson.get(personId) || 0;
      const transferredToJoint = transfersByPerson.get(personId) || 0;
      const scheduledPayDates = getScheduledPayDates(paydayAnchorByPerson.get(personId), month, year, payPeriods);
      const installmentsDue = scheduledPayDates.length > 0
        ? scheduledPayDates.filter(date => occurredBy(date, asOfTimestamp)).length
        : (!Number.isInteger(month) || !Number.isInteger(year) ? 1 : 0);
      const accruedShare = payPeriods > 0 ? monthlyShare / payPeriods * installmentsDue : 0;
      const remainingDue = Math.max(accruedShare - paidPersonally - transferredToJoint, 0);
      const monthlyRemaining = Math.max(monthlyShare - paidPersonally - transferredToJoint, 0);
      const nextPayDate = scheduledPayDates.find(date => !occurredBy(date, asOfTimestamp)) || null;

      return {
        person_id: personId,
        name: person.name,
        biweekly_amount: roundMoney(biweekly),
        extra_income: roundMoney(extra),
        income: roundMoney(monthlyIncome),
        income_percentage: incomeShare * 100,
        monthly_share: roundMoney(monthlyShare),
        accrued_share: roundMoney(accruedShare),
        paid_personally: roundMoney(paidPersonally),
        transferred_to_joint: roundMoney(transferredToJoint),
        remaining_due: roundMoney(remainingDue),
        monthly_remaining: roundMoney(monthlyRemaining),
        installments_due: installmentsDue,
        remaining_pay_periods: Math.max(payPeriods - installmentsDue, 0),
        scheduled_pay_dates: scheduledPayDates,
        next_pay_date: nextPayDate,
        transfer_due: roundMoney(remainingDue),
        credit: roundMoney(Math.max(paidPersonally + transferredToJoint - accruedShare, 0)),
      };
    }),
    as_of_date: formatIsoDate(asOfTimestamp),
  };
}

module.exports = { calculateContributionSummary };
