import { ArrowDownToLine, CircleDollarSign } from 'lucide-react-native';
import { ReactNode, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from 'react-native';

import { EmptyState, formatCurrency, Panel, SectionHeader } from '@/components/budget-ui';
import { ContributionSummary } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

export function ContributionPanel({ summary, action, style }: {
  summary: ContributionSummary | null;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const compact = useWindowDimensions().width < 520;
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);

  const notConfigured = !summary || summary.household_income <= 0;
  const selectedPerson = summary?.people.find(person => person.person_id === selectedPersonId) ?? null;

  return (
    <Panel style={style}>
      <SectionHeader
        title="Joint balance by payday"
        detail={summary && !notConfigured
          ? `${formatCurrency(summary.planned_expenses, 2)} joint monthly plan - biweekly target minus expenses paid`
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
          {summary.people.map((person, index) => {
            const ahead = person.credit > 0;
            const displayAmount = ahead ? person.credit : person.transfer_due;
            const status = ahead
              ? 'ahead'
              : person.transfer_due > 0
                ? person.next_pay_date ? `due ${formatShortDate(person.next_pay_date)}` : 'owed now'
                : 'caught up';

            return (
              <Pressable
                key={person.person_id}
                onPress={() => setSelectedPersonId(person.person_id)}
                style={({ pressed }) => [styles.row, compact && styles.rowCompact, index === 0 && styles.rowFirst, pressed && styles.pressed]}>
                <View style={styles.icon}>
                  <ArrowDownToLine color={BudgetColors.green} size={18} />
                </View>
                <View style={styles.copy}>
                  <View style={styles.nameLine}>
                    <Text style={styles.name}>{person.name}</Text>
                    <Text style={styles.percentage}>{person.income_percentage.toFixed(1)}%</Text>
                  </View>
                  <Text style={styles.detail}>
                    {formatCurrency(person.biweekly_share, 2)} biweekly joint target
                    {person.next_pay_date ? ` - next ${formatShortDate(person.next_pay_date)}` : ''}
                  </Text>
                  <Text style={styles.detail}>
                    {formatCurrency(person.paid_personally, 2)} expenses paid personally since {formatLastPaymentAnchor(person.last_joint_payment_at, person.last_joint_payment_date)} - {formatCurrency(person.transferred_to_joint, 2)} sent to joint this month
                  </Text>
                  <Text style={styles.tapHint}>Tap to view included expenses</Text>
                </View>
                <View style={[styles.amountCopy, compact && styles.amountCopyCompact]}>
                  <Text style={[styles.amount, ahead && styles.amountAhead]}>{formatCurrency(displayAmount, 2)}</Text>
                  <View style={styles.amountLabel}>
                    <CircleDollarSign color={ahead ? BudgetColors.green : BudgetColors.faint} size={11} />
                    <Text style={[styles.amountLabelText, ahead && styles.amountLabelAhead]}>{status}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <Modal transparent animationType="fade" visible={Boolean(selectedPerson)} onRequestClose={() => setSelectedPersonId(null)}>
        <Pressable style={styles.toastBackdrop} onPress={() => setSelectedPersonId(null)}>
          {selectedPerson && (
            <Pressable style={styles.toastCard} onPress={() => null}>
              <Text style={styles.toastTitle}>{selectedPerson.name} included expenses</Text>
              <Text style={styles.toastDetail}>
                Since {formatLastPaymentAnchor(selectedPerson.last_joint_payment_at, selectedPerson.last_joint_payment_date)}
              </Text>
              {selectedPerson.included_expense_count === 0 ? (
                <Text style={styles.toastEmpty}>No personal expenses are included yet.</Text>
              ) : (
                <ScrollView style={styles.toastList} contentContainerStyle={styles.toastListContent}>
                  {selectedPerson.included_expenses.map((expense, index) => (
                    <View key={`${expense.transaction_date || 'unknown'}-${expense.amount}-${index}`} style={styles.toastRow}>
                      <View style={styles.toastCopy}>
                        <Text style={styles.toastLine}>
                          {formatShortDateSafe(expense.transaction_date)} - {expense.subcategory || expense.category || 'Expense'}
                        </Text>
                        {expense.location ? <Text style={styles.toastMeta}>{expense.location}</Text> : null}
                      </View>
                      <Text style={styles.toastAmount}>{formatCurrency(expense.amount, 2)}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}
              <Pressable onPress={() => setSelectedPersonId(null)} style={({ pressed }) => [styles.toastCloseButton, pressed && styles.pressed]}>
                <Text style={styles.toastCloseText}>Close</Text>
              </Pressable>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </Panel>
  );
}

function formatShortDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function formatLastPaymentAnchor(timestamp: string | null, date: string | null) {
  if (timestamp) {
    return new Date(timestamp).toLocaleString('en-CA', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return date ? formatShortDate(date) : 'start';
}

function formatShortDateSafe(value: string | null) {
  if (!value) return 'Unknown date';
  const iso = `${value.slice(0, 10)}T12:00:00`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) return value.slice(0, 10);
  return parsed.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  list: { gap: 0 },
  row: { minHeight: 82, paddingVertical: 14, borderTopWidth: 1, borderTopColor: BudgetColors.line, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.72 },
  rowCompact: { alignItems: 'flex-start', flexWrap: 'wrap' },
  rowFirst: { borderTopWidth: 0, paddingTop: 4 },
  icon: { width: 38, height: 38, borderRadius: 7, backgroundColor: BudgetColors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' },
  percentage: { color: BudgetColors.blue, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '800', backgroundColor: BudgetColors.blueSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  detail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16 },
  tapHint: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '700' },
  amountCopy: { minWidth: 132, alignItems: 'flex-end', gap: 4 },
  amountCopyCompact: { width: '100%', paddingLeft: 50, alignItems: 'flex-start' },
  amount: { color: BudgetColors.ink, fontFamily: Fonts.serif, fontSize: 21, fontWeight: '700' },
  amountAhead: { color: BudgetColors.green },
  amountLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  amountLabelText: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '700' },
  amountLabelAhead: { color: BudgetColors.green },
  toastBackdrop: { flex: 1, backgroundColor: 'rgba(15, 24, 36, 0.34)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  toastCard: { width: '100%', maxWidth: 560, maxHeight: 410, borderRadius: 10, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.surface, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, gap: 8 },
  toastTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' },
  toastDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  toastEmpty: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 11, paddingVertical: 4 },
  toastList: { maxHeight: 250 },
  toastListContent: { gap: 6, paddingVertical: 2 },
  toastRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: BudgetColors.line, paddingTop: 6 },
  toastCopy: { flex: 1, minWidth: 0 },
  toastLine: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  toastMeta: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 10, marginTop: 1 },
  toastAmount: { color: BudgetColors.ink, fontFamily: Fonts.serif, fontSize: 14, fontWeight: '700' },
  toastCloseButton: { alignSelf: 'flex-end', minHeight: 32, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, alignItems: 'center', justifyContent: 'center' },
  toastCloseText: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
});