import { router } from 'expo-router';
import { ArrowRight, ChevronRight, Landmark } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AnimatedHorizontalBar, AnimatedVerticalBar } from '@/components/animated-bar';
import { EmptyState, ErrorNotice, formatCurrency, Page, PageHeading, Panel, SectionHeader, StatCard, YearSwitcher } from '@/components/budget-ui';
import { ContributionPanel } from '@/components/contribution-panel';
import { BudgetLine, CategorySummary, ContributionSummary, getBudgetLines, getCategorySummary, getContributionSummary, getIncomeSummary, getMonthlySummary, getTransactions, getYtdSummary, IncomeMonthSummary, MonthlySummary, Transaction, YtdSummary } from '@/constants/api';
import { clampToTrackedMonth, getTrackedMonthsForYear, TRACKING_START_YEAR } from '@/constants/tracking-period';
import { BudgetColors, Fonts } from '@/constants/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function buildDonutUri(pct: number, isOver: boolean): string {
  const s = 120, cx = 60, r = 42, sw = 18;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(Math.max(pct, 0), 1) * circ;
  const color = isOver ? '#C85B3F' : '#236B53';
  const arc = filled > 1
    ? `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${filled.toFixed(2)} ${(circ - filled).toFixed(2)}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cx})"/>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="#DDE2DC" stroke-width="${sw}"/>${arc}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

interface YearlyCategoryAverage {
  category: string;
  avgSpent: number;
  avgPlanned: number;
}

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
  const [yearlyCategoryAverages, setYearlyCategoryAverages] = useState<YearlyCategoryAverage[]>([]);
  const [contribution, setContribution] = useState<ContributionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthLoading, setMonthLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monthRequest = useRef(0);

  const trackedMonthsForYear = getTrackedMonthsForYear(year, now);
  const lastTrackedMonth = trackedMonthsForYear[trackedMonthsForYear.length - 1] ?? currentMonth;

  const load = async (refresh = false, targetYear = year, targetMonth = selectedMonth) => {
    const requestId = ++monthRequest.current;
    setMonthLoading(false);
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const scopedMonths = getTrackedMonthsForYear(targetYear, now);
      if (scopedMonths.length === 0) {
        setMonthly([]);
        setIncomeSummary([]);
        setYtd(null);
        setTransactions([]);
        setBudgetLines([]);
        setYearlyCategoryAverages([]);
        setContribution(null);
        return;
      }
      const safeTargetMonth = clampToTrackedMonth(targetYear, targetMonth, now) ?? scopedMonths[0];

      const [monthlyRows, incomeRows, ytdRows, transactionRows, budgetRows, contributionRows, categoryRowsByMonth, budgetRowsByMonth] = await Promise.all([
        getMonthlySummary(targetYear),
        getIncomeSummary(targetYear),
        getYtdSummary(targetYear),
        getTransactions(safeTargetMonth, targetYear),
        getBudgetLines(safeTargetMonth, targetYear),
        getContributionSummary(safeTargetMonth, targetYear),
        Promise.all(scopedMonths.map(monthValue => getCategorySummary(monthValue, targetYear))),
        Promise.all(scopedMonths.map(monthValue => getBudgetLines(monthValue, targetYear))),
      ]);
      if (requestId !== monthRequest.current) return;

      const categoryAverages = buildYearlyCategoryAverages(categoryRowsByMonth, budgetRowsByMonth, scopedMonths.length);

      setMonthly(monthlyRows);
      setIncomeSummary(incomeRows);
      setYtd(ytdRows);
      setTransactions(transactionRows);
      setBudgetLines(budgetRows);
      setYearlyCategoryAverages(categoryAverages);
      setContribution(contributionRows);
      if (selectedMonth !== safeTargetMonth) {
        setSelectedMonth(safeTargetMonth);
      }
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
    const validMonths = getTrackedMonthsForYear(year, now);
    if (!validMonths.includes(month)) return;
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
    if (nextYear > currentYear || nextYear < TRACKING_START_YEAR || nextYear === year) return;
    const nextMonth = clampToTrackedMonth(nextYear, selectedMonth, now) ?? getTrackedMonthsForYear(nextYear, now)[0] ?? currentMonth;
    setSelectedMonth(nextMonth);
    setYear(nextYear);
    load(false, nextYear, nextMonth);
  };

  const totalsByMonth = trackedMonthsForYear.map(monthValue => monthly.find(row => row.month === monthValue)?.total ?? 0);
  const incomeByMonth = trackedMonthsForYear.map(monthValue => incomeSummary.find(row => row.month === monthValue)?.total_income ?? 0);
  const monthSpend = monthly.find(row => row.month === selectedMonth)?.total ?? 0;
  const yearSpend = totalsByMonth.reduce((sum, total) => sum + total, 0);
  const ytdMonths = ytd?.months_elapsed ?? trackedMonthsForYear.length;
  const yearIncome = incomeSummary
    .filter(row => trackedMonthsForYear.includes(row.month) && row.month <= (trackedMonthsForYear[ytdMonths - 1] ?? lastTrackedMonth))
    .reduce((sum, row) => sum + row.total_income, 0);
  const yearNet = yearIncome - yearSpend;
  const planned = budgetLines.reduce((sum, line) => sum + line.projected_amount, 0);
  const remaining = planned - monthSpend;
  const monthlyIncome = contribution?.household_income ?? 0;
  const incomeRemaining = monthlyIncome - monthSpend;
  const spendPct = monthlyIncome > 0 ? Math.min(monthSpend / monthlyIncome * 100, 100) : 0;
  const varianceByMonth = new Map((ytd?.monthly_variance ?? []).map(row => [row.month, row]));
  const chartMax = Math.max(...totalsByMonth, ...incomeByMonth, ...(ytd?.monthly_variance.filter(row => trackedMonthsForYear.includes(row.month)).map(row => row.planned) ?? []), 1);
  const selectedMonthName = new Date(year, selectedMonth - 1, 1).toLocaleDateString('en-CA', { month: 'long' });
  const donutDenom = planned > 0 ? planned : monthlyIncome;
  const donutPct = donutDenom > 0 ? monthSpend / donutDenom : 0;
  const donutIsOver = planned > 0 && monthSpend > planned;
  const donutPctDisplay = Math.round(donutPct * 100);
  const donutDenomLabel = planned > 0 ? 'of plan' : monthlyIncome > 0 ? 'of income' : '';

  return (
    <Page refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={BudgetColors.green} />}>
      <PageHeading
        eyebrow={`${selectedMonthName} ${year}`}
        title="Household overview"
        description="Select any month below to update spending and budget context."
        action={<YearSwitcher
          year={year}
          previousDisabled={year <= TRACKING_START_YEAR}
          nextDisabled={year >= currentYear}
          onPrevious={() => selectYear(year - 1)}
          onNext={() => selectYear(year + 1)}
        />}
      />
      {error && <ErrorNotice message={error} onRetry={() => load()} />}
      {monthLoading && <View style={styles.monthLoading}><ActivityIndicator color={BudgetColors.green} size="small" /><Text style={styles.monthLoadingText}>Loading {selectedMonthName}</Text></View>}
      {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View> : (
        <>
          <View style={styles.statsGrid}>
            <Pressable onPress={() => router.push({ pathname: '/transactions', params: { month: String(selectedMonth), year: String(year) } })} style={({ pressed }) => [styles.donutCard, pressed && styles.pressed]}>
              <Text style={styles.donutCardLabel}>{selectedMonthName} budget</Text>
              <View style={styles.donutBody}>
                <View style={styles.donutWrap}>
                  <Image source={{ uri: buildDonutUri(donutPct, donutIsOver) }} style={styles.donutImage} />
                  <View style={styles.donutCenter}>
                    <Text style={[styles.donutPct, donutIsOver && styles.donutOver]}>{donutPctDisplay}%</Text>
                    {donutDenomLabel !== '' && <Text style={styles.donutPctSub}>{donutDenomLabel}</Text>}
                  </View>
                </View>
                <View style={styles.donutStats}>
                  <View>
                    <Text style={styles.donutStatLabel}>SPENT</Text>
                    <Text style={styles.donutStatValue}>{formatCurrency(monthSpend)}</Text>
                    <Text style={styles.donutStatDetail}>{transactions.length} transaction{transactions.length === 1 ? '' : 's'}</Text>
                  </View>
                  <View style={styles.donutDivider} />
                  <View>
                    <Text style={styles.donutStatLabel}>PLAN</Text>
                    <Text style={styles.donutStatValue}>{formatCurrency(planned)}</Text>
                    {planned > 0
                      ? <Text style={[styles.donutStatDetail, donutIsOver && styles.donutOver]}>{formatCurrency(Math.abs(remaining))} {remaining >= 0 ? 'remaining' : 'over plan'}</Text>
                      : <Text style={styles.donutStatDetail}>No plan entered</Text>}
                  </View>
                </View>
              </View>
            </Pressable>
            <Pressable onPress={() => router.push('/savings' as any)} style={({ pressed }) => [styles.netCard, pressed && styles.pressed]}>
              <StatCard
                label={`${year} net`}
                value={formatCurrency(yearNet)}
                detail={`${formatCurrency(yearIncome)} income · ${formatCurrency(yearSpend)} spending`}
                icon={<Landmark color={yearNet >= 0 ? BudgetColors.green : BudgetColors.coral} size={19} />}
                accent={yearNet >= 0 ? BudgetColors.green : BudgetColors.coral}
              />
            </Pressable>
          </View>

          {monthlyIncome > 0 && (
            <View style={styles.incomeBarPanel}>
              <View style={styles.incomeBarHeader}>
                <Text style={styles.incomeBarTitle}>Monthly income</Text>
                <Text style={styles.incomeBarTotal}>{formatCurrency(monthlyIncome, 2)}</Text>
              </View>
              <View style={styles.incomeTrack}>
                <AnimatedHorizontalBar percent={spendPct} style={[styles.incomeFill, monthSpend > monthlyIncome && styles.incomeFillOver]} />
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
              <SectionHeader
                title={`${year} monthly cash flow`}
                detail={`${selectedMonthName}: ${formatCurrency(monthSpend)} spent · ${formatCurrency(monthlyIncome)} income · ${planned > 0 ? `${formatCurrency(planned)} projected` : 'no plan entered'}`}
                action={<View style={styles.chartHeaderActions}>
                  <YearSwitcher
                    year={year}
                    previousDisabled={year <= TRACKING_START_YEAR}
                    nextDisabled={year >= currentYear}
                    onPrevious={() => selectYear(year - 1)}
                    onNext={() => selectYear(year + 1)}
                  />
                  <TextLink label="Insights" onPress={() => router.push('/explore')} />
                </View>}
              />
              <Text style={styles.chartHelper}>Tap any month bar to switch context. Use the year arrows to compare years quickly.</Text>
              <View style={styles.chartLegend}>
                <View style={styles.chartLegendItem}><View style={styles.chartSpendKey} /><Text style={styles.chartLegendText}>Spending</Text></View>
                <View style={styles.chartLegendItem}><View style={styles.chartIncomeKey} /><Text style={styles.chartLegendText}>Income</Text></View>
                <View style={styles.chartLegendItem}><View style={styles.chartPlanKey} /><Text style={styles.chartLegendText}>Projected budget</Text></View>
                <View style={styles.chartLegendItem}><View style={styles.chartOverIncomeKey} /><Text style={styles.chartLegendText}>Over income</Text></View>
              </View>
              <View style={styles.chart}>
                {totalsByMonth.map((total, index) => {
                  const chartMonth = trackedMonthsForYear[index];
                  const active = chartMonth === selectedMonth;
                  const variance = varianceByMonth.get(chartMonth);
                  const plan = variance?.planned ?? 0;
                  const income = incomeByMonth[index];
                  const overIncome = income > 0 && total > income;
                  const height = Math.max(total > 0 ? 4 : 2, Math.round((total / chartMax) * 142));
                  const planBottom = Math.min(Math.round((plan / chartMax) * 142), 142);
                  const incomeBottom = Math.min(Math.round((income / chartMax) * 142), 142);
                  return <Pressable
                    key={`${year}-${chartMonth}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${MONTHS[chartMonth - 1]} ${year}, ${formatCurrency(total)} spent, ${formatCurrency(income)} income${overIncome ? ', over income' : ''}${plan > 0 ? `, ${formatCurrency(plan)} projected budget` : ''}`}
                    accessibilityState={{ selected: active, busy: monthLoading && active }}
                    onPress={() => selectMonth(chartMonth)}
                    style={({ pressed }) => [styles.barColumn, active && styles.barColumnActive, pressed && styles.barPressed]}>
                    <View style={[styles.barTrack, active && styles.barTrackActive]}>
                      <AnimatedVerticalBar
                        delay={index * 45}
                        height={height}
                        style={[styles.bar, year === currentYear && chartMonth > currentMonth && styles.barFuture, active && !overIncome && styles.barActive, overIncome && styles.barOverIncome]}
                      />
                      {income > 0 && <View style={[styles.incomeMarker, { bottom: incomeBottom }]} />}
                      {plan > 0 && <View style={[styles.planMarker, { bottom: planBottom }]} />}
                    </View>
                    <Text style={[styles.barLabel, active && styles.barLabelActive]}>{MONTHS[chartMonth - 1]}</Text>
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
                  {ytd.monthly_variance.filter(month => trackedMonthsForYear.includes(month.month)).map((month, index) => {
                    const underBudget = month.variance >= 0;
                    const noActivity = month.planned === 0 && month.actual === 0;
                    return (
                      <Pressable key={month.month} onPress={() => router.push({ pathname: '/transactions', params: { month: String(month.month), year: String(year) } })} style={({ pressed }) => [styles.varianceRow, index === 0 && styles.varianceRowFirst, pressed && styles.pressed]}>
                        <View style={[styles.varianceDot, noActivity ? styles.varianceDotIdle : underBudget ? styles.varianceDotUnder : styles.varianceDotOver]} />
                        <View style={styles.varianceCopy}>
                          <Text style={styles.varianceMonth}>{MONTHS[month.month - 1]}</Text>
                          <Text style={styles.varianceDetail}>{formatCurrency(month.actual)} spent of {formatCurrency(month.planned)}</Text>
                        </View>
                        <Text style={[styles.varianceAmount, !noActivity && (underBudget ? styles.varianceUnder : styles.varianceOver)]}>
                          {noActivity ? 'No activity' : `${formatCurrency(Math.abs(month.variance))} ${underBudget ? 'under' : 'over'}`}
                        </Text>
                        <ChevronRight color={BudgetColors.faint} size={14} />
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Panel>
          </View>

          <Panel>
            <SectionHeader title={`${year} category averages`} detail="Average monthly spent versus average monthly planned" />
            {yearlyCategoryAverages.length === 0 ? <EmptyState title="No category history" detail="Category averages will appear after spending or budget lines exist." /> : yearlyCategoryAverages.map((category, index) => {
              const variance = category.avgPlanned - category.avgSpent;
              const underPlan = variance >= 0;
              const noActivity = category.avgPlanned === 0 && category.avgSpent === 0;
              return <Pressable key={category.category} onPress={() => router.push({ pathname: '/transactions', params: { month: String(selectedMonth), year: String(year), category: category.category } })} style={({ pressed }) => [styles.categoryAverageRow, index === 0 && styles.categoryAverageRowFirst, pressed && styles.pressed]}>
                <View style={[styles.categoryAverageDot, noActivity ? styles.categoryAverageDotIdle : underPlan ? styles.categoryAverageDotUnder : styles.categoryAverageDotOver]} />
                <View style={styles.categoryAverageCopy}>
                  <Text style={styles.categoryAverageName}>{category.category}</Text>
                  <Text style={styles.categoryAverageDetail}>{formatCurrency(category.avgSpent)} avg spent of {formatCurrency(category.avgPlanned)} avg planned</Text>
                </View>
                <Text style={[styles.categoryAverageVariance, !noActivity && (underPlan ? styles.varianceUnder : styles.varianceOver)]}>
                  {noActivity ? 'No activity' : `${formatCurrency(Math.abs(variance))} ${underPlan ? 'under' : 'over'}`}
                </Text>
                <ChevronRight color={BudgetColors.faint} size={14} />
              </Pressable>;
            })}
          </Panel>
        </>
      )}
    </Page>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.inlineAction}><Text style={styles.inlineActionText}>{label}</Text><ArrowRight color={BudgetColors.green} size={15} /></Pressable>;
}

function buildYearlyCategoryAverages(categoryRowsByMonth: CategorySummary[][], budgetRowsByMonth: BudgetLine[][], monthsInScope: number): YearlyCategoryAverage[] {
  if (monthsInScope <= 0) return [];

  const spentTotals = new Map<string, number>();
  const plannedTotals = new Map<string, number>();

  categoryRowsByMonth.forEach(monthRows => {
    monthRows.forEach(row => {
      spentTotals.set(row.category, (spentTotals.get(row.category) ?? 0) + row.total);
    });
  });

  budgetRowsByMonth.forEach(monthRows => {
    monthRows.forEach(row => {
      plannedTotals.set(row.category, (plannedTotals.get(row.category) ?? 0) + row.projected_amount);
    });
  });

  const categories = Array.from(new Set([...spentTotals.keys(), ...plannedTotals.keys()]));
  return categories
    .map(category => ({
      category,
      avgSpent: (spentTotals.get(category) ?? 0) / monthsInScope,
      avgPlanned: (plannedTotals.get(category) ?? 0) / monthsInScope,
    }))
    .sort((left, right) => right.avgSpent - left.avgSpent || left.category.localeCompare(right.category));
}

const styles = StyleSheet.create({
  netCard: { flex: 1 },
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
  chartHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
  chartHelper: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '700', marginBottom: 6 },
  inlineAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5 },
  inlineActionText: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  chartLegend: { minHeight: 24, marginBottom: 4, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  chartLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chartLegendText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '700' },
  chartSpendKey: { width: 10, height: 10, borderRadius: 2, backgroundColor: BudgetColors.bar },
  chartIncomeKey: { width: 14, height: 3, borderRadius: 2, backgroundColor: BudgetColors.blue },
  chartPlanKey: { width: 14, height: 2, borderRadius: 1, backgroundColor: BudgetColors.gold },
  chartOverIncomeKey: { width: 10, height: 10, borderRadius: 2, backgroundColor: BudgetColors.coral },
  chart: { height: 184, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  barColumn: { flex: 1, minWidth: 12, alignItems: 'center', gap: 7 },
  barColumnActive: { backgroundColor: BudgetColors.greenSoft, borderRadius: 8, paddingTop: 4, paddingHorizontal: 2 },
  barPressed: { opacity: 0.62 },
  barTrack: { position: 'relative', height: 150, width: '100%', maxWidth: 34, justifyContent: 'flex-end', borderRadius: 5, paddingHorizontal: 2, paddingTop: 3 },
  barTrackActive: {},
  bar: { width: '100%', backgroundColor: BudgetColors.bar, borderRadius: 3 },
  barActive: { backgroundColor: BudgetColors.green },
  barOverIncome: { backgroundColor: BudgetColors.coral },
  barFuture: { backgroundColor: BudgetColors.barFuture },
  incomeMarker: { position: 'absolute', left: -1, right: -1, height: 3, borderRadius: 2, backgroundColor: BudgetColors.blue, zIndex: 2 },
  planMarker: { position: 'absolute', left: 2, right: 2, height: 2, borderRadius: 1, backgroundColor: BudgetColors.gold, zIndex: 3 },
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
  categoryAverageRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: BudgetColors.line },
  categoryAverageRowFirst: { borderTopWidth: 0 },
  categoryAverageDot: { width: 8, height: 8, borderRadius: 4 },
  categoryAverageDotUnder: { backgroundColor: BudgetColors.green },
  categoryAverageDotOver: { backgroundColor: BudgetColors.coral },
  categoryAverageDotIdle: { backgroundColor: BudgetColors.faint },
  categoryAverageCopy: { flex: 1, minWidth: 0, gap: 2 },
  categoryAverageName: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  categoryAverageDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 9 },
  categoryAverageVariance: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  donutCard: { flex: 2, minWidth: 200, borderRadius: 8, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.surface, padding: 17, gap: 10 },
  donutCardLabel: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '800' },
  donutBody: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  donutWrap: { position: 'relative', width: 120, height: 120 },
  donutImage: { width: 120, height: 120 },
  donutCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  donutPct: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 20, fontWeight: '800' },
  donutPctSub: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '700' },
  donutOver: { color: BudgetColors.coral },
  donutStats: { flex: 1, gap: 8 },
  donutStatLabel: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '800' },
  donutStatValue: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 16, fontWeight: '800' },
  donutStatDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  donutDivider: { height: 1, backgroundColor: BudgetColors.line },
});