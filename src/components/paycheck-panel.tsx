import { CalendarDays, CircleDollarSign, Plus, Trash2, UserRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleProp, StyleSheet, Text, TextInput, useWindowDimensions, View, ViewStyle } from 'react-native';

import { EmptyState, ErrorNotice, formatCurrency, Panel, SectionHeader } from '@/components/budget-ui';
import { addPaycheck, deletePaycheck, getPaychecks, getPeople, Paycheck, Person } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

export function PaycheckPanel({ month, year, onChanged, style }: {
  month: number;
  year: number;
  onChanged: () => Promise<void>;
  style?: StyleProp<ViewStyle>;
}) {
  const compact = useWindowDimensions().width < 700;
  const [people, setPeople] = useState<Person[]>([]);
  const [paychecks, setPaychecks] = useState<Paycheck[]>([]);
  const [personId, setPersonId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(defaultDate(month, year));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [peopleRows, paycheckRows] = await Promise.all([getPeople(), getPaychecks(month, year)]);
      const contributors = peopleRows.filter(person => person.name.toLowerCase() !== 'joint');
      setPeople(contributors);
      setPaychecks(paycheckRows);
      setPersonId(current => contributors.some(person => person.person_id === current) ? current : contributors[0]?.person_id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Income could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setDate(defaultDate(month, year));
    setAmount('');
    load();
  }, [month, year]);

  const create = async () => {
    const parsedAmount = Number(amount);
    if (!personId) {
      setError('Choose who received this paycheck.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a paycheck amount greater than zero.');
      return;
    }
    if (!isValidDate(date)) {
      setError('Enter a valid date in YYYY-MM-DD format.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await addPaycheck({ person_id: personId, paycheck_date: date, amount: parsedAmount });
      const paycheckRows = await getPaychecks(month, year);
      setPaychecks(paycheckRows);
      setAmount('');
      await onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The paycheck could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (paycheck: Paycheck) => {
    if (!await confirmRemoval(paycheck)) return;
    setDeletingId(paycheck.paycheck_id);
    setError(null);
    try {
      await deletePaycheck(paycheck.paycheck_id);
      setPaychecks(current => current.filter(item => item.paycheck_id !== paycheck.paycheck_id));
      await onChanged();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'The paycheck could not be deleted.');
    } finally {
      setDeletingId(null);
    }
  };

  const total = paychecks.reduce((sum, paycheck) => sum + paycheck.amount, 0);

  return (
    <Panel style={[styles.panel, style]}>
      <SectionHeader title="Monthly income" detail={`${formatCurrency(total, 2)} across ${paychecks.length} paycheck${paychecks.length === 1 ? '' : 's'}`} />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View>
      ) : (
        <>
          <View style={styles.field}>
            <View style={styles.labelRow}><UserRound color={BudgetColors.muted} size={15} /><Text style={styles.label}>Paid to</Text></View>
            <View style={styles.choices}>
              {people.map(person => (
                <Pressable key={person.person_id} onPress={() => setPersonId(person.person_id)} style={({ pressed }) => [styles.choice, personId === person.person_id && styles.choiceSelected, pressed && styles.pressed]}>
                  <Text style={[styles.choiceText, personId === person.person_id && styles.choiceTextSelected]}>{person.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={[styles.formRow, compact && styles.formRowCompact]}>
            <View style={styles.formField}>
              <View style={styles.labelRow}><CircleDollarSign color={BudgetColors.muted} size={15} /><Text style={styles.label}>Net amount</Text></View>
              <View style={styles.amountInput}><Text style={styles.dollar}>$</Text><TextInput value={amount} onChangeText={value => setAmount(value.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={BudgetColors.faint} style={styles.input} /></View>
            </View>
            <View style={styles.formField}>
              <View style={styles.labelRow}><CalendarDays color={BudgetColors.muted} size={15} /><Text style={styles.label}>Pay date</Text></View>
              <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={BudgetColors.faint} style={styles.dateInput} />
            </View>
            <Pressable disabled={saving} onPress={create} style={({ pressed }) => [styles.addButton, saving && styles.disabled, pressed && styles.pressed]}>
              {saving ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <Plus color={BudgetColors.surface} size={17} />}
              <Text style={styles.addButtonText}>{saving ? 'Adding' : 'Add paycheck'}</Text>
            </Pressable>
          </View>

          <View style={styles.history}>
            <Text style={styles.historyLabel}>Recorded this month</Text>
            {paychecks.length === 0 ? (
              <EmptyState title="No paychecks yet" detail="Add Peter or Sailah's first paycheck for this month." />
            ) : paychecks.map((paycheck, index) => (
              <View key={paycheck.paycheck_id} style={[styles.paycheckRow, index === 0 && styles.paycheckRowFirst]}>
                <View style={styles.paycheckCopy}>
                  <Text style={styles.paycheckName}>{paycheck.person_name}</Text>
                  <Text style={styles.paycheckDate}>{formatPaycheckDate(paycheck.paycheck_date)}</Text>
                </View>
                <Text style={styles.paycheckAmount}>{formatCurrency(paycheck.amount, 2)}</Text>
                <Pressable accessibilityLabel={`Delete ${paycheck.person_name} paycheck`} disabled={deletingId === paycheck.paycheck_id} onPress={() => remove(paycheck)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                  {deletingId === paycheck.paycheck_id ? <ActivityIndicator color={BudgetColors.coral} size="small" /> : <Trash2 color={BudgetColors.coral} size={16} />}
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}
    </Panel>
  );
}

function defaultDate(month: number, year: number) {
  const today = new Date();
  if (today.getFullYear() === year && today.getMonth() + 1 === month) return today.toISOString().slice(0, 10);
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function formatPaycheckDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function confirmRemoval(paycheck: Paycheck) {
  const message = `${paycheck.person_name} · ${formatCurrency(paycheck.amount, 2)}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return Promise.resolve(window.confirm(`Delete paycheck for ${message}?`));
  return new Promise<boolean>(resolve => Alert.alert('Delete paycheck?', message, [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Delete', style: 'destructive', onPress: () => resolve(true) }], { cancelable: true, onDismiss: () => resolve(false) }));
}

const styles = StyleSheet.create({
  panel: { flex: 1.2, minWidth: 0 },
  loader: { minHeight: 250, alignItems: 'center', justifyContent: 'center' },
  field: { gap: 7, marginBottom: 16 },
  labelRow: { minHeight: 18, flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: 36, paddingHorizontal: 13, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, alignItems: 'center', justifyContent: 'center' },
  choiceSelected: { borderColor: BudgetColors.green, backgroundColor: BudgetColors.greenSoft },
  choiceText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  choiceTextSelected: { color: BudgetColors.green },
  formRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  formRowCompact: { flexDirection: 'column', alignItems: 'stretch' },
  formField: { flex: 1, minWidth: 150, gap: 6 },
  amountInput: { height: 42, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, flexDirection: 'row', alignItems: 'center' },
  dollar: { color: BudgetColors.muted, paddingLeft: 11, fontFamily: Fonts.sans, fontSize: 13 },
  input: { flex: 1, minWidth: 0, height: 40, paddingHorizontal: 7, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
  dateInput: { height: 42, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, color: BudgetColors.ink, paddingHorizontal: 11, fontFamily: Fonts.sans, fontSize: 13 },
  addButton: { height: 42, paddingHorizontal: 13, borderRadius: 7, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  addButtonText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  history: { marginTop: 22 },
  historyLabel: { marginBottom: 6, color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  paycheckRow: { minHeight: 62, borderTopWidth: 1, borderTopColor: BudgetColors.line, flexDirection: 'row', alignItems: 'center', gap: 10 },
  paycheckRowFirst: { borderTopWidth: 0 },
  paycheckCopy: { flex: 1, minWidth: 0, gap: 2 },
  paycheckName: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  paycheckDate: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10 },
  paycheckAmount: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  deleteButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.68 },
});