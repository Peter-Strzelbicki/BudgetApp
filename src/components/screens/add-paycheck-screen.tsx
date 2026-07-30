import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState, ErrorNotice, formatCurrency, MonthSwitcher, moveMonth, Page, PageHeading, Panel, SectionHeader } from '@/components/budget-ui';
import { addExtraIncome, deleteExtraIncome, ExtraIncome, getExtraIncome, getIncomeConfig, IncomeConfig, saveIncomeConfig } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

export default function AddPaycheckScreen() {
  const now = new Date();
  const [configs, setConfigs] = useState<IncomeConfig[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});

  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [extras, setExtras] = useState<ExtraIncome[]>([]);
  const [extrasLoading, setExtrasLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState<number | null>(null);
  const [extraAmount, setExtraAmount] = useState('');
  const [extraDesc, setExtraDesc] = useState('');
  const [addingExtra, setAddingExtra] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getIncomeConfig()
      .then(rows => {
        setConfigs(rows);
        setDrafts(Object.fromEntries(rows.map(row => [row.person_id, String(row.biweekly_amount || '')])));
        if (rows.length > 0 && selectedPerson === null) setSelectedPerson(rows[0].person_id);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load income configuration.'))
      .finally(() => setConfigLoading(false));
  }, []);

  useEffect(() => {
    setExtrasLoading(true);
    getExtraIncome(month, year)
      .then(setExtras)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load extra income.'))
      .finally(() => setExtrasLoading(false));
  }, [month, year]);

  const changeMonth = (offset: number) => {
    const next = moveMonth(month, year, offset);
    setMonth(next.month);
    setYear(next.year);
  };

  const saveConfig = async (personId: number) => {
    const amount = Number(drafts[personId]);
    if (!Number.isFinite(amount) || amount < 0) return;
    setSaving(current => ({ ...current, [personId]: true }));
    setSaved(current => ({ ...current, [personId]: false }));
    setError(null);
    try {
      await saveIncomeConfig(personId, amount);
      setConfigs(current => current.map(c => c.person_id === personId ? { ...c, biweekly_amount: amount } : c));
      setSaved(current => ({ ...current, [personId]: true }));
      setTimeout(() => setSaved(current => ({ ...current, [personId]: false })), 2500);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save income.');
    } finally {
      setSaving(current => ({ ...current, [personId]: false }));
    }
  };

  const addExtra = async () => {
    const amount = Number(extraAmount);
    if (!selectedPerson || !Number.isFinite(amount) || amount <= 0) {
      setError('Choose a person and enter a positive amount.');
      return;
    }
    setAddingExtra(true);
    setError(null);
    try {
      await addExtraIncome({ person_id: selectedPerson, month, year, amount, description: extraDesc.trim() || undefined });
      const rows = await getExtraIncome(month, year);
      setExtras(rows);
      setExtraAmount('');
      setExtraDesc('');
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Could not add extra income.');
    } finally {
      setAddingExtra(false);
    }
  };

  const removeExtra = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      await deleteExtraIncome(id);
      setExtras(current => current.filter(e => e.extra_income_id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not remove extra income.');
    } finally {
      setDeletingId(null);
    }
  };

  const totalMonthly = configs.reduce((sum, c) => sum + (c.biweekly_amount || 0) * 2, 0);
  const extrasTotal = extras.reduce((sum, e) => sum + e.amount, 0);

  return (
    <Page>
      <PageHeading
        eyebrow="Configuration"
        title="Income"
        description="Set regular bi-weekly pay and record any extra income for the month."
      />
      {error && <ErrorNotice message={error} onRetry={undefined} />}

      <Panel>
        <SectionHeader title="Bi-weekly pay" detail={totalMonthly > 0 ? `${formatCurrency(totalMonthly, 2)} combined monthly` : 'Enter regular bi-weekly pay below'} />
        {configLoading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} /></View> : configs.map((config, index) => (
          <View key={config.person_id} style={[styles.row, index === 0 && styles.rowFirst]}>
            <View style={styles.rowCopy}>
              <Text style={styles.name}>{config.name}</Text>
              <Text style={styles.detail}>Monthly: {formatCurrency((Number(drafts[config.person_id]) || 0) * 2, 2)}</Text>
            </View>
            <View style={styles.inputWrap}>
              <Text style={styles.dollar}>$</Text>
              <TextInput value={drafts[config.person_id] ?? ''} onChangeText={value => { setDrafts(c => ({ ...c, [config.person_id]: value.replace(/[^0-9.]/g, '') })); setSaved(c => ({ ...c, [config.person_id]: false })); }} onEndEditing={() => saveConfig(config.person_id)} onSubmitEditing={() => saveConfig(config.person_id)} keyboardType="decimal-pad" selectTextOnFocus placeholder="0.00" placeholderTextColor={BudgetColors.faint} style={styles.input} />
            </View>
            {saving[config.person_id] && <ActivityIndicator color={BudgetColors.green} size="small" style={styles.indicator} />}
            {saved[config.person_id] && !saving[config.person_id] && <Text style={styles.savedLabel}>Saved</Text>}
          </View>
        ))}
      </Panel>

      <Panel>
        <SectionHeader
          title="Extra income"
          detail={extrasTotal > 0 ? `${formatCurrency(extrasTotal, 2)} extra this month` : 'Bonus, freelance, or other one-time income'}
          action={<MonthSwitcher month={month} year={year} onPrevious={() => changeMonth(-1)} onNext={() => changeMonth(1)} />}
        />
        <View style={styles.extraForm}>
          <View style={styles.choices}>
            {configs.map(c => (
              <Pressable key={c.person_id} onPress={() => setSelectedPerson(c.person_id)} style={({ pressed }) => [styles.choice, selectedPerson === c.person_id && styles.choiceSelected, pressed && styles.pressed]}>
                <Text style={[styles.choiceText, selectedPerson === c.person_id && styles.choiceTextSelected]}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.extraFields}>
            <View style={styles.inputWrap}>
              <Text style={styles.dollar}>$</Text>
              <TextInput value={extraAmount} onChangeText={value => setExtraAmount(value.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={BudgetColors.faint} style={styles.input} />
            </View>
            <TextInput value={extraDesc} onChangeText={setExtraDesc} placeholder="Description (optional)" placeholderTextColor={BudgetColors.faint} style={styles.descInput} />
            <Pressable disabled={addingExtra || !extraAmount.trim()} onPress={addExtra} style={({ pressed }) => [styles.addBtn, (addingExtra || !extraAmount.trim()) && styles.disabled, pressed && styles.pressed]}>
              {addingExtra ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <Text style={styles.addBtnText}>Add</Text>}
            </Pressable>
          </View>
        </View>
        {extrasLoading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} /></View> : extras.length === 0 ? <EmptyState title="No extra income this month" detail="Use the form above to record a bonus or other one-time income." /> : extras.map((extra, index) => (
          <View key={extra.extra_income_id} style={[styles.extraRow, index === 0 && styles.rowFirst]}>
            <View style={styles.rowCopy}>
              <Text style={styles.name}>{extra.person_name} Â· {extra.description || 'Extra income'}</Text>
            </View>
            <Text style={styles.extraAmount}>{formatCurrency(extra.amount, 2)}</Text>
            <Pressable disabled={deletingId === extra.extra_income_id} onPress={() => removeExtra(extra.extra_income_id)} style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}>
              {deletingId === extra.extra_income_id ? <ActivityIndicator color={BudgetColors.coral} size="small" /> : <Text style={styles.deleteBtnText}>âœ•</Text>}
            </Pressable>
          </View>
        ))}
      </Panel>
    </Page>
  );
}

const styles = StyleSheet.create({
  loader: { minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: 1, borderTopColor: BudgetColors.line },
  rowFirst: { borderTopWidth: 0 },
  rowCopy: { flex: 1, gap: 3 },
  name: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  detail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  inputWrap: { width: 148, height: 42, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 7, backgroundColor: BudgetColors.canvas, overflow: 'hidden' },
  dollar: { color: BudgetColors.muted, paddingLeft: 10, fontFamily: Fonts.sans, fontSize: 13, flexShrink: 0 },
  input: { flex: 1, minWidth: 0, height: 40, paddingHorizontal: 7, textAlign: 'right', color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' },
  indicator: { marginLeft: 4 },
  savedLabel: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800', marginLeft: 4 },
  choices: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  choice: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas },
  choiceSelected: { borderColor: BudgetColors.green, backgroundColor: BudgetColors.greenSoft },
  choiceText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  choiceTextSelected: { color: BudgetColors.green },
  extraForm: { marginBottom: 18 },
  extraFields: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  descInput: { flex: 1, minWidth: 160, height: 42, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, color: BudgetColors.ink, paddingHorizontal: 11, fontFamily: Fonts.sans, fontSize: 13 },
  addBtn: { height: 42, paddingHorizontal: 18, borderRadius: 7, backgroundColor: BudgetColors.green, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  extraRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: BudgetColors.line },
  extraAmount: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  deleteBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { color: BudgetColors.coral, fontFamily: Fonts.sans, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.68 },
});
