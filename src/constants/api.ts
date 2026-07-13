const API_URL = process.env.EXPO_PUBLIC_API_URL;

export async function getMonthlySummary(year: number) {
  const res = await fetch(`${API_URL}/summary/monthly?year=${year}`);
  if (!res.ok) throw new Error("Failed to fetch monthly summary");
  return res.json(); // [{ month: 1, total: 3200 }, ...]
}

export async function getTransactions(month?: number, year?: number) {
  const params = new URLSearchParams();
  if (month) params.set("month", String(month));
  if (year) params.set("year", String(year));
  const res = await fetch(`${API_URL}/transactions?${params}`);
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
  const res = await fetch(`${API_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transaction),
  });
  if (!res.ok) throw new Error("Failed to add transaction");
  return res.json();
}