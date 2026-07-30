import { ArrowDownToLine, CircleDollarSign } from 'lucide-react-native';
import { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from 'react-native';

import { EmptyState, formatCurrency, Panel, SectionHeader } from '@/components/budget-ui';
import { ContributionSummary } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

export function ContributionPanel({ summary, action, style }: {
  summary: ContributionSummary | null;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const compact = useWindowDimensions().width < 520;

  const notConfigured = !summary || summary.household_income <= 0;

  return (
    <Panel style={style}>
      <SectionHeader
        title="Per-paycheck joint transfer"
        detail={summary && !notConfigured
          ? `${formatCurrency(summary.planned_expenses, 2)} monthly plan · ${formatCurrency(summary.household_income, 2)} household income`
          : 'Configure bi-weekly pay with the $ button'}
        action={action}
      />
      {notConfigured ? (
        <EmptyState
          title="Income not configured"
          detail="Tap the $ button in the header to set each person's bi-weekly pay."
        />
      ) : (
        <View style={styles.list}>
          {summary.people.map((person, index) => (
            <View key={person.person_id} style={[styles.row, compact && styles.rowCompact, index === 0 && styles.rowFirst]}>
              <View style={styles.icon}>
                <ArrowDownToLine color={BudgetColors.green} size={18} />
              </View>
              <View style={styles.copy}>
                <View style={styles.nameLine}>
                  <Text style={styles.name}>{person.name}</Text>
                  <Text style={styles.percentage}>{person.income_percentage.toFixed(1)}%</Text>
                </View>
                <Text style={styles.detail}>
                  {formatCurrency(person.biweekly_amount, 2)} bi-weekly · {formatCurrency(person.paid_personally, 2)} paid personally
                </Text>
              </View>
              <View style={[styles.amountCopy, compact && styles.amountCopyCompact]}>
                <Text style={styles.amount}>{formatCurrency(person.transfer_due, 2)}</Text>
                <View style={styles.amountLabel}>
                  <CircleDollarSign color={BudgetColors.faint} size={11} />
                  <Text style={styles.amountLabelText}>
                    {person.credit > 0
                      ? `${formatCurrency(person.credit, 2)} credit`
                      : 'transfer this pay'}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0 },
  row: { minHeight: 82, paddingVertical: 14, borderTopWidth: 1, borderTopColor: BudgetColors.line, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCompact: { alignItems: 'flex-start', flexWrap: 'wrap' },
  rowFirst: { borderTopWidth: 0, paddingTop: 4 },
  icon: { width: 38, height: 38, borderRadius: 7, backgroundColor: BudgetColors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' },
  percentage: { color: BudgetColors.blue, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '800', backgroundColor: BudgetColors.blueSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  detail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16 },
  amountCopy: { minWidth: 132, alignItems: 'flex-end', gap: 4 },
  amountCopyCompact: { width: '100%', paddingLeft: 50, alignItems: 'flex-start' },
  amount: { color: BudgetColors.ink, fontFamily: Fonts.serif, fontSize: 21, fontWeight: '700' },
  amountLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  amountLabelText: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '700' },
});