const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim();
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

export async function getMonthlySummary(year: number) {
  if (!API_URL) {
    return FALLBACK_MONTHLY_SUMMARY;
  }

  try {
    const res = await fetch(buildUrl(`/summary/monthly?year=${year}`));
    if (!res.ok) throw new Error("Failed to fetch monthly summary");
    return res.json();
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

  const res = await fetch(buildUrl(`/transactions?${params}`));
  if (!res.ok) throw new Error("Failed to fetch transactions");
  return res.json();
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
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transaction),
    });

    const responseText = await res.text();
    console.log('Response status:', res.status);
    console.log('Response text:', responseText);

    if (!res.ok) {
      throw new Error(`Server error: ${res.status} - ${responseText}`);
    }

    try {
      return JSON.parse(responseText);
    } catch {
      return { success: true };
    }
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
    const res = await fetch(buildUrl("/categories"));
    if (!res.ok) throw new Error("Failed to fetch categories");
    return res.json();
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
    const res = await fetch(buildUrl(`/subcategories${params}`));
    if (!res.ok) throw new Error("Failed to fetch subcategories");
    return res.json();
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
    const res = await fetch(buildUrl("/people"));
    if (!res.ok) throw new Error("Failed to fetch people");
    return res.json();
  } catch (error) {
    console.warn("Failed to fetch people", error);
    return [];
  }
}