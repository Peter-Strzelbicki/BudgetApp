import { router } from 'expo-router';
import { ArrowRight, CircleDollarSign, Landmark, ReceiptText, WalletCards } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { EmptyState, ErrorNotice, formatCurrency, Page, PageHeading, Panel, SectionHeader, StatCard } from '@/components/budget-ui';
import { BudgetLine, CategorySummary, getBudgetLines, getCategorySummary, getMonthlySummary, getTransactions, MonthlySummary, Transaction } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function DashboardScreen() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const compact = useWindowDimensions().width < 760;
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [monthlyRows, transactionRows, categoryRows, budgetRows] = await Promise.all([
        getMonthlySummary(year), getTransactions(month, year), getCategorySummary(month, year), getBudgetLines(month, year),
      ]);
      setMonthly(monthlyRows);
      setTransactions(transactionRows);
      setCategories(categoryRows);
      setBudgetLines(budgetRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The household API is unavailable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totalsByMonth = Array.from({ length: 12 }, (_, index) => monthly.find(row => row.month === index + 1)?.total ?? 0);
  const monthSpend = totalsByMonth[month - 1];
  const yearSpend = totalsByMonth.reduce((sum, total) => sum + total, 0);
  const planned = budgetLines.reduce((sum, line) => sum + line.projected_amount, 0);
  const remaining = planned - monthSpend;
  const topCategory = categories.find(category => category.total > 0);
  const maxMonth = Math.max(...totalsByMonth, 1);
  const maxCategory = Math.max(...categories.map(category => category.total), 1);

  return (
    <Page refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={BudgetColors.green} />}>
      <PageHeading
        eyebrow={`${now.toLocaleDateString('en-US', { month: 'long' })} ${year}`}
        title="Household overview"
        description="A current read on spending, plans, and the transactions behind them."
        action={<ActionButton label="Record expense" onPress={() => router.push('/add-transaction')} />}
      />
      {error && <ErrorNotice message={error} onRetry={() => load()} />}
      {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View> : (
        <>
          <View style={styles.statsGrid}>
            <StatCard label="Spent this month" value={formatCurrency(monthSpend)} detail={`${transactions.length} recorded transaction${transactions.length === 1 ? '' : 's'}`} icon={<ReceiptText color={BudgetColors.coral} size={19} />} accent={BudgetColors.coral} />
            <StatCard label="Planned this month" value={formatCurrency(planned)} detail={planned > 0 ? `${formatCurrency(Math.abs(remaining))} ${remaining >= 0 ? 'available' : 'over plan'}` : 'Set a plan in Budget'} icon={<WalletCards color={BudgetColors.green} size={19} />} />
            <StatCard label={`${year} spending`} value={formatCurrency(yearSpend)} detail={`${formatCurrency(yearSpend / Math.max(month, 1))} monthly average`} icon={<Landmark color={BudgetColors.blue} size={19} />} accent={BudgetColors.blue} />
            <StatCard label="Largest category" value={topCategory?.category ?? 'No spending'} detail={topCategory ? formatCurrency(topCategory.total) : 'Nothing recorded this month'} icon={<CircleDollarSign color={BudgetColors.gold} size={19} />} accent={BudgetColors.gold} />
          </View>

          <View style={[styles.twoColumn, compact && styles.oneColumn]}>
            <Panel style={styles.chartPanel}>
              <SectionHeader title={`${year} spending rhythm`} detail="Monthly expenses recorded in the ledger" action={<TextLink label="Insights" onPress={() => router.push('/explore')} />} />
              <View style={styles.chart}>
                {totalsByMonth.map((total, index) => {
                  const active = index + 1 === month;
                  const height = Math.max(total > 0 ? 4 : 2, Math.round((total / maxMonth) * 142));
                  return <View key={MONTHS[index]} style={styles.barColumn}>
                    <View style={styles.barTrack}><View style={[styles.bar, { height }, active && styles.barActive, index + 1 > month && styles.barFuture]} /></View>
                    <Text style={[styles.barLabel, active && styles.barLabelActive]}>{MONTHS[index]}</Text>
                  </View>;
                })}
              </View>
            </Panel>

            <Panel style={styles.categoryPanel}>
              <SectionHeader title="This month by category" detail="Where household spending is landing" />
              {categories.every(category => category.total === 0) ? <EmptyState title="No category activity" detail="Add a transaction to see this breakdown." /> : (
                <View style={styles.categoryList}>
                  {categories.filter(category => category.total > 0).slice(0, 6).map((category, index) => <View key={category.category_id} style={styles.categoryRow}>
                    <View style={styles.categoryLine}>
                      <View style={[styles.rank, index === 0 && styles.rankFirst]}><Text style={styles.rankText}>{index + 1}</Text></View>
                      <Text style={styles.categoryName} numberOfLines={1}>{category.category}</Text>
                      <Text style={styles.categoryAmount}>{formatCurrency(category.total)}</Text>
                    </View>
                    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(3, category.total / maxCategory * 100)}%` }]} /></View>
                  </View>)}
                </View>
              )}
            </Panel>
          </View>

          <Panel>
            <SectionHeader title="Recent transactions" detail="Latest entries for the current month" action={<TextLink label="View all" onPress={() => router.push('/transactions')} />} />
            {transactions.length === 0 ? <EmptyState title="A clean slate" detail="No transactions have been recorded this month." /> : transactions.slice(0, 5).map((transaction, index) => (
              <View key={transaction.transaction_id} style={[styles.transactionRow, index === 0 && styles.transactionRowFirst]}>
                <View style={styles.transactionGlyph}><ReceiptText color={BudgetColors.green} size={17} /></View>
                <View style={styles.transactionCopy}>
                  <Text style={styles.transactionName}>{transaction.location || transaction.subcategory}</Text>
                  <Text style={styles.transactionMeta}>{transaction.category} · {new Date(transaction.transaction_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                </View>
                <Text style={styles.transactionAmount}>{formatCurrency(transaction.amount, 2)}</Text>
              </View>
            ))}
          </Panel>
        </>
      )}
    </Page>
  );
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
    <ReceiptText color={BudgetColors.surface} size={17} /><Text style={styles.primaryButtonText}>{label}</Text>
  </Pressable>;
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.inlineAction}><Text style={styles.inlineActionText}>{label}</Text><ArrowRight color={BudgetColors.green} size={15} /></Pressable>;
}

const styles = StyleSheet.create({
  primaryButton: { minHeight: 42, paddingHorizontal: 15, borderRadius: 8, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.7 },
  loader: { minHeight: 360, alignItems: 'center', justifyContent: 'center' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  twoColumn: { flexDirection: 'row', alignItems: 'stretch', gap: 16 },
  oneColumn: { flexDirection: 'column' },
  chartPanel: { flex: 1.45, minWidth: 0 },
  categoryPanel: { flex: 1, minWidth: 0 },
  inlineAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5 },
  inlineActionText: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  chart: { height: 184, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  barColumn: { flex: 1, minWidth: 12, alignItems: 'center', gap: 7 },
  barTrack: { height: 150, width: '100%', maxWidth: 34, justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: '#AFC8BA', borderRadius: 3 },
  barActive: { backgroundColor: BudgetColors.green },
  barFuture: { backgroundColor: '#E8ECE7' },
  barLabel: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 9 },
  barLabelActive: { color: BudgetColors.ink, fontWeight: '800' },
  categoryList: { gap: 15 },
  categoryRow: { gap: 7 },
  categoryLine: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  rank: { width: 22, height: 22, borderRadius: 5, backgroundColor: BudgetColors.canvas, alignItems: 'center', justifyContent: 'center' },
  rankFirst: { backgroundColor: BudgetColors.goldSoft },
  rankText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '800' },
  categoryName: { flex: 1, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '700' },
  categoryAmount: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 4, marginLeft: 31, borderRadius: 2, backgroundColor: BudgetColors.canvas, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: BudgetColors.green },
  transactionRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: BudgetColors.line },
  transactionRowFirst: { borderTopWidth: 0 },
  transactionGlyph: { width: 34, height: 34, borderRadius: 7, backgroundColor: BudgetColors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  transactionCopy: { flex: 1, minWidth: 0, gap: 3 },
  transactionName: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  transactionMeta: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  transactionAmount: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
});