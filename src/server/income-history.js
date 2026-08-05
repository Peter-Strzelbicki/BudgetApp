const DEFAULT_PAY_PERIODS = 2;
const INCOME_TRACKING_START_MONTH = 5;
const INCOME_TRACKING_START_YEAR = 2025;

function periodKey(month, year) {
  return Number(year) * 12 + Number(month) - 1;
}

function resolveIncomeConfig(people, defaults, records, month, year) {
  const targetKey = periodKey(month, year);
  const defaultsByPerson = new Map(defaults.map(config => [Number(config.person_id), config]));
  const recordsByPerson = new Map();

  for (const record of records) {
    const personId = Number(record.person_id);
    if (periodKey(record.month, record.year) > targetKey) continue;
    const current = recordsByPerson.get(personId);
    if (!current || periodKey(record.month, record.year) > periodKey(current.month, current.year)) {
      recordsByPerson.set(personId, record);
    }
  }

  return people.map(person => {
    const personId = Number(person.person_id);
    const fallback = defaultsByPerson.get(personId);
    const record = recordsByPerson.get(personId);
    return {
      person_id: personId,
      name: person.name,
      biweekly_amount: Number(record?.biweekly_amount ?? fallback?.biweekly_amount ?? 0),
      payday_anchor: record?.payday_anchor ?? fallback?.payday_anchor ?? null,
      source_month: record ? Number(record.month) : null,
      source_year: record ? Number(record.year) : null,
    };
  });
}

function buildIncomeYearSummary({ people, defaults, records, extraIncome, year, payPeriods = DEFAULT_PAY_PERIODS }) {
  const now = new Date();
  const numericYear = Number(year);
  const trackedMonths = getTrackedMonthsForYear(numericYear, now);

  return trackedMonths.map(month => {
    const config = resolveIncomeConfig(people, defaults, records, month, year);
    const regularIncome = config.reduce((sum, row) => sum + row.biweekly_amount * payPeriods, 0);
    const extra = extraIncome
      .filter(row => Number(row.month) === month && Number(row.year) === numericYear)
      .reduce((sum, row) => sum + Number(row.amount), 0);
    return {
      month,
      year: numericYear,
      regular_income: roundMoney(regularIncome),
      extra_income: roundMoney(extra),
      total_income: roundMoney(regularIncome + extra),
    };
  });
}

function getTrackedMonthsForYear(year, now) {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < INCOME_TRACKING_START_YEAR || year > currentYear) {
    return [];
  }

  const startMonth = year === INCOME_TRACKING_START_YEAR ? INCOME_TRACKING_START_MONTH : 1;
  const endMonth = year === currentYear ? currentMonth : 12;
  if (endMonth < startMonth) {
    return [];
  }

  return Array.from({ length: endMonth - startMonth + 1 }, (_, index) => startMonth + index);
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

module.exports = {
  INCOME_TRACKING_START_MONTH,
  INCOME_TRACKING_START_YEAR,
  buildIncomeYearSummary,
  resolveIncomeConfig,
};