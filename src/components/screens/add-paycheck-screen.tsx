import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { ErrorNotice, formatCurrency, Page, PageHeading, Panel, SectionHeader } from '@/components/budget-ui';
import { getIncomeConfig, IncomeConfig, saveIncomeConfig } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

export default function AddPaycheckScreen() {
  const [configs, setConfigs] = useState<IncomeConfig[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getIncomeConfig()
      .then(rows => {
        setConfigs(rows);
        setDrafts(Object.fromEntries(rows.map(row => [row.person_id, String(row.biweekly_amount || '')])));
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load income configuration.'))
      .finally(() => setLoading(false));
  }, []);

  const save = async (personId: number) => {
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

  const totalMonthly = configs.reduce((sum, c) => sum + (c.biweekly_amount || 0) * 2, 0);

  return (
    <Page>
      <PageHeading
        eyebrow="Configuration"
        title="Bi-weekly income"
        description="Enter each person's regular bi-weekly net pay. The app uses this to calculate what each person owes the joint account per paycheck."
      />
      {error && <ErrorNotice message={error} />}
      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View>
      ) : (
        <Panel>
          <SectionHeader
            title="Pay configuration"
            detail={totalMonthly > 0 ? `${formatCurrency(totalMonthly, 2)} combined monthly income` : 'Enter each person\'s bi-weekly pay below'}
          />
          {configs.map((config, index) => (
            <View key={config.person_id} style={[styles.row, index === 0 && styles.rowFirst]}>
              <View style={styles.rowCopy}>
                <Text style={styles.name}>{config.name}</Text>
                <Text style={styles.detail}>
                  Monthly: {formatCurrency((Number(drafts[config.person_id]) || 0) * 2, 2)}
                </Text>
              </View>
              <View style={styles.inputWrap}>
                <Text style={styles.dollar}>$</Text>
                <TextInput
                  value={drafts[config.person_id] ?? ''}
                  onChangeText={value => {
                    setDrafts(current => ({ ...current, [config.person_id]: value.replace(/[^0-9.]/g, '') }));
                    setSaved(current => ({ ...current, [config.person_id]: false }));
                  }}
                  onEndEditing={() => save(config.person_id)}
                  onSubmitEditing={() => save(config.person_id)}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  placeholder="0.00"
                  placeholderTextColor={BudgetColors.faint}
                  style={styles.input}
                />
              </View>
              {saving[config.person_id] && (
                <ActivityIndicator color={BudgetColors.green} size="small" style={styles.indicator} />
              )}
              {saved[config.person_id] && !saving[config.person_id] && (
                <Text style={styles.savedLabel}>Saved</Text>
              )}
            </View>
          ))}
          {configs.length === 0 && (
            <Text style={styles.empty}>No household members found. Add people in settings.</Text>
          )}
        </Panel>
      )}
      <Panel style={styles.infoPanel}>
        <Text style={styles.infoTitle}>How the calculation works</Text>
        <Text style={styles.infoText}>
          {'Per paycheck contribution = (your income % × monthly planned expenses) ÷ 2\n\nPersonal household expenses you pay directly are credited against this amount.'}
        </Text>
      </Panel>
    </Page>
  );
}

const styles = StyleSheet.create({
  loader: { minHeight: 240, alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: 1, borderTopColor: BudgetColors.line },
  rowFirst: { borderTopWidth: 0 },
  rowCopy: { flex: 1, gap: 3 },
  name: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' },
  detail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  inputWrap: { width: 148, height: 42, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 7, backgroundColor: BudgetColors.canvas, overflow: 'hidden' },
  dollar: { color: BudgetColors.muted, paddingLeft: 10, fontFamily: Fonts.sans, fontSize: 13, flexShrink: 0 },
  input: { flex: 1, minWidth: 0, height: 40, paddingHorizontal: 7, textAlign: 'right', color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' },
  indicator: { marginLeft: 4 },
  savedLabel: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800', marginLeft: 4 },
  empty: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  infoPanel: { gap: 8 },
  infoTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  infoText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 20 },
});
