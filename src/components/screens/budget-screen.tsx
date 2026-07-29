import { Copy, Save } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { ErrorNotice, formatCurrency, MonthSwitcher, moveMonth, Page, PageHeading, Panel, SectionHeader, StatCard } from '@/components/budget-ui';
import { BudgetLine, getBudgetLines, saveBudgetLine } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

export default function BudgetScreen() {
  const now = new Date();
  const compact = useWindowDimensions().width < 700;
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const rows = await getBudgetLines(month, year);
      setLines(rows);
      setDrafts(Object.fromEntries(rows.map(line => [line.subcategory_id, String(line.projected_amount)])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The budget could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month, year]);

  const changeMonth = (offset: number) => {
    const next = moveMonth(month, year, offset);
    setMonth(next.month);
    setYear(next.year);
  };

  const saveAll = async () => {
    const changed = lines.filter(line => Number(drafts[line.subcategory_id] || 0) !== line.projected_amount);
    if (changed.length === 0) {
      setNotice('Everything is already saved.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await Promise.all(changed.map(line => saveBudgetLine(line.subcategory_id, month, year, Number(drafts[line.subcategory_id] || 0))));
      setLines(current => current.map(line => ({ ...line, projected_amount: Number(drafts[line.subcategory_id] || 0) })));
      setNotice(`${changed.length} budget line${changed.length === 1 ? '' : 's'} saved.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The budget could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const copyPrevious = async () => {
    const previous = moveMonth(month, year, -1);
    setError(null);
    try {
      const previousLines = await getBudgetLines(previous.month, previous.year);
      const previousAmounts = new Map(previousLines.map(line => [line.subcategory_id, line.projected_amount]));
      setDrafts(current => Object.fromEntries(Object.keys(current).map(key => [key, String(previousAmounts.get(Number(key)) ?? 0)])));
      setNotice('Previous month copied. Review the amounts, then save.');
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'The previous budget could not be copied.');
    }
  };

  const planned = lines.reduce((sum, line) => sum + Number(drafts[line.subcategory_id] || 0), 0);
  const actual = lines.reduce((sum, line) => sum + line.actual_amount, 0);
  const remaining = planned - actual;
  const groups = lines.reduce<Record<string, BudgetLine[]>>((result, line) => {
    (result[line.category] ||= []).push(line);
    return result;
  }, {});

  return (
    <Page>
      <PageHeading
        eyebrow="Planning"
        title="Monthly budget"
        description="Set a plan by category and compare it with transaction activity."
        action={<MonthSwitcher month={month} year={year} onPrevious={() => changeMonth(-1)} onNext={() => changeMonth(1)} />}
      />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {notice && <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View>}
      <View style={styles.stats}>
        <StatCard label="Planned" value={formatCurrency(planned)} detail="Across all categories" />
        <StatCard label="Actual" value={formatCurrency(actual)} detail="From recorded transactions" accent={BudgetColors.blue} />
        <StatCard label={remaining >= 0 ? 'Remaining' : 'Over plan'} value={formatCurrency(Math.abs(remaining))} detail={planned > 0 ? `${Math.round(actual / planned * 100)}% used` : 'Enter a plan below'} accent={remaining >= 0 ? BudgetColors.gold : BudgetColors.coral} />
      </View>
      <View style={styles.toolbar}>
        <Pressable onPress={copyPrevious} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Copy color={BudgetColors.ink} size={16} /><Text style={styles.secondaryText}>Copy previous month</Text>
        </Pressable>
        <Pressable disabled={saving} onPress={saveAll} style={({ pressed }) => [styles.primaryButton, saving && styles.disabled, pressed && styles.pressed]}>
          {saving ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <Save color={BudgetColors.surface} size={16} />}
          <Text style={styles.primaryText}>{saving ? 'Saving' : 'Save changes'}</Text>
        </Pressable>
      </View>
      {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View> : Object.entries(groups).map(([category, categoryLines]) => {
        const categoryPlanned = categoryLines.reduce((sum, line) => sum + Number(drafts[line.subcategory_id] || 0), 0);
        const categoryActual = categoryLines.reduce((sum, line) => sum + line.actual_amount, 0);
        return <Panel key={category}>
          <SectionHeader title={category} detail={`${formatCurrency(categoryActual)} spent of ${formatCurrency(categoryPlanned)} planned`} />
          {categoryLines.map((line, index) => {
            const linePlan = Number(drafts[line.subcategory_id] || 0);
            const percent = linePlan > 0 ? line.actual_amount / linePlan * 100 : line.actual_amount > 0 ? 100 : 0;
            return <View key={line.subcategory_id} style={[styles.line, compact && styles.lineCompact, index === 0 && styles.lineFirst]}>
              <View style={styles.lineCopy}>
                <Text style={styles.lineName}>{line.subcategory}</Text>
                <Text style={[styles.lineActual, percent > 100 && styles.over]}>{formatCurrency(line.actual_amount, 2)} spent</Text>
                <View style={styles.progress}><View style={[styles.progressFill, percent > 100 && styles.progressOver, { width: `${Math.min(percent, 100)}%` }]} /></View>
              </View>
              <View style={styles.inputWrap}><Text style={styles.currency}>$</Text><TextInput value={drafts[line.subcategory_id] ?? '0'} onChangeText={value => setDrafts(current => ({ ...current, [line.subcategory_id]: value.replace(/[^0-9.]/g, '') }))} keyboardType="decimal-pad" selectTextOnFocus style={styles.input} /></View>
            </View>;
          })}
        </Panel>;
      })}
    </Page>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  notice: { padding: 12, borderRadius: 7, backgroundColor: BudgetColors.greenSoft, borderWidth: 1, borderColor: '#C7DCCD' },
  noticeText: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '700' },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' },
  secondaryButton: { height: 40, paddingHorizontal: 13, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.surface, flexDirection: 'row', alignItems: 'center', gap: 7 },
  secondaryText: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  primaryButton: { height: 40, paddingHorizontal: 14, borderRadius: 7, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', gap: 7 },
  primaryText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.55 }, pressed: { opacity: 0.7 }, loader: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  line: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 20, borderTopWidth: 1, borderTopColor: BudgetColors.line },
  lineFirst: { borderTopWidth: 0 }, lineCompact: { minHeight: 92 }, lineCopy: { flex: 1, minWidth: 0, gap: 4 },
  lineName: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  lineActual: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 }, over: { color: BudgetColors.coral },
  progress: { width: '100%', maxWidth: 380, height: 4, borderRadius: 2, backgroundColor: BudgetColors.canvas, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: BudgetColors.green }, progressOver: { backgroundColor: BudgetColors.coral },
  inputWrap: { width: 126, height: 40, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 7, backgroundColor: BudgetColors.canvas },
  currency: { color: BudgetColors.muted, paddingLeft: 11, fontFamily: Fonts.sans, fontSize: 13 },
  input: { flex: 1, height: 38, color: BudgetColors.ink, paddingHorizontal: 7, textAlign: 'right', fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
});