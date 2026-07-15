import { Platform } from 'react-native';

const DEFAULT_API_URL = Platform.select({
  android: 'http://10.0.2.2:3000',
  default:
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:3000`
      : 'http://localhost:3000',
});

const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_API_URL;
const FALLBACK_MONTHLY_SUMMARY = [
  { month: 1, total: 3200 },
  { month: 2, total: 3900 },
  { month: 3, total: 2800 },
  { month: 4, total: 4200 },
  { month: 5, total: 3100 },
  { month: 6, total: 3500 },
  { month: 7, total: 3450 },
];

function buildUrl(path: string) {
  if (!API_URL) {
    return path;
  }

  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestJson<T>(path: string, init?: RequestInit, retries = 3): Promise<T> {
  const url = buildUrl(path);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      const responseText = await res.text();

      if (!res.ok) {
        if ((res.status >= 500 || res.status === 429) && attempt < retries) {
          console.warn(`Request failed (${res.status}) for ${path}; retrying (${attempt}/${retries})`);
          await delay(1000 * attempt);
          continue;
        }

        throw new Error(`Server error: ${res.status} - ${responseText}`);
      }

      if (!responseText) {
        return [] as T;
      }

      return JSON.parse(responseText) as T;
    } catch (error) {
      if (attempt < retries) {
        console.warn(`Request failed for ${path}; retrying (${attempt}/${retries})`, error);
        await delay(1000 * attempt);
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Request failed for ${path}`);
}

export async function getMonthlySummary(year: number) {
  if (!API_URL) {
    return FALLBACK_MONTHLY_SUMMARY;
  }

  try {
    return await requestJson<{ month: number; total: number }[]>(`/summary/monthly?year=${year}`);
  } catch (error) {
    console.warn("Falling back to demo monthly summary data", error);
    return FALLBACK_MONTHLY_SUMMARY;
  }
}

export async function getTransactions(month?: number, year?: number) {
  const params = new URLSearchParams();
  if (month) params.set("month", String(month));
  if (year) params.set("year", String(year));

  if (!API_URL) {
    return [];
  }

  try {
    return await requestJson<any[]>(`/transactions?${params}`);
  } catch (error) {
    console.warn("Failed to fetch transactions", error);
    return [];
  }
}

export async function addTransaction(transaction: {
  subcategory_id: number;
  transaction_date: string;
  amount: number;
  location?: string;
  paid_by_person_id?: number;
  notes?: string;
}) {
  if (!API_URL) {
    console.error('API_URL not configured');
    throw new Error('API not configured');
  }

  const url = buildUrl("/transactions");
  console.log('Submitting transaction to:', url);
  console.log('Payload:', transaction);

  try {
    const result = await requestJson<{ success?: boolean; transaction_id?: number }>("/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transaction),
    });

    console.log('Transaction response:', result);
    return result;
  } catch (error) {
    console.error('Failed to add transaction:', error);
    throw error;
  }
}

export async function getCategories() {
  if (!API_URL) {
    return [];
  }

  try {
    return await requestJson<any[]>("/categories");
  } catch (error) {
    console.warn("Failed to fetch categories", error);
    return [];
  }
}

export async function getSubcategories(categoryId?: number) {
  if (!API_URL) {
    return [];
  }

  try {
    const params = categoryId ? `?category_id=${categoryId}` : '';
    return await requestJson<any[]>(`/subcategories${params}`);
  } catch (error) {
    console.warn("Failed to fetch subcategories", error);
    return [];
  }
}

export async function getPeople() {
  if (!API_URL) {
    return [];
  }

  try {
    return await requestJson<any[]>("/people");
  } catch (error) {
    console.warn("Failed to fetch people", error);
    return [];
  }
}