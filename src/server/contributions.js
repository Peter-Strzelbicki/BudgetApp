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

function parseTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatIsoTimestamp(timestamp) {
  return new Date(timestamp).toISOString();
}

function sameUtcDay(leftTimestamp, rightTimestamp) {
  const left = new Date(leftTimestamp);
  const right = new Date(rightTimestamp);
  return left.getUTCFullYear() === right.getUTCFullYear()
    && left.getUTCMonth() === right.getUTCMonth()
    && left.getUTCDate() === right.getUTCDate();
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

function compareExpenseRowsDesc(left, right) {
  if (left.dateTimestamp !== right.dateTimestamp) {
    return right.dateTimestamp - left.dateTimestamp;
  }
  return right.momentTimestamp - left.momentTimestamp;
}

function calculateContributionSummary({
  people,
  incomeConfig,
  extraIncome = [],
  paychecks = [],
  jointPayments = [],
  lastJointPayments = [],
  personalExpenses,
  plannedExpenses,
  month,
  year,
  asOfDate = new Date().toISOString().slice(0, 10),
  payPeriods = DEFAULT_PAY_PERIODS,
}) {
  const asOfTimestamp = parseIsoDate(asOfDate) ?? Date.now();
  const monthStartTimestamp = Number.isInteger(month) && Number.isInteger(year)
    ? Date.UTC(year, month - 1, 1)
    : null;
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

  const lastJointPaymentByPerson = new Map();
  for (const payment of lastJointPayments) {
    const personId = Number(payment.person_id);
    const paymentDateTimestamp = parseIsoDate(payment.last_payment_date || payment.payment_date || payment.paycheck_date);
    if (paymentDateTimestamp === null || paymentDateTimestamp > asOfTimestamp) continue;
    const paymentMomentTimestamp = parseTimestamp(payment.last_payment_at || payment.payment_at || payment.created_at) ?? paymentDateTimestamp;
    const currentLatest = lastJointPaymentByPerson.get(personId);
    if (
      currentLatest === undefined ||
      paymentDateTimestamp > currentLatest.dateTimestamp ||
      (paymentDateTimestamp === currentLatest.dateTimestamp && paymentMomentTimestamp > currentLatest.momentTimestamp)
    ) {
      lastJointPaymentByPerson.set(personId, {
        dateTimestamp: paymentDateTimestamp,
        momentTimestamp: paymentMomentTimestamp,
      });
    }
  }

  const expensesByPerson = new Map();
  const includedExpensesByPerson = new Map();
  for (const expense of personalExpenses) {
    const expenseDateTimestamp = parseIsoDate(expense.transaction_date);
    if (expenseDateTimestamp !== null && expenseDateTimestamp > asOfTimestamp) continue;
    const personId = Number(expense.person_id);
    const expenseMomentTimestamp = parseTimestamp(expense.transaction_at || expense.created_at) ?? expenseDateTimestamp;
    const lastPayment = lastJointPaymentByPerson.get(personId);
    if (lastPayment !== undefined) {
      if (expenseDateTimestamp === null || expenseDateTimestamp < lastPayment.dateTimestamp) continue;
      if (expenseDateTimestamp === lastPayment.dateTimestamp) {
        if (expenseMomentTimestamp === null || expenseMomentTimestamp <= lastPayment.momentTimestamp) continue;
      }
    } else if (monthStartTimestamp !== null && expenseDateTimestamp !== null && expenseDateTimestamp < monthStartTimestamp) {
      continue;
    }
    const expenseAmount = Number(expense.amount) || 0;
    expensesByPerson.set(personId, (expensesByPerson.get(personId) || 0) + expenseAmount);
    const list = includedExpensesByPerson.get(personId) || [];
    list.push({
      transaction_date: expenseDateTimestamp !== null
        ? formatIsoDate(expenseDateTimestamp)
        : typeof expense.transaction_date === "string"
          ? expense.transaction_date.slice(0, 10)
          : null,
      amount: roundMoney(expenseAmount),
      category: expense.category ? String(expense.category) : null,
      subcategory: expense.subcategory ? String(expense.subcategory) : null,
      location: expense.location ? String(expense.location) : null,
      dateTimestamp: expenseDateTimestamp ?? 0,
      momentTimestamp: expenseMomentTimestamp ?? expenseDateTimestamp ?? 0,
    });
    includedExpensesByPerson.set(personId, list);
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
      const includedExpenses = (includedExpensesByPerson.get(personId) || [])
        .sort(compareExpenseRowsDesc)
        .map(expense => ({
          transaction_date: expense.transaction_date,
          amount: expense.amount,
          category: expense.category,
          subcategory: expense.subcategory,
          location: expense.location,
        }));
      const transferredToJoint = transfersByPerson.get(personId) || 0;
      const scheduledPayDates = getScheduledPayDates(paydayAnchorByPerson.get(personId), month, year, payPeriods);
      const hasPeriod = Number.isInteger(month) && Number.isInteger(year);
      const installmentsDue = scheduledPayDates.length > 0
        ? scheduledPayDates.filter(date => occurredBy(date, asOfTimestamp)).length
        : (!hasPeriod ? 1 : 0);
      const biweeklyShare = payPeriods > 0 ? monthlyShare / payPeriods : 0;
      const accruedShare = biweeklyShare * installmentsDue;
      const remainingDue = Math.max(accruedShare - paidPersonally - transferredToJoint, 0);
      const monthlyRemaining = Math.max(monthlyShare - paidPersonally - transferredToJoint, 0);
      const nextPayDate = scheduledPayDates.find(date => !occurredBy(date, asOfTimestamp)) || null;
      const targetInstallments = nextPayDate
        ? Math.min(installmentsDue + 1, payPeriods)
        : scheduledPayDates.length > 0
          ? installmentsDue
          : Math.min(Math.max(installmentsDue, 1), payPeriods);
      const nextPaydayShare = biweeklyShare * targetInstallments;
      const transferDue = Math.max(nextPaydayShare - paidPersonally - transferredToJoint, 0);
      const credit = Math.max(paidPersonally + transferredToJoint - nextPaydayShare, 0);

      return {
        person_id: personId,
        name: person.name,
        biweekly_amount: roundMoney(biweekly),
        extra_income: roundMoney(extra),
        income: roundMoney(monthlyIncome),
        income_percentage: incomeShare * 100,
        monthly_share: roundMoney(monthlyShare),
        biweekly_share: roundMoney(biweeklyShare),
        accrued_share: roundMoney(accruedShare),
        next_payday_share: roundMoney(nextPaydayShare),
        paid_personally: roundMoney(paidPersonally),
        included_expense_count: includedExpenses.length,
        included_expenses: includedExpenses,
        transferred_to_joint: roundMoney(transferredToJoint),
        remaining_due: roundMoney(remainingDue),
        monthly_remaining: roundMoney(monthlyRemaining),
        installments_due: installmentsDue,
        remaining_pay_periods: Math.max(payPeriods - installmentsDue, 0),
        scheduled_pay_dates: scheduledPayDates,
        next_pay_date: nextPayDate,
        last_joint_payment_date: lastJointPaymentByPerson.has(personId)
          ? formatIsoDate(lastJointPaymentByPerson.get(personId).dateTimestamp)
          : null,
        last_joint_payment_at: lastJointPaymentByPerson.has(personId)
          ? sameUtcDay(
            lastJointPaymentByPerson.get(personId).momentTimestamp,
            lastJointPaymentByPerson.get(personId).dateTimestamp,
          )
            ? formatIsoTimestamp(lastJointPaymentByPerson.get(personId).momentTimestamp)
            : null
          : null,
        transfer_due: roundMoney(transferDue),
        credit: roundMoney(credit),
      };
    }),
    as_of_date: formatIsoDate(asOfTimestamp),
  };
}

module.exports = { calculateContributionSummary };
