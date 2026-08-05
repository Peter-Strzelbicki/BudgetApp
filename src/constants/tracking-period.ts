export const TRACKING_START_MONTH = 5;
export const TRACKING_START_YEAR = 2025;

export function getTrackedMonthsForYear(year: number, now = new Date()) {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (year < TRACKING_START_YEAR || year > currentYear) {
    return [] as number[];
  }

  const startMonth = year === TRACKING_START_YEAR ? TRACKING_START_MONTH : 1;
  const endMonth = year === currentYear ? currentMonth : 12;
  if (endMonth < startMonth) {
    return [] as number[];
  }

  return Array.from({ length: endMonth - startMonth + 1 }, (_, index) => startMonth + index);
}

export function clampToTrackedMonth(year: number, month: number, now = new Date()) {
  const months = getTrackedMonthsForYear(year, now);
  if (months.length === 0) {
    return null;
  }
  if (month <= months[0]) return months[0];
  if (month >= months[months.length - 1]) return months[months.length - 1];
  return month;
}