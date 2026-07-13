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
    return { ok: true };
  }

  const res = await fetch(buildUrl("/transactions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transaction),
  });
  if (!res.ok) throw new Error("Failed to add transaction");
  return res.json();
}