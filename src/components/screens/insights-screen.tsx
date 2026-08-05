import { router } from 'expo-router';
import { ArrowRight, CheckCircle2, Lightbulb, PiggyBank, SlidersHorizontal, Store } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { EmptyState, ErrorNotice, formatCurrency, Page, PageHeading, Panel, SectionHeader, YearSwitcher } from '@/components/budget-ui';
import { BudgetLine, getBudgetLines, getTransactions, Transaction } from '@/constants/api';
import { getTrackedMonthsForYear, TRACKING_START_YEAR } from '@/constants/tracking-period';
import { BudgetColors, Fonts } from '@/constants/theme';

const SAVINGS_CATEGORY = 'Savings/Investments';
const GENERATED_IMPORT_NOTE_PREFIX = 'Imported monthly expense from ';
const FLEXIBLE_CATEGORIES = new Set(['Entertainment/Subscriptions', 'Food', 'Personal/Home Care', 'Travel']);

interface BudgetRecommendation {
  category: string;
  avgSpent: number;
  avgPlanned: number;
  suggestedPlan: number;
  detail: string;
  direction: 'raise' | 'lower';
  priority: number;
}

interface CoachingMessage {
  title: string;
  detail: string;
  amount?: number;
  kind: 'goal' | 'habit' | 'sweep';
}

interface InsightModel {
  monthsAnalyzed: number;
  coachTitle: string;
  coachDetail: string;
  coachTone: 'good' | 'steady' | 'attention';
  recommendations: BudgetRecommendation[];
  savingsIdeas: CoachingMessage[];
  wins: CoachingMessage[];
}

export default function InsightsScreen() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const { width } = useWindowDimensions();
  const compact = width < 780;
  const narrow = width < 520;
  const [year, setYear] = useState(currentYear);
  const [budgetMonths, setBudgetMonths] = useState<BudgetLine[][]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (targetYear = year) => {
    setLoading(true); setError(null);
    try {
      const trackedMonths = getTrackedMonthsForYear(targetYear, now);
      if (trackedMonths.length === 0) {
        setBudgetMonths([]);
        setTransactions([]);
        return;
      }
      const [monthRows, transactionRows] = await Promise.all([
        Promise.all(trackedMonths.map(monthValue => getBudgetLines(monthValue, targetYear))),
        getTransactions(undefined, targetYear),
      ]);
      setBudgetMonths(monthRows);
      setTransactions(transactionRows);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Insights could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(year); }, [year]);

  const insights = buildInsights(budgetMonths, transactions);

  return <Page>
    <PageHeading
      eyebrow="Budget coach"
      title="Practical insights"
      description="Focused recommendations from your budget history, spending habits, and progress."
      action={<YearSwitcher
        year={year}
        previousDisabled={year <= TRACKING_START_YEAR}
        nextDisabled={year >= currentYear}
        onPrevious={() => setYear(current => Math.max(TRACKING_START_YEAR, current - 1))}
        onNext={() => setYear(current => Math.min(currentYear, current + 1))}
      />}
    />
    {error && <ErrorNotice message={error} onRetry={load} />}
    {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View> : <>
      {insights.monthsAnalyzed === 0 ? (
        <Panel><EmptyState title="Not enough history yet" detail={`Add a budget or transactions in ${year} and recommendations will appear here.`} /></Panel>
      ) : <>
        <View style={[
          styles.coach,
          narrow && styles.coachNarrow,
          insights.coachTone === 'good' ? styles.coachGood : insights.coachTone === 'attention' ? styles.coachAttention : styles.coachSteady,
        ]}>
          <View style={styles.coachIcon}>
            {insights.coachTone === 'good'
              ? <CheckCircle2 color={BudgetColors.green} size={24} />
              : <Lightbulb color={insights.coachTone === 'attention' ? BudgetColors.coral : BudgetColors.blue} size={24} />}
          </View>
          <View style={styles.coachCopy}>
            <Text style={styles.coachEyebrow}>{insights.monthsAnalyzed} tracked month{insights.monthsAnalyzed === 1 ? '' : 's'} in {year}</Text>
            <Text style={styles.coachTitle}>{insights.coachTitle}</Text>
            <Text style={styles.coachDetail}>{insights.coachDetail}</Text>
          </View>
        </View>

        <View style={[styles.columns, compact && styles.columnsCompact]}>
          <Panel style={styles.column}>
            <SectionHeader
              title="Budget changes worth considering"
              detail="Only categories with a meaningful plan mismatch are shown"
              action={!narrow && <TextLink label="Adjust budget" onPress={() => router.push('/budget')} />}
            />
            {narrow && <TextLink label="Adjust budget" onPress={() => router.push('/budget')} />}
            {insights.recommendations.length === 0 ? (
              <EmptyState title="Your plan is well calibrated" detail="No category needs a meaningful adjustment based on this year's averages." />
            ) : (
              <View>
                {insights.recommendations.map((recommendation, index) => (
                  <View key={recommendation.category} style={[styles.recommendation, narrow && styles.recommendationNarrow, index === 0 && styles.rowFirst]}>
                    <View style={[styles.recommendationIcon, recommendation.direction === 'raise' ? styles.iconAttention : styles.iconOpportunity]}>
                      <SlidersHorizontal color={recommendation.direction === 'raise' ? BudgetColors.coral : BudgetColors.blue} size={17} />
                    </View>
                    <View style={styles.recommendationBody}>
                      <View style={[styles.recommendationHeading, narrow && styles.itemHeadingNarrow]}>
                        <Text style={styles.recommendationTitle}>{recommendation.category}</Text>
                        <Text style={[styles.recommendationTarget, recommendation.direction === 'raise' ? styles.textAttention : styles.textOpportunity]}>
                          Try {formatCurrency(recommendation.suggestedPlan)}/mo
                        </Text>
                      </View>
                      <Text style={styles.recommendationNumbers}>{formatCurrency(recommendation.avgSpent)} avg spent vs {formatCurrency(recommendation.avgPlanned)} avg planned</Text>
                      <Text style={styles.recommendationDetail}>{recommendation.detail}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Panel>

          <Panel style={styles.column}>
            <SectionHeader title="Ways to save" detail="Small moves based on your actual patterns" />
            {insights.savingsIdeas.length === 0 ? (
              <EmptyState title="No obvious cuts stand out" detail="Your current data does not point to a responsible quick cut. Keep tracking and revisit next month." />
            ) : (
              <View>
                {insights.savingsIdeas.map((idea, index) => (
                  <View key={idea.title} style={[styles.idea, narrow && styles.ideaNarrow, index === 0 && styles.rowFirst]}>
                    <View style={styles.ideaIcon}>
                      {idea.kind === 'habit' ? <Store color={BudgetColors.blue} size={17} /> : <PiggyBank color={BudgetColors.green} size={17} />}
                    </View>
                    <View style={styles.ideaCopy}>
                      <View style={[styles.ideaHeading, narrow && styles.itemHeadingNarrow]}>
                        <Text style={styles.ideaTitle}>{idea.title}</Text>
                        {idea.amount !== undefined && <Text style={styles.ideaAmount}>{formatCurrency(idea.amount)}/mo</Text>}
                      </View>
                      <Text style={styles.ideaDetail}>{idea.detail}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Panel>
        </View>

        <Panel style={styles.winsPanel}>
          <SectionHeader title="What is working" detail="Progress worth keeping" />
          <View style={styles.winsGrid}>
            {insights.wins.map(win => (
              <View key={win.title} style={[styles.win, narrow && styles.winNarrow]}>
                <CheckCircle2 color={BudgetColors.green} size={19} />
                <View style={styles.winCopy}>
                  <Text style={styles.winTitle}>{win.title}</Text>
                  <Text style={styles.winDetail}>{win.detail}</Text>
                </View>
              </View>
            ))}
          </View>
        </Panel>
      </>}
    </>}
  </Page>;
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.textLink, pressed && styles.pressed]}>
    <Text style={styles.textLinkLabel}>{label}</Text><ArrowRight color={BudgetColors.green} size={15} />
  </Pressable>;
}

function buildInsights(budgetMonths: BudgetLine[][], transactions: Transaction[]): InsightModel {
  const trackedMonths = budgetMonths
    .map((lines, index) => ({
      month: index + 1,
      lines,
      planned: lines.reduce((sum, line) => sum + line.projected_amount, 0),
      actual: lines.reduce((sum, line) => sum + line.actual_amount, 0),
    }))
    .filter(month => month.planned > 0 || month.actual > 0);
  const monthsAnalyzed = trackedMonths.length;

  if (monthsAnalyzed === 0) {
    return {
      monthsAnalyzed: 0,
      coachTitle: '',
      coachDetail: '',
      coachTone: 'steady',
      recommendations: [],
      savingsIdeas: [],
      wins: [],
    };
  }

  const categoryTotals = new Map<string, { actual: number; planned: number }>();
  trackedMonths.forEach(month => {
    month.lines.forEach(line => {
      const totals = categoryTotals.get(line.category) ?? { actual: 0, planned: 0 };
      totals.actual += line.actual_amount;
      totals.planned += line.projected_amount;
      categoryTotals.set(line.category, totals);
    });
  });

  const categories = Array.from(categoryTotals, ([category, totals]) => ({
    category,
    avgSpent: totals.actual / monthsAnalyzed,
    avgPlanned: totals.planned / monthsAnalyzed,
  }));

  const recommendations = categories
    .filter(category => category.category !== SAVINGS_CATEGORY)
    .flatMap<BudgetRecommendation>(category => {
      const overage = category.avgSpent - category.avgPlanned;
      const meaningfulDifference = Math.max(25, category.avgPlanned * 0.05);

      if (category.avgSpent > 0 && category.avgPlanned === 0) {
        return [{
          ...category,
          suggestedPlan: roundUp(category.avgSpent, 10),
          detail: 'This spending has no average budget. Give it a visible monthly allowance, then decide whether the amount feels intentional.',
          direction: 'raise' as const,
          priority: category.avgSpent,
        }];
      }

      if (overage >= meaningfulDifference) {
        return [{
          ...category,
          suggestedPlan: roundUp(category.avgSpent, 10),
          detail: `Spending averages ${formatCurrency(overage)} above plan. Raise the plan if that level is expected, or keep the current plan as a clear monthly cap.`,
          direction: 'raise' as const,
          priority: overage,
        }];
      }

      const cushionedPlan = roundUp(category.avgSpent * 1.1, 10);
      const releasable = category.avgPlanned - cushionedPlan;
      if (category.avgSpent > 0 && releasable >= Math.max(25, category.avgPlanned * 0.1)) {
        return [{
          ...category,
          suggestedPlan: cushionedPlan,
          detail: `This target keeps roughly 10% above average spending and could release ${formatCurrency(releasable)} each month for another priority.`,
          direction: 'lower' as const,
          priority: releasable,
        }];
      }

      return [];
    })
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 5);

  const monthsUnderPlan = trackedMonths.filter(month => month.planned > 0 && month.actual <= month.planned).length;
  const plannedMonths = trackedMonths.filter(month => month.planned > 0).length;
  const underPlanRatio = plannedMonths > 0 ? monthsUnderPlan / plannedMonths : 0;
  const avgMonthlyPlan = trackedMonths.reduce((sum, month) => sum + month.planned, 0) / monthsAnalyzed;
  const avgMonthlyActual = trackedMonths.reduce((sum, month) => sum + month.actual, 0) / monthsAnalyzed;
  const avgMonthlyRoom = avgMonthlyPlan - avgMonthlyActual;

  let coachTitle = 'A few focused changes can make the plan more realistic.';
  let coachDetail = recommendations.length > 0
    ? `Start with ${recommendations[0].category}; it has the clearest gap between average spending and the current plan.`
    : 'Keep tracking for another month before making broad changes.';
  let coachTone: InsightModel['coachTone'] = 'attention';

  if (plannedMonths > 0 && underPlanRatio >= 0.75) {
    coachTitle = 'You are giving the budget real breathing room.';
    coachDetail = `${monthsUnderPlan} of ${plannedMonths} planned months finished at or under budget. Keep what is working and make only targeted adjustments.`;
    coachTone = 'good';
  } else if (plannedMonths > 0 && underPlanRatio >= 0.5) {
    coachTitle = 'Your plan is close to a steady rhythm.';
    coachDetail = `${monthsUnderPlan} of ${plannedMonths} planned months were at or under budget. A couple of category changes could make that consistency easier.`;
    coachTone = 'steady';
  }

  const recordedSavings = transactions
    .filter(transaction => transaction.category === SAVINGS_CATEGORY && !transaction.notes?.startsWith(GENERATED_IMPORT_NOTE_PREFIX))
    .reduce((sum, transaction) => sum + transaction.amount, 0) / monthsAnalyzed;
  const savingsPlan = categories.find(category => category.category === SAVINGS_CATEGORY)?.avgPlanned ?? 0;
  const savingsIdeas: CoachingMessage[] = [];

  if (savingsPlan > 0 && recordedSavings + 25 < savingsPlan) {
    const gap = savingsPlan - recordedSavings;
    savingsIdeas.push({
      title: 'Automate the savings gap',
      detail: `Recorded savings average ${formatCurrency(recordedSavings)} against a ${formatCurrency(savingsPlan)} plan. A scheduled transfer can make the difference happen before spending decisions.`,
      amount: gap,
      kind: 'goal',
    });
  }

  if (avgMonthlyRoom >= 50) {
    const sweepAmount = roundDown(avgMonthlyRoom * 0.5, 5);
    savingsIdeas.push({
      title: 'Sweep part of the monthly cushion',
      detail: `Spending has averaged ${formatCurrency(avgMonthlyRoom)} below the full plan. Moving half of that room after month-end keeps a buffer while directing the rest to savings.`,
      amount: sweepAmount,
      kind: 'sweep',
    });
  }

  const largestFlexibleCategory = categories
    .filter(category => FLEXIBLE_CATEGORIES.has(category.category) && category.avgSpent >= 100)
    .sort((left, right) => right.avgSpent - left.avgSpent)[0];
  if (largestFlexibleCategory && savingsIdeas.length < 3) {
    const trimAmount = roundDown(largestFlexibleCategory.avgSpent * 0.1, 5);
    savingsIdeas.push({
      title: `Try a 10% trim in ${largestFlexibleCategory.category}`,
      detail: `This flexible category averages ${formatCurrency(largestFlexibleCategory.avgSpent)} per month. A modest cap would protect fixed bills while testing a realistic reduction.`,
      amount: trimAmount,
      kind: 'habit',
    });
  }

  const merchantPattern = findMerchantPattern(transactions, monthsAnalyzed);
  if (merchantPattern && savingsIdeas.length < 3) {
    savingsIdeas.push(merchantPattern);
  }

  const wins: CoachingMessage[] = [];
  if (plannedMonths > 0 && monthsUnderPlan > 0) {
    wins.push({
      title: monthsUnderPlan === plannedMonths ? 'Every planned month is on track' : `${monthsUnderPlan} planned month${monthsUnderPlan === 1 ? '' : 's'} stayed on track`,
      detail: monthsUnderPlan === plannedMonths
        ? 'Spending stayed at or below the full monthly plan throughout the tracked period.'
        : 'Those months show the household plan is achievable, not just aspirational.',
      kind: 'goal',
    });
  }

  const onTrackCategories = categories.filter(category =>
    category.category !== SAVINGS_CATEGORY &&
    category.avgPlanned > 0 &&
    category.avgSpent > 0 &&
    category.avgSpent <= category.avgPlanned,
  );
  if (onTrackCategories.length > 0) {
    wins.push({
      title: `${onTrackCategories.length} categor${onTrackCategories.length === 1 ? 'y is' : 'ies are'} averaging within plan`,
      detail: `${onTrackCategories.slice(0, 3).map(category => category.category).join(', ')}${onTrackCategories.length > 3 ? ' and more' : ''} are holding their average spending line.`,
      kind: 'goal',
    });
  }

  if (savingsPlan > 0 && recordedSavings >= savingsPlan) {
    wins.push({
      title: 'You are meeting the average savings plan',
      detail: `${formatCurrency(recordedSavings)} per month has been recorded toward Savings/Investments against ${formatCurrency(savingsPlan)} planned.`,
      kind: 'goal',
    });
  }

  const spendingTrend = getSpendingTrend(trackedMonths.map(month => month.actual));
  if (spendingTrend !== null && spendingTrend > 0) {
    wins.push({
      title: 'Recent spending is moving down',
      detail: `The latest two tracked months averaged ${formatCurrency(spendingTrend)} less than the two before them.`,
      kind: 'habit',
    });
  }

  if (wins.length === 0) {
    wins.push({
      title: 'You have enough information to make a focused change',
      detail: 'Pick one recommendation for the next month. A small change you can repeat is more useful than rebuilding the whole budget at once.',
      kind: 'goal',
    });
  }

  return {
    monthsAnalyzed,
    coachTitle,
    coachDetail,
    coachTone,
    recommendations,
    savingsIdeas: savingsIdeas.slice(0, 3),
    wins: wins.slice(0, 4),
  };
}

function findMerchantPattern(transactions: Transaction[], monthsAnalyzed: number): CoachingMessage | null {
  const merchants = new Map<string, { name: string; count: number; total: number }>();
  transactions
    .filter(transaction =>
      FLEXIBLE_CATEGORIES.has(transaction.category) &&
      Boolean(transaction.location?.trim()) &&
      !transaction.notes?.startsWith(GENERATED_IMPORT_NOTE_PREFIX),
    )
    .forEach(transaction => {
      const name = transaction.location!.trim();
      const key = name.toLocaleLowerCase();
      const merchant = merchants.get(key) ?? { name, count: 0, total: 0 };
      merchant.count += 1;
      merchant.total += transaction.amount;
      merchants.set(key, merchant);
    });

  const pattern = Array.from(merchants.values())
    .filter(merchant => merchant.count >= 4)
    .sort((left, right) => right.total - left.total)[0];
  if (!pattern) return null;

  const monthlySpend = pattern.total / monthsAnalyzed;
  const savingsAmount = roundDown(monthlySpend * 0.1, 5);
  if (savingsAmount < 5) return null;

  return {
    title: `Review repeat spending at ${pattern.name}`,
    detail: `${pattern.count} purchases averaged ${formatCurrency(pattern.total / pattern.count)} each. Reducing that pattern by 10% would keep a little more without requiring a full stop.`,
    amount: savingsAmount,
    kind: 'habit',
  };
}

function getSpendingTrend(monthlyActuals: number[]) {
  if (monthlyActuals.length < 4) return null;
  const recent = (monthlyActuals.at(-1)! + monthlyActuals.at(-2)!) / 2;
  const previous = (monthlyActuals.at(-3)! + monthlyActuals.at(-4)!) / 2;
  const improvement = previous - recent;
  return improvement >= previous * 0.05 ? improvement : null;
}

function roundUp(value: number, increment: number) {
  return Math.ceil(value / increment) * increment;
}

function roundDown(value: number, increment: number) {
  return Math.floor(value / increment) * increment;
}

const styles = StyleSheet.create({
  loader: { minHeight: 360, alignItems: 'center', justifyContent: 'center' },
  coach: { minHeight: 120, borderWidth: 1, borderRadius: 8, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  coachNarrow: { padding: 14, flexDirection: 'column', alignItems: 'flex-start', gap: 10 },
  coachGood: { backgroundColor: BudgetColors.greenSoft, borderColor: BudgetColors.successLine },
  coachSteady: { backgroundColor: BudgetColors.blueSoft, borderColor: BudgetColors.infoLine },
  coachAttention: { backgroundColor: BudgetColors.warningSurface, borderColor: BudgetColors.warningLine },
  coachIcon: { width: 44, height: 44, borderRadius: 8, backgroundColor: BudgetColors.surface, alignItems: 'center', justifyContent: 'center' },
  coachCopy: { flex: 1, minWidth: 0, gap: 4 },
  coachEyebrow: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  coachTitle: { color: BudgetColors.ink, fontFamily: Fonts.serif, fontSize: 21, lineHeight: 27, fontWeight: '700' },
  coachDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 18 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  columnsCompact: { flexDirection: 'column' },
  column: { flex: 1, width: '100%', minWidth: 0 },
  recommendation: { minHeight: 128, borderTopWidth: 1, borderTopColor: BudgetColors.line, paddingVertical: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  recommendationNarrow: { minHeight: 0, gap: 9 },
  rowFirst: { borderTopWidth: 0, paddingTop: 2 },
  recommendationIcon: { width: 34, height: 34, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  iconAttention: { backgroundColor: BudgetColors.coralSoft },
  iconOpportunity: { backgroundColor: BudgetColors.blueSoft },
  recommendationBody: { flex: 1, minWidth: 0, gap: 4 },
  recommendationHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  itemHeadingNarrow: { flexDirection: 'column', alignItems: 'flex-start', gap: 2 },
  recommendationTitle: { flex: 1, minWidth: 0, flexShrink: 1, maxWidth: '100%', color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  recommendationTarget: { fontFamily: Fonts.sans, fontSize: 10, fontWeight: '800' },
  textAttention: { color: BudgetColors.coral },
  textOpportunity: { color: BudgetColors.blue },
  recommendationNumbers: { width: '100%', flexShrink: 1, color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '700' },
  recommendationDetail: { width: '100%', flexShrink: 1, color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16 },
  idea: { minHeight: 104, borderTopWidth: 1, borderTopColor: BudgetColors.line, paddingVertical: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  ideaNarrow: { minHeight: 0, gap: 9 },
  ideaIcon: { width: 34, height: 34, borderRadius: 7, backgroundColor: BudgetColors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  ideaCopy: { flex: 1, minWidth: 0, gap: 5 },
  ideaHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  ideaTitle: { flex: 1, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  ideaAmount: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '800' },
  ideaDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16 },
  winsPanel: { backgroundColor: BudgetColors.greenSoft, borderColor: BudgetColors.successLine },
  winsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  win: { flex: 1, minWidth: 230, padding: 12, borderRadius: 7, backgroundColor: BudgetColors.surface, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  winNarrow: { width: '100%', minWidth: 0, flexBasis: '100%' },
  winCopy: { flex: 1, minWidth: 0, gap: 3 },
  winTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  winDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10, lineHeight: 15 },
  textLink: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
  textLinkLabel: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.65 },
});