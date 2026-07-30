import { Platform } from 'react-native';
import type { DocumentPickerAsset } from 'expo-document-picker';

const DEFAULT_API_URL = Platform.select({
  android: 'http://10.0.2.2:3000',
  default:
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:3000`
      : 'http://localhost:3000',
});

export const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_API_URL || '';

export interface MonthlySummary {
  month: number;
  total: number;
}

export interface YtdCategoryAverage {
  category_id: number;
  category: string;
  total: number;
  monthly_average: number;
}

export interface YtdMonthVariance {
  month: number;
  planned: number;
  actual: number;
  variance: number;
}

export interface YtdSummary {
  year: number;
  months_elapsed: number;
  category_averages: YtdCategoryAverage[];
  monthly_variance: YtdMonthVariance[];
}

export interface Transaction {
  transaction_id: number;
  subcategory_id: number;
  category_id: number;
  paid_by_person_id: number | null;
  transaction_date: string;
  amount: number;
  location: string | null;
  notes: string | null;
  subcategory: string;
  category: string;
  paid_by: string | null;
}

export interface TransactionInput {
  subcategory_id: number;
  transaction_date: string;
  amount: number;
  location?: string;
  paid_by_person_id?: number;
  notes?: string;
}

export interface Paycheck {
  paycheck_id: number;
  person_id: number;
  person_name: string;
  paycheck_date: string;
  amount: number;
}

export interface ContributionPerson {
  person_id: number;
  name: string;
  biweekly_amount: number;
  income: number;
  income_percentage: number;
  monthly_share: number;
  paid_personally: number;
  transfer_due: number;
  credit: number;
}

export interface ContributionSummary {
  household_income: number;
  planned_expenses: number;
  pay_periods: number;
  people: ContributionPerson[];
}

export interface IncomeConfig {
  person_id: number;
  name: string;
  biweekly_amount: number;
}

export interface Category {
  category_id: number;
  name: string;
  display_order: number;
}

export interface Subcategory {
  subcategory_id: number;
  category_id: number;
  name: string;
  display_order: number;
}

export interface Person {
  person_id: number;
  name: string;
  is_household: boolean;
}

export interface CategorySummary {
  category_id: number;
  category: string;
  total: number;
}

export interface BudgetLine {
  subcategory_id: number;
  subcategory: string;
  category: string;
  projected_amount: number;
  actual_amount: number;
}

export interface Goal {
  goal_id: number;
  year: number;
  description: string;
}

export interface ImportSheetSummary {
  name: string;
  year: number;
  month: number;
  budget_lines: number;
  transactions: number;
  generated_transactions: number;
}

export interface ImportWarning {
  sheet: string;
  cell: string | null;
  message: string;
}

export interface ImportBudgetSample {
  source_sheet: string;
  year: number;
  month: number;
  category: string;
  subcategory: string;
  projected_amount: number;
}

export interface ImportTransactionSample {
  source_sheet: string;
  category: string;
  subcategory: string;
  transaction_date: string;
  amount: number;
  location: string;
  paid_by: string | null;
  generated: boolean;
}

export interface WorkbookImportPreview {
  import_id: string;
  file_name: string;
  expires_at: string;
  summary: {
    months: number;
    first_month: string;
    last_month: string;
    budget_lines: number;
    transactions: number;
    detailed_transactions: number;
    generated_transactions: number;
  };
  sheets: ImportSheetSummary[];
  warning_count: number;
  warnings: ImportWarning[];
  sample_budgets: ImportBudgetSample[];
  sample_transactions: ImportTransactionSample[];
}

export interface WorkbookImportResult {
  months_imported: number;
  budget_lines_upserted: number;
  transactions_inserted: number;
  transactions_skipped: number;
  subcategories_created: string[];
  unmatched_payers: string[];
}

function buildUrl(path: string) {
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestJson<T>(path: string, init?: RequestInit, retries = 2): Promise<T> {
  if (!API_URL) {
    throw new Error('API URL is not configured');
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(buildUrl(path), init);
      const responseText = await response.text();

      if (!response.ok) {
        if ((response.status >= 500 || response.status === 429) && attempt < retries) {
          await delay(500 * attempt);
          continue;
        }

        let message = responseText;
        try {
          message = JSON.parse(responseText).error || responseText;
        } catch {
          // Preserve a non-JSON server response.
        }
        throw new Error(message || `Request failed with status ${response.status}`);
      }

      return responseText ? JSON.parse(responseText) as T : undefined as T;
    } catch (error) {
      if (attempt < retries) {
        await delay(500 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Request failed for ${path}`);
}

export async function getApiStatus() {
  const rows = await requestJson<{ time: string }[]>('/test-db', undefined, 1);
  return rows[0];
}

export async function getMonthlySummary(year: number): Promise<MonthlySummary[]> {
  const rows = await requestJson<{ month: number | string; total: number | string }[]>(
    `/summary/monthly?year=${year}`,
  );
  return rows.map(row => ({ month: Number(row.month), total: Number(row.total) }));
}

export async function getYtdSummary(year: number): Promise<YtdSummary> {
  const result = await requestJson<{
    year: number | string;
    months_elapsed: number | string;
    category_averages: (Omit<YtdCategoryAverage, 'total' | 'monthly_average'> & {
      total: number | string;
      monthly_average: number | string;
    })[];
    monthly_variance: (Omit<YtdMonthVariance, 'month' | 'planned' | 'actual' | 'variance'> & {
      month: number | string;
      planned: number | string;
      actual: number | string;
      variance: number | string;
    })[];
  }>(`/summary/ytd?year=${year}`);

  return {
    year: Number(result.year),
    months_elapsed: Number(result.months_elapsed),
    category_averages: result.category_averages.map(category => ({
      ...category,
      total: Number(category.total),
      monthly_average: Number(category.monthly_average),
    })),
    monthly_variance: result.monthly_variance.map(month => ({
      month: Number(month.month),
      planned: Number(month.planned),
      actual: Number(month.actual),
      variance: Number(month.variance),
    })),
  };
}

export async function getTransactions(month?: number, year?: number): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  const suffix = params.toString();
  const rows = await requestJson<(Omit<Transaction, 'amount'> & { amount: number | string })[]>(
    `/transactions${suffix ? `?${suffix}` : ''}`,
  );
  return rows.map(row => ({
    ...row,
    transaction_id: Number(row.transaction_id),
    subcategory_id: Number(row.subcategory_id),
    category_id: Number(row.category_id),
    paid_by_person_id: row.paid_by_person_id === null ? null : Number(row.paid_by_person_id),
    amount: Number(row.amount),
  }));
}

export async function getTransaction(transactionId: number): Promise<Transaction> {
  const row = await requestJson<Omit<Transaction, 'amount'> & { amount: number | string }>(
    `/transactions/${transactionId}`,
  );
  return {
    ...row,
    transaction_id: Number(row.transaction_id),
    subcategory_id: Number(row.subcategory_id),
    category_id: Number(row.category_id),
    paid_by_person_id: row.paid_by_person_id === null ? null : Number(row.paid_by_person_id),
    amount: Number(row.amount),
  };
}

export async function addTransaction(transaction: TransactionInput) {
  return requestJson<{ transaction_id: number }>('/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transaction),
  });
}

export async function updateTransaction(transactionId: number, transaction: TransactionInput) {
  return requestJson<{ transaction_id: number }>(`/transactions/${transactionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transaction),
  });
}

export async function deleteTransaction(transactionId: number) {
  return requestJson<{ transaction_id: number }>(`/transactions/${transactionId}`, {
    method: 'DELETE',
  });
}

export function getCategories() {
  return requestJson<Category[]>('/categories');
}

export async function getSubcategories(categoryId?: number): Promise<Subcategory[]> {
  const suffix = categoryId ? `?category_id=${categoryId}` : '';
  return requestJson<Subcategory[]>(`/subcategories${suffix}`);
}
export function createSubcategory(categoryId: number, name: string) {
  return requestJson<Subcategory>('/subcategories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category_id: categoryId, name }),
  }, 1);
}

export function deleteSubcategory(subcategoryId: number) {
  return requestJson<{ subcategory_id: number }>(`/subcategories/${subcategoryId}`, { method: 'DELETE' }, 1);
}
export function getPeople() {
  return requestJson<Person[]>('/people');
}

export async function getPaychecks(month: number, year: number): Promise<Paycheck[]> {
  const rows = await requestJson<(Omit<Paycheck, 'amount'> & { amount: number | string })[]>(
    `/paychecks?month=${month}&year=${year}`,
  );
  return rows.map(row => ({
    ...row,
    paycheck_id: Number(row.paycheck_id),
    person_id: Number(row.person_id),
    amount: Number(row.amount),
  }));
}

export function addPaycheck(paycheck: { person_id: number; paycheck_date: string; amount: number }) {
  return requestJson<{ paycheck_id: number }>('/paychecks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paycheck),
  });
}

export function deletePaycheck(paycheckId: number) {
  return requestJson<{ paycheck_id: number }>(`/paychecks/${paycheckId}`, { method: 'DELETE' });
}

export async function getContributionSummary(month: number, year: number): Promise<ContributionSummary> {
  const result = await requestJson<{
    household_income: number | string;
    planned_expenses: number | string;
    pay_periods: number | string;
    people: (Omit<ContributionPerson, 'biweekly_amount' | 'income' | 'income_percentage' | 'monthly_share' | 'paid_personally' | 'transfer_due' | 'credit'> & {
      biweekly_amount: number | string;
      income: number | string;
      income_percentage: number | string;
      monthly_share: number | string;
      paid_personally: number | string;
      transfer_due: number | string;
      credit: number | string;
    })[];
  }>(`/contributions?month=${month}&year=${year}`);

  return {
    household_income: Number(result.household_income),
    planned_expenses: Number(result.planned_expenses),
    pay_periods: Number(result.pay_periods),
    people: result.people.map(person => ({
      ...person,
      person_id: Number(person.person_id),
      biweekly_amount: Number(person.biweekly_amount),
      income: Number(person.income),
      income_percentage: Number(person.income_percentage),
      monthly_share: Number(person.monthly_share),
      paid_personally: Number(person.paid_personally),
      transfer_due: Number(person.transfer_due),
      credit: Number(person.credit),
    })),
  };
}

export function getIncomeConfig() {
  return requestJson<IncomeConfig[]>('/income-config');
}

export function saveIncomeConfig(personId: number, biweeklyAmount: number) {
  return requestJson<{ person_id: number; biweekly_amount: number }>(`/income-config/${personId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ biweekly_amount: biweeklyAmount }),
  }, 1);
}

export async function getCategorySummary(month: number, year: number): Promise<CategorySummary[]> {
  const rows = await requestJson<
    (Omit<CategorySummary, 'total'> & { total: number | string })[]
  >(`/summary/categories?month=${month}&year=${year}`);
  return rows.map(row => ({ ...row, total: Number(row.total) }));
}

export async function getBudgetLines(month: number, year: number): Promise<BudgetLine[]> {
  const rows = await requestJson<
    (Omit<BudgetLine, 'projected_amount' | 'actual_amount'> & {
      projected_amount: number | string;
      actual_amount: number | string;
    })[]
  >(`/budget-lines?month=${month}&year=${year}`);

  return rows.map(row => ({
    ...row,
    projected_amount: Number(row.projected_amount),
    actual_amount: Number(row.actual_amount),
  }));
}

export function saveBudgetLine(
  subcategoryId: number,
  month: number,
  year: number,
  projectedAmount: number,
) {
  return requestJson<{ subcategory_id: number; projected_amount: number | string }>(
    `/budget-lines/${subcategoryId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year, projected_amount: projectedAmount }),
    },
  );
}

export function getGoals(year: number) {
  return requestJson<Goal[]>(`/goals?year=${year}`);
}

export function addGoal(year: number, description: string) {
  return requestJson<{ goal_id: number }>('/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, description }),
  });
}

export function deleteGoal(goalId: number) {
  return requestJson<{ goal_id: number }>(`/goals/${goalId}`, { method: 'DELETE' });
}

export function previewWorkbookImport(asset: DocumentPickerAsset) {
  const body = new FormData();
  if (Platform.OS === 'web' && asset.file) {
    body.append('file', asset.file as unknown as Blob, asset.name);
  } else {
    body.append('file', {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as unknown as Blob);
  }

  return requestJson<WorkbookImportPreview>('/imports/xlsx/preview', {
    method: 'POST',
    body,
  }, 1);
}

export function commitWorkbookImport(importId: string) {
  return requestJson<WorkbookImportResult>(`/imports/xlsx/${importId}/commit`, {
    method: 'POST',
  }, 1);
}
