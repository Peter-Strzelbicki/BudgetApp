import { router } from 'expo-router';
import { ArrowRight, CircleDollarSign, Landmark, ReceiptText, WalletCards } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { EmptyState, ErrorNotice, formatCurrency, Page, PageHeading, Panel, SectionHeader, StatCard, YearSwitcher } from '@/components/budget-ui';
import { ContributionPanel } from '@/components/contribution-panel';
import { BudgetLine, CategorySummary, ContributionSummary, getBudgetLines, getCategorySummary, getContributionSummary, getMonthlySummary, getTransactions, getYtdSummary, MonthlySummary, Transaction, YtdSummary } from '@/constants/api';
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
  const [ytd, setYtd] = useState<YtdSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
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
      const [monthlyRows, ytdRows, transactionRows, categoryRows, budgetRows, contributionRows] = await Promise.all([
        getMonthlySummary(targetYear),
        getYtdSummary(targetYear),
        getTransactions(targetMonth, targetYear),
        getCategorySummary(targetMonth, targetYear),
        getBudgetLines(targetMonth, targetYear),
        getContributionSummary(targetMonth, targetYear),
      ]);
      if (requestId !== monthRequest.current) return;
      setMonthly(monthlyRows);
      setYtd(ytdRows);
      setTransactions(transactionRows);
      setCategories(categoryRows);
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
      const [transactionRows, categoryRows, budgetRows, contributionRows] = await Promise.all([
        getTransactions(month, year),
        getCategorySummary(month, year),
        getBudgetLines(month, year),
        getContributionSummary(month, year),
      ]);
      if (requestId !== monthRequest.current) return;
      setTransactions(transactionRows);
      setCategories(categoryRows);
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
  const planned = budgetLines.reduce((sum, line) => sum + line.projected_amount, 0);
  const remaining = planned - monthSpend;
  const topCategory = categories.find(category => category.total > 0);
  const maxMonth = Math.max(...totalsByMonth, 1);
  const maxCategory = Math.max(...categories.map(category => category.total), 1);
  const maxYtdAverage = Math.max(...(ytd?.category_averages.map(category => category.monthly_average) || []), 1);
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
          <ActionButton label="Record expense" onPress={() => router.push('/add-transaction')} />
        </View>}
      />
      {error && <ErrorNotice message={error} onRetry={() => load()} />}
      {monthLoading && <View style={styles.monthLoading}><ActivityIndicator color={BudgetColors.green} size="small" /><Text style={styles.monthLoadingText}>Loading {selectedMonthName}</Text></View>}
      {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View> : (
        <>
          <View style={styles.statsGrid}>
            <StatCard label={`${selectedMonthName} spending`} value={formatCurrency(monthSpend)} detail={`${transactions.length} recorded transaction${transactions.length === 1 ? '' : 's'}`} icon={<ReceiptText color={BudgetColors.coral} size={19} />} accent={BudgetColors.coral} />
            <StatCard label={`${selectedMonthName} plan`} value={formatCurrency(planned)} detail={planned > 0 ? `${formatCurrency(Math.abs(remaining))} ${remaining >= 0 ? 'under plan' : 'over plan'}` : 'No plan entered'} icon={<WalletCards color={BudgetColors.green} size={19} />} />
            <StatCard label={`${year} YTD spending`} value={formatCurrency(yearSpend)} detail={`${formatCurrency(yearSpend / Math.max(ytd?.months_elapsed || currentMonth, 1))} monthly average`} icon={<Landmark color={BudgetColors.blue} size={19} />} accent={BudgetColors.blue} />
            <StatCard label={`${selectedMonthName} leader`} value={topCategory?.category ?? 'No spending'} detail={topCategory ? formatCurrency(topCategory.total) : 'Nothing recorded'} icon={<CircleDollarSign color={BudgetColors.gold} size={19} />} accent={BudgetColors.gold} />
          </View>

          <ContributionPanel summary={contribution} action={<TextLink label="Manage income" onPress={() => router.push('/budget')} />} />

          <View style={[styles.twoColumn, compact && styles.oneColumn]}>
            <Panel style={styles.chartPanel}>
              <SectionHeader title={`${year} spending rhythm`} detail={`${selectedMonthName}: ${formatCurrency(monthSpend)} spent · ${planned > 0 ? `${formatCurrency(Math.abs(remaining))} ${remaining >= 0 ? 'under' : 'over'} plan` : 'no plan entered'}`} action={<TextLink label="Insights" onPress={() => router.push('/explore')} />} />
              <View style={styles.chart}>
                {totalsByMonth.map((total, index) => {
                  const chartMonth = index + 1;
                  const active = chartMonth === selectedMonth;
                  const height = Math.max(total > 0 ? 4 : 2, Math.round((total / maxMonth) * 142));
                  return <Pressable
                    key={MONTHS[index]}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${MONTHS[index]} ${year}, ${formatCurrency(total)} spent`}
                    accessibilityState={{ selected: active, busy: monthLoading && active }}
                    onPress={() => selectMonth(chartMonth)}
                    style={({ pressed }) => [styles.barColumn, pressed && styles.barPressed]}>
                    <View style={[styles.barTrack, active && styles.barTrackActive]}><View style={[styles.bar, { height }, year === currentYear && chartMonth > currentMonth && styles.barFuture, active && styles.barActive]} /></View>
                    <Text style={[styles.barLabel, active && styles.barLabelActive]}>{MONTHS[index]}</Text>
                  </Pressable>;
                })}
              </View>
            </Panel>

            <Panel style={styles.categoryPanel}>
              <SectionHeader title={`${selectedMonthName} by category`} detail="Where household spending landed" />
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

          <View style={[styles.twoColumn, compact && styles.oneColumn]}>
            <Panel style={styles.ytdCategoryPanel}>
              <SectionHeader
                title={`${year} category averages`}
                detail={`Average monthly spend across ${ytd?.months_elapsed || 0} month${ytd?.months_elapsed === 1 ? '' : 's'}`}
              />
              {!ytd || ytd.category_averages.every(category => category.total === 0) ? (
                <EmptyState title="No YTD activity" detail="Category averages will appear as transactions are recorded." />
              ) : (
                <View style={styles.ytdCategoryList}>
                  {ytd.category_averages.filter(category => category.total > 0).map(category => (
                    <View key={category.category_id} style={styles.ytdCategoryRow}>
                      <View style={styles.ytdCategoryHeader}>
                        <Text style={styles.ytdCategoryName}>{category.category}</Text>
                        <Text style={styles.ytdCategoryAverage}>{formatCurrency(category.monthly_average)} / month</Text>
                      </View>
                      <View style={styles.ytdProgressTrack}>
                        <View style={[styles.ytdProgressFill, { width: `${Math.max(3, category.monthly_average / maxYtdAverage * 100)}%` }]} />
                      </View>
                      <Text style={styles.ytdCategoryTotal}>{formatCurrency(category.total)} spent YTD</Text>
                    </View>
                  ))}
                </View>
              )}
            </Panel>

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

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
    <ReceiptText color={BudgetColors.surface} size={17} /><Text style={styles.primaryButtonText}>{label}</Text>
  </Pressable>;
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
  twoColumn: { flexDirection: 'row', alignItems: 'stretch', gap: 16 },
  oneColumn: { flexDirection: 'column' },
  chartPanel: { flex: 1.45, minWidth: 0 },
  categoryPanel: { flex: 1, minWidth: 0 },
  inlineAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5 },
  inlineActionText: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  chart: { height: 184, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  barColumn: { flex: 1, minWidth: 12, alignItems: 'center', gap: 7 },
  barPressed: { opacity: 0.62 },
  barTrack: { height: 150, width: '100%', maxWidth: 34, justifyContent: 'flex-end', borderRadius: 5, paddingHorizontal: 2, paddingTop: 3 },
  barTrackActive: { backgroundColor: BudgetColors.greenSoft },
  bar: { width: '100%', backgroundColor: BudgetColors.bar, borderRadius: 3 },
  barActive: { backgroundColor: BudgetColors.green },
  barFuture: { backgroundColor: BudgetColors.barFuture },
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
  ytdCategoryPanel: { flex: 1.2, minWidth: 0 },
  variancePanel: { flex: 1, minWidth: 0 },
  ytdCategoryList: { gap: 15 },
  ytdCategoryRow: { gap: 6 },
  ytdCategoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  ytdCategoryName: { flex: 1, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  ytdCategoryAverage: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  ytdProgressTrack: { height: 6, borderRadius: 3, backgroundColor: BudgetColors.canvas, overflow: 'hidden' },
  ytdProgressFill: { height: 6, borderRadius: 3, backgroundColor: BudgetColors.blue },
  ytdCategoryTotal: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 9 },
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