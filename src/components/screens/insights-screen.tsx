import { ChartNoAxesColumnIncreasing, ReceiptText } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorNotice, formatCurrency, MonthSwitcher, moveMonth, Page, PageHeading, Panel, SectionHeader, StatCard } from '@/components/budget-ui';
import { CategorySummary, getCategorySummary, getTransactions, Transaction } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

export default function InsightsScreen() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [categoryRows, transactionRows] = await Promise.all([getCategorySummary(month, year), getTransactions(month, year)]);
      setCategories(categoryRows); setTransactions(transactionRows);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Insights could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [month, year]);

  const changeMonth = (offset: number) => { const next = moveMonth(month, year, offset); setMonth(next.month); setYear(next.year); };
  const total = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const maxCategory = Math.max(...categories.map(category => category.total), 1);
  const largest = transactions.reduce<Transaction | null>((current, transaction) => !current || transaction.amount > current.amount ? transaction : current, null);

  return <Page>
    <PageHeading eyebrow="Patterns" title="Spending insights" description="Compare category distribution and transaction size for a selected month." action={<MonthSwitcher month={month} year={year} onPrevious={() => changeMonth(-1)} onNext={() => changeMonth(1)} />} />
    {error && <ErrorNotice message={error} onRetry={load} />}
    {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View> : <>
      <View style={styles.stats}>
        <StatCard label="Monthly total" value={formatCurrency(total)} detail={`${transactions.length} transactions`} icon={<ChartNoAxesColumnIncreasing color={BudgetColors.green} size={19} />} />
        <StatCard label="Typical transaction" value={formatCurrency(transactions.length ? total / transactions.length : 0)} detail="Average recorded expense" icon={<ReceiptText color={BudgetColors.blue} size={19} />} accent={BudgetColors.blue} />
        <StatCard label="Largest transaction" value={formatCurrency(largest?.amount || 0)} detail={largest?.location || largest?.subcategory || 'No activity'} accent={BudgetColors.coral} />
      </View>
      <Panel>
        <SectionHeader title="Category distribution" detail="Share of monthly spending" />
        {categories.every(category => category.total === 0) ? <EmptyState title="No spending to compare" detail="Transactions for this month will appear here." /> : <View style={styles.categoryList}>{categories.filter(category => category.total > 0).map(category => {
          const share = total ? category.total / total * 100 : 0;
          return <View key={category.category_id} style={styles.categoryRow}>
            <View style={styles.rowHeader}><Text style={styles.categoryName}>{category.category}</Text><Text style={styles.categoryValue}>{formatCurrency(category.total)} · {Math.round(share)}%</Text></View>
            <View style={styles.barTrack}><View style={[styles.barFill, { width: `${category.total / maxCategory * 100}%` }]} /></View>
          </View>;
        })}</View>}
      </Panel>
    </>}
  </Page>;
}

const styles = StyleSheet.create({
  loader: { minHeight: 360, alignItems: 'center', justifyContent: 'center' }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  categoryList: { gap: 18 }, categoryRow: { gap: 7 }, rowHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  categoryName: { flex: 1, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' }, categoryValue: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: BudgetColors.canvas, overflow: 'hidden' }, barFill: { height: 8, borderRadius: 4, backgroundColor: BudgetColors.green },
});