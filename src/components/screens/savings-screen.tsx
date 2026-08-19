import { router } from 'expo-router';
import { PiggyBank, Scale } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ErrorNotice, formatCurrency, Page, PageHeading, Panel, SectionHeader, StatCard } from '@/components/budget-ui';
import { InvestmentAccountsPanel } from '@/components/investment-accounts-panel';
import { getContributionSummary, getTransactions, Transaction } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

const SAVINGS_CATEGORY = 'Savings/Investments';
const GENERATED_IMPORT_NOTE_PREFIX = 'Imported monthly expense from ';
const TRACKING_START_DATE = '2025-05-01';
const TRACKING_START_MONTH = 5;
const TRACKING_START_YEAR = 2025;

export default function SavingsScreen() {
  const periods = useMemo(() => buildTrackedPeriods(), []);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [incomeByPeriod, setIncomeByPeriod] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [transactionRows, contributionRows] = await Promise.all([
          getTransactions(),
          Promise.all(periods.map(async period => ({
            key: period.key,
            summary: await getContributionSummary(period.month, period.year),
          }))),
        ]);
        setTransactions(transactionRows);
        setIncomeByPeriod(Object.fromEntries(contributionRows.map(period => [
          period.key,
          period.summary.household_income,
        ])) as Record<string, number>);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Savings data could not be loaded.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [periods]);

  const savingsTransactions = transactions.filter(transaction =>
    transaction.category === SAVINGS_CATEGORY &&
    transaction.transaction_date.slice(0, 10) >= TRACKING_START_DATE &&
    !transaction.notes?.startsWith(GENERATED_IMPORT_NOTE_PREFIX),
  );
  const generatedSavingsCount = transactions.filter(transaction =>
    transaction.category === SAVINGS_CATEGORY &&
    transaction.transaction_date.slice(0, 10) >= TRACKING_START_DATE &&
    transaction.notes?.startsWith(GENERATED_IMPORT_NOTE_PREFIX),
  ).length;
  const totalSavings = savingsTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);

  const spendingByPeriod = transactions.reduce<Record<string, number>>((totals, transaction) => {
    const period = transaction.transaction_date.slice(0, 7);
    totals[period] = (totals[period] ?? 0) + transaction.amount;
    return totals;
  }, {});

  const monthlyBalances = periods.map(period => {
    const income = incomeByPeriod[period.key] ?? 0;
    const spent = spendingByPeriod[period.key] ?? 0;
    return {
      ...period,
      income,
      spent,
      remaining: income - spent,
    };
  });

  const totalIncome = monthlyBalances.reduce((sum, month) => sum + month.income, 0);
  const totalSpent = monthlyBalances.reduce((sum, month) => sum + month.spent, 0);
  const totalRemainingIncome = monthlyBalances.reduce((sum, month) => sum + Math.max(month.remaining, 0), 0);
  const totalOverIncome = monthlyBalances.reduce((sum, month) => sum + Math.max(-month.remaining, 0), 0);
  const adjustedSavings = totalSavings + totalRemainingIncome - totalOverIncome;

  return (
    <Page>
      <PageHeading
        eyebrow="Savings"
        title="Savings summary"
        description="Monthly over and under amounts use the same household income minus total spending calculation shown on the Transactions page."
      />
      {error && <ErrorNotice message={error} onRetry={undefined} />}
      {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View> : (
        <>
          <View style={styles.statsGrid}>
            <Pressable onPress={() => router.push({ pathname: '/transactions', params: { category: 'Savings/Investments' } })} style={({ pressed }) => [pressed && styles.statPressed]}>
              <StatCard
              label="Total savings recorded"
              value={formatCurrency(totalSavings)}
              detail={`${savingsTransactions.length} recorded entr${savingsTransactions.length === 1 ? 'y' : 'ies'} since May 2025${generatedSavingsCount > 0 ? `; ${generatedSavingsCount} import estimate excluded` : ''}`}
              icon={<PiggyBank color={BudgetColors.green} size={19} />}
              accent={BudgetColors.green}
              />
            </Pressable>
            <StatCard
              label="Adjusted savings total"
              value={formatCurrency(adjustedSavings)}
              detail={`${formatCurrency(totalSavings)} + ${formatCurrency(totalRemainingIncome)} remaining - ${formatCurrency(totalOverIncome)} over income`}
              icon={<Scale color={adjustedSavings >= 0 ? BudgetColors.green : BudgetColors.coral} size={19} />}
              accent={adjustedSavings >= 0 ? BudgetColors.green : BudgetColors.coral}
            />
          </View>

          <Panel>
            <SectionHeader title="Cumulative calculation" detail="The Transactions income graph, summed from May 2025 through the current month" />
            <View style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowLabel}>Total savings transactions</Text>
                <Text style={styles.rowDetail}>Recorded Savings/Investments entries; generated import estimates are excluded</Text>
              </View>
              <Text style={styles.rowAmount}>{formatCurrency(totalSavings)}</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowLabel}>Total monthly income</Text>
                <Text style={styles.rowDetail}>Regular and extra income used by the Transactions graph</Text>
              </View>
              <Text style={styles.rowAmount}>{formatCurrency(totalIncome)}</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowLabel}>Total transactions</Text>
                <Text style={styles.rowDetail}>All monthly spending, including recorded savings transfers</Text>
              </View>
              <Text style={styles.rowAmount}>{formatCurrency(totalSpent)}</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowLabel}>Plus total remaining income</Text>
                <Text style={styles.rowDetail}>Positive monthly values from the Transactions income graph</Text>
              </View>
              <Text style={styles.rowAmount}>+ {formatCurrency(totalRemainingIncome)}</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowLabel}>Minus total over income</Text>
                <Text style={styles.rowDetail}>Negative monthly values from the Transactions income graph</Text>
              </View>
              <Text style={styles.rowAmount}>- {formatCurrency(totalOverIncome)}</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowLabel}>Adjusted savings total</Text>
                <Text style={styles.rowDetail}>Savings + remaining income - over income</Text>
              </View>
              <Text style={[styles.rowAmountStrong, adjustedSavings < 0 && styles.rowAmountNegative]}>
                {formatCurrency(adjustedSavings)}
              </Text>
            </View>
          </Panel>

          <InvestmentAccountsPanel />
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  loader: { minHeight: 320, alignItems: 'center', justifyContent: 'center' },
  statPressed: { opacity: 0.68 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: BudgetColors.line, paddingVertical: 10 },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  rowDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  rowAmount: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  rowAmountStrong: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  rowAmountNegative: { color: BudgetColors.coral },
});

function buildTrackedPeriods() {
  const now = new Date();
  const periods: { month: number; year: number; key: string }[] = [];
  let month = TRACKING_START_MONTH;
  let year = TRACKING_START_YEAR;

  while (year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth() + 1)) {
    periods.push({
      month,
      year,
      key: `${year}-${String(month).padStart(2, '0')}`,
    });
    if (month === 12) {
      month = 1;
      year += 1;
    } else {
      month += 1;
    }
  }

  return periods;
}
