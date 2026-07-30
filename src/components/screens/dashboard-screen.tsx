import { router } from 'expo-router';
import { ArrowRight, Landmark, ReceiptText, WalletCards } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { EmptyState, ErrorNotice, formatCurrency, Page, PageHeading, Panel, SectionHeader, StatCard, YearSwitcher } from '@/components/budget-ui';
import { ContributionPanel } from '@/components/contribution-panel';
import { BudgetLine, ContributionSummary, getBudgetLines, getContributionSummary, getIncomeSummary, getMonthlySummary, getTransactions, getYtdSummary, IncomeMonthSummary, MonthlySummary, Transaction, YtdSummary } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function DashboardScreen() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const compact = useWindowDimensions().width < 760;
  const [year, setYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [incomeSummary, setIncomeSummary] = useState<IncomeMonthSummary[]>([]);
  const [ytd, setYtd] = useState<YtdSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [contribution, setContribution] = useState<ContributionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthLoading, setMonthLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monthRequest = useRef(0);

  const load = async (refresh = false, targetYear = year, targetMonth = selectedMonth) => {
    const requestId = ++monthRequest.current;
    setMonthLoading(false);
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [monthlyRows, incomeRows, ytdRows, transactionRows, budgetRows, contributionRows] = await Promise.all([
        getMonthlySummary(targetYear),
        getIncomeSummary(targetYear),
        getYtdSummary(targetYear),
        getTransactions(targetMonth, targetYear),
        getBudgetLines(targetMonth, targetYear),
        getContributionSummary(targetMonth, targetYear),
      ]);
      if (requestId !== monthRequest.current) return;
      setMonthly(monthlyRows);
      setIncomeSummary(incomeRows);
      setYtd(ytdRows);
      setTransactions(transactionRows);
      setBudgetLines(budgetRows);
      setContribution(contributionRows);
    } catch (loadError) {
      if (requestId === monthRequest.current) {
        setError(loadError instanceof Error ? loadError.message : 'The household API is unavailable.');
      }
    } finally {
      if (requestId === monthRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => { load(false, currentYear, currentMonth); }, []);

  const selectMonth = async (month: number) => {
    if (month === selectedMonth && !error) return;
    const requestId = ++monthRequest.current;
    setSelectedMonth(month);
    setRefreshing(false);
    setMonthLoading(true);
    setError(null);
    try {
      const [transactionRows, budgetRows, contributionRows] = await Promise.all([
        getTransactions(month, year),
        getBudgetLines(month, year),
        getContributionSummary(month, year),
      ]);
      if (requestId !== monthRequest.current) return;
      setTransactions(transactionRows);
      setBudgetLines(budgetRows);
      setContribution(contributionRows);
    } catch (loadError) {
      if (requestId === monthRequest.current) {
        setError(loadError instanceof Error ? loadError.message : 'The selected month could not be loaded.');
      }
    } finally {
      if (requestId === monthRequest.current) setMonthLoading(false);
    }
  };

  const selectYear = (nextYear: number) => {
    if (nextYear > currentYear || nextYear < 2000 || nextYear === year) return;
    setYear(nextYear);
    load(false, nextYear, selectedMonth);
  };

  const totalsByMonth = Array.from({ length: 12 }, (_, index) => monthly.find(row => row.month === index + 1)?.total ?? 0);
  const monthSpend = totalsByMonth[selectedMonth - 1];
  const yearSpend = totalsByMonth.reduce((sum, total) => sum + total, 0);
  const ytdMonths = Math.max(1, Math.min(12, ytd?.months_elapsed ?? (year === currentYear ? currentMonth : 12)));
  const yearIncome = incomeSummary
    .filter(row => row.month <= ytdMonths)
    .reduce((sum, row) => sum + row.total_income, 0);
  const yearNet = yearIncome - yearSpend;
  const planned = budgetLines.reduce((sum, line) => sum + line.projected_amount, 0);
  const remaining = planned - monthSpend;
  const monthlyIncome = contribution?.household_income ?? 0;
  const incomeRemaining = monthlyIncome - monthSpend;
  const spendPct = monthlyIncome > 0 ? Math.min(monthSpend / monthlyIncome * 100, 100) : 0;
  const varianceByMonth = new Map((ytd?.monthly_variance ?? []).map(row => [row.month, row]));
  const chartMax = Math.max(...totalsByMonth, ...(ytd?.monthly_variance.map(row => row.planned) ?? []), 1);
  const selectedMonthName = new Date(year, selectedMonth - 1, 1).toLocaleDateString('en-CA', { month: 'long' });

  return (
    <Page refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={BudgetColors.green} />}>
      <PageHeading
        eyebrow={`${selectedMonthName} ${year}`}
        title="Household overview"
        description="Select any month in the chart to update spending, plans, categories, and transactions."
        action={<View style={styles.headingActions}>
          <YearSwitcher
            year={year}
            previousDisabled={year <= 2000}
            nextDisabled={year >= currentYear}
            onPrevious={() => selectYear(year - 1)}
            onNext={() => selectYear(year + 1)}
          />
        </View>}
      />
      {error && <ErrorNotice message={error} onRetry={() => load()} />}
      {monthLoading && <View style={styles.monthLoading}><ActivityIndicator color={BudgetColors.green} size="small" /><Text style={styles.monthLoadingText}>Loading {selectedMonthName}</Text></View>}
      {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View> : (
        <>
          <View style={styles.statsGrid}>
            <StatCard label={`${selectedMonthName} spending`} value={formatCurrency(monthSpend)} detail={`${transactions.length} recorded transaction${transactions.length === 1 ? '' : 's'}`} icon={<ReceiptText color={BudgetColors.coral} size={19} />} accent={BudgetColors.coral} />
            <StatCard label={`${selectedMonthName} plan`} value={formatCurrency(planned)} detail={planned > 0 ? `${formatCurrency(Math.abs(remaining))} ${remaining >= 0 ? 'under plan' : 'over plan'}` : 'No plan entered'} icon={<WalletCards color={BudgetColors.green} size={19} />} />
            <StatCard
              label={`${year} net`}
              value={formatCurrency(yearNet)}
              detail={`${formatCurrency(yearIncome)} income · ${formatCurrency(yearSpend)} spending`}
              icon={<Landmark color={yearNet >= 0 ? BudgetColors.green : BudgetColors.coral} size={19} />}
              accent={yearNet >= 0 ? BudgetColors.green : BudgetColors.coral}
            />
          </View>

          {monthlyIncome > 0 && (
            <View style={styles.incomeBarPanel}>
              <View style={styles.incomeBarHeader}>
                <Text style={styles.incomeBarTitle}>Monthly income</Text>
                <Text style={styles.incomeBarTotal}>{formatCurrency(monthlyIncome, 2)}</Text>
              </View>
              <View style={styles.incomeTrack}>
                <View style={[styles.incomeFill, { width: `${spendPct}%` }, monthSpend > monthlyIncome && styles.incomeFillOver]} />
              </View>
              <View style={styles.incomeBarFooter}>
                <Text style={styles.incomeSpent}>{formatCurrency(monthSpend, 2)} spent</Text>
                <Text style={[styles.incomeLeft, incomeRemaining < 0 && styles.incomeOver]}>
                  {incomeRemaining >= 0
                    ? `${formatCurrency(incomeRemaining, 2)} remaining`
                    : `${formatCurrency(Math.abs(incomeRemaining), 2)} over income`}
                </Text>
              </View>
            </View>
          )}

          <ContributionPanel summary={contribution} action={<TextLink label="Manage income" onPress={() => router.push('/budget')} />} />

          <View style={[styles.twoColumn, compact && styles.oneColumn]}>
            <Panel style={styles.chartPanel}>
              <SectionHeader title={`${year} spending rhythm`} detail={`${selectedMonthName}: ${formatCurrency(monthSpend)} spent · ${planned > 0 ? `${formatCurrency(Math.abs(remaining))} ${remaining >= 0 ? 'under' : 'over'} plan` : 'no plan entered'}`} action={<TextLink label="Insights" onPress={() => router.push('/explore')} />} />
              <View style={styles.chartLegend}>
                <View style={styles.chartLegendItem}><View style={styles.chartPlanKey} /><Text style={styles.chartLegendText}>Monthly plan</Text></View>
                <View style={styles.chartLegendItem}><View style={styles.chartOverKey} /><Text style={styles.chartLegendText}>Over plan</Text></View>
              </View>
              <View style={styles.chart}>
                {totalsByMonth.map((total, index) => {
                  const chartMonth = index + 1;
                  const active = chartMonth === selectedMonth;
                  const variance = varianceByMonth.get(chartMonth);
                  const plan = variance?.planned ?? 0;
                  const overPlan = plan > 0 && total > plan;
                  const height = Math.max(total > 0 ? 4 : 2, Math.round((total / chartMax) * 142));
                  const planBottom = Math.min(Math.round((plan / chartMax) * 142), 142);
                  return <Pressable
                    key={MONTHS[index]}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${MONTHS[index]} ${year}, ${formatCurrency(total)} spent${plan > 0 ? `, ${formatCurrency(Math.abs(total - plan))} ${overPlan ? 'over' : 'under'} plan` : ''}`}
                    accessibilityState={{ selected: active, busy: monthLoading && active }}
                    onPress={() => selectMonth(chartMonth)}
                    style={({ pressed }) => [styles.barColumn, active && styles.barColumnActive, pressed && styles.barPressed]}>
                    <View style={[styles.barTrack, active && styles.barTrackActive]}>
                      <View style={[styles.bar, { height }, year === currentYear && chartMonth > currentMonth && styles.barFuture, active && !overPlan && styles.barActive, overPlan && styles.barOver]} />
                      {plan > 0 && <View style={[styles.planMarker, { bottom: planBottom }]} />}
                    </View>
                    <Text style={[styles.barLabel, active && styles.barLabelActive]}>{MONTHS[index]}</Text>
                  </Pressable>;
                })}
              </View>
            </Panel>
          </View>

          <View style={[styles.twoColumn, compact && styles.oneColumn]}>
            <Panel style={styles.variancePanel}>
              <SectionHeader title="Monthly budget check" detail="Actual spending compared with each month's plan" />
              {!ytd || ytd.monthly_variance.length === 0 ? (
                <EmptyState title="No budget history" detail="Monthly comparisons will appear after plans are entered." />
              ) : (
                <View>
                  {ytd.monthly_variance.map((month, index) => {
                    const underBudget = month.variance >= 0;
                    const noActivity = month.planned === 0 && month.actual === 0;
                    return (
                      <View key={month.month} style={[styles.varianceRow, index === 0 && styles.varianceRowFirst]}>
                        <View style={[styles.varianceDot, noActivity ? styles.varianceDotIdle : underBudget ? styles.varianceDotUnder : styles.varianceDotOver]} />
                        <View style={styles.varianceCopy}>
                          <Text style={styles.varianceMonth}>{MONTHS[month.month - 1]}</Text>
                          <Text style={styles.varianceDetail}>{formatCurrency(month.actual)} spent of {formatCurrency(month.planned)}</Text>
                        </View>
                        <Text style={[styles.varianceAmount, !noActivity && (underBudget ? styles.varianceUnder : styles.varianceOver)]}>
                          {noActivity ? 'No activity' : `${formatCurrency(Math.abs(month.variance))} ${underBudget ? 'under' : 'over'}`}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </Panel>
          </View>

          <Panel>
            <SectionHeader title={`${selectedMonthName} transactions`} detail="Latest entries for the selected month" action={<TextLink label="View all" onPress={() => router.push('/transactions')} />} />
            {transactions.length === 0 ? <EmptyState title="A clean slate" detail={`No transactions were recorded in ${selectedMonthName}.`} /> : transactions.slice(0, 5).map((transaction, index) => (
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

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.inlineAction}><Text style={styles.inlineActionText}>{label}</Text><ArrowRight color={BudgetColors.green} size={15} /></Pressable>;
}

const styles = StyleSheet.create({
  headingActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' },
  primaryButton: { minHeight: 42, paddingHorizontal: 15, borderRadius: 8, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.7 },
  loader: { minHeight: 360, alignItems: 'center', justifyContent: 'center' },
  monthLoading: { minHeight: 38, paddingHorizontal: 12, borderRadius: 7, backgroundColor: BudgetColors.greenSoft, flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthLoadingText: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  incomeBarPanel: { padding: 20, borderRadius: 8, backgroundColor: BudgetColors.surface, borderWidth: 1, borderColor: BudgetColors.line },
  incomeBarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  incomeBarTitle: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  incomeBarTotal: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  incomeTrack: { height: 16, borderRadius: 8, backgroundColor: BudgetColors.canvas, overflow: 'hidden', marginBottom: 10 },
  incomeFill: { height: 16, borderRadius: 8, backgroundColor: BudgetColors.green },
  incomeFillOver: { backgroundColor: BudgetColors.coral },
  incomeBarFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  incomeSpent: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  incomeLeft: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  incomeOver: { color: BudgetColors.coral },
  twoColumn: { flexDirection: 'row', alignItems: 'stretch', gap: 16 },
  oneColumn: { flexDirection: 'column' },
  chartPanel: { flex: 1.45, minWidth: 0 },
  inlineAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5 },
  inlineActionText: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  chartLegend: { minHeight: 24, marginBottom: 4, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  chartLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chartLegendText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '700' },
  chartPlanKey: { width: 14, height: 2, borderRadius: 1, backgroundColor: BudgetColors.gold },
  chartOverKey: { width: 10, height: 10, borderRadius: 2, backgroundColor: BudgetColors.coral },
  chart: { height: 184, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  barColumn: { flex: 1, minWidth: 12, alignItems: 'center', gap: 7 },
  barColumnActive: { backgroundColor: BudgetColors.greenSoft, borderRadius: 8, paddingTop: 4, paddingHorizontal: 2 },
  barPressed: { opacity: 0.62 },
  barTrack: { position: 'relative', height: 150, width: '100%', maxWidth: 34, justifyContent: 'flex-end', borderRadius: 5, paddingHorizontal: 2, paddingTop: 3 },
  barTrackActive: {},
  bar: { width: '100%', backgroundColor: BudgetColors.bar, borderRadius: 3 },
  barActive: { backgroundColor: BudgetColors.green },
  barOver: { backgroundColor: BudgetColors.coral },
  barFuture: { backgroundColor: BudgetColors.barFuture },
  planMarker: { position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 1, backgroundColor: BudgetColors.gold },
  barLabel: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 9 },
  barLabelActive: { color: BudgetColors.ink, fontWeight: '800' },
  variancePanel: { flex: 1, minWidth: 0 },
  varianceRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: BudgetColors.line },
  varianceRowFirst: { borderTopWidth: 0 },
  varianceDot: { width: 8, height: 8, borderRadius: 4 },
  varianceDotUnder: { backgroundColor: BudgetColors.green },
  varianceDotOver: { backgroundColor: BudgetColors.coral },
  varianceDotIdle: { backgroundColor: BudgetColors.faint },
  varianceCopy: { flex: 1, minWidth: 0, gap: 2 },
  varianceMonth: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  varianceDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 9 },
  varianceAmount: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  varianceUnder: { color: BudgetColors.green },
  varianceOver: { color: BudgetColors.coral },
  transactionRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: BudgetColors.line },
  transactionRowFirst: { borderTopWidth: 0 },
  transactionGlyph: { width: 34, height: 34, borderRadius: 7, backgroundColor: BudgetColors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  transactionCopy: { flex: 1, minWidth: 0, gap: 3 },
  transactionName: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  transactionMeta: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  transactionAmount: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
});