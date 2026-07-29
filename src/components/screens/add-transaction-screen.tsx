import { router } from 'expo-router';
import { CalendarDays, CheckCircle2, MapPin, NotebookPen, ReceiptText, RotateCcw, UserRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { ErrorNotice, Page, PageHeading, Panel, SectionHeader } from '@/components/budget-ui';
import { addTransaction, Category, getCategories, getPeople, getSubcategories, Person, Subcategory } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

export default function AddTransactionScreen() {
  const compact = useWindowDimensions().width < 720;
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(null);
  const [personId, setPersonId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadReferenceData = async () => {
    setLoading(true); setError(null);
    try {
      const [categoryRows, peopleRows] = await Promise.all([getCategories(), getPeople()]);
      setCategories(categoryRows); setPeople(peopleRows);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Form options could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadReferenceData(); }, []);

  const chooseCategory = async (selectedId: number) => {
    setCategoryId(selectedId); setSubcategoryId(null); setSubcategories([]); setLoadingSubs(true); setError(null);
    try { setSubcategories(await getSubcategories(selectedId)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Subcategories could not be loaded.'); }
    finally { setLoadingSubs(false); }
  };

  const reset = () => {
    setCategoryId(null); setSubcategoryId(null); setSubcategories([]); setPersonId(null); setAmount(''); setLocation(''); setNotes(''); setDate(new Date().toISOString().slice(0, 10)); setError(null); setSuccess(false);
  };

  const submit = async () => {
    const parsedAmount = Number(amount);
    if (!categoryId || !subcategoryId) { setError('Choose a category and subcategory.'); return; }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) { setError('Enter an amount greater than zero.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))) { setError('Enter a valid date in YYYY-MM-DD format.'); return; }
    setSubmitting(true); setError(null); setSuccess(false);
    try {
      await addTransaction({ subcategory_id: subcategoryId, transaction_date: date, amount: parsedAmount, location: location.trim() || undefined, paid_by_person_id: personId || undefined, notes: notes.trim() || undefined });
      setSuccess(true);
      setCategoryId(null); setSubcategoryId(null); setSubcategories([]); setAmount(''); setLocation(''); setNotes('');
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'The transaction could not be saved.'); }
    finally { setSubmitting(false); }
  };

  return <Page>
    <PageHeading eyebrow="New entry" title="Record a transaction" description="Add an expense to the household ledger and monthly totals." />
    {error && <ErrorNotice message={error} onRetry={loading ? loadReferenceData : undefined} />}
    {success && <View style={styles.success}><CheckCircle2 color={BudgetColors.green} size={20} /><View style={styles.successCopy}><Text style={styles.successTitle}>Transaction recorded</Text><Text style={styles.successDetail}>The dashboard and monthly ledger now include this expense.</Text></View><Pressable onPress={() => router.replace('/transactions')}><Text style={styles.successLink}>View ledger</Text></Pressable></View>}
    {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View> : <>
      <Panel>
        <SectionHeader title="Classification" detail="Choose where this expense belongs" />
        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.choices}>{categories.map(category => <Choice key={category.category_id} label={category.name} selected={categoryId === category.category_id} onPress={() => chooseCategory(category.category_id)} />)}</View>
        {categoryId && <View style={styles.subcategoryBlock}><Text style={styles.fieldLabel}>Subcategory</Text>{loadingSubs ? <ActivityIndicator color={BudgetColors.green} /> : <View style={styles.choices}>{subcategories.map(subcategory => <Choice key={subcategory.subcategory_id} label={subcategory.name} selected={subcategoryId === subcategory.subcategory_id} onPress={() => setSubcategoryId(subcategory.subcategory_id)} />)}</View>}</View>}
      </Panel>
      <View style={[styles.columns, compact && styles.columnsCompact]}>
        <Panel style={styles.column}>
          <SectionHeader title="Expense details" detail="Amount, date, and merchant" />
          <Field icon={<ReceiptText color={BudgetColors.muted} size={17} />} label="Amount" required><View style={styles.amountInput}><Text style={styles.dollar}>$</Text><TextInput value={amount} onChangeText={value => setAmount(value.replace(/[^0-9.]/g, ''))} placeholder="0.00" placeholderTextColor={BudgetColors.faint} keyboardType="decimal-pad" style={styles.flexInput} /></View></Field>
          <Field icon={<CalendarDays color={BudgetColors.muted} size={17} />} label="Date" required><TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={BudgetColors.faint} style={styles.input} /></Field>
          <Field icon={<MapPin color={BudgetColors.muted} size={17} />} label="Location"><TextInput value={location} onChangeText={setLocation} placeholder="Store or merchant" placeholderTextColor={BudgetColors.faint} maxLength={100} style={styles.input} /></Field>
        </Panel>
        <Panel style={styles.column}>
          <SectionHeader title="Household context" detail="Who paid and any useful detail" />
          <Field icon={<UserRound color={BudgetColors.muted} size={17} />} label="Paid by"><View style={styles.choices}>{people.map(person => <Choice key={person.person_id} label={person.name} selected={personId === person.person_id} onPress={() => setPersonId(current => current === person.person_id ? null : person.person_id)} />)}</View></Field>
          <Field icon={<NotebookPen color={BudgetColors.muted} size={17} />} label="Notes"><TextInput value={notes} onChangeText={setNotes} placeholder="Optional context" placeholderTextColor={BudgetColors.faint} maxLength={255} multiline numberOfLines={5} textAlignVertical="top" style={[styles.input, styles.notes]} /></Field>
        </Panel>
      </View>
      <View style={styles.actions}>
        <Pressable disabled={submitting} onPress={reset} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><RotateCcw color={BudgetColors.ink} size={16} /><Text style={styles.secondaryText}>Clear</Text></Pressable>
        <Pressable disabled={submitting} onPress={submit} style={({ pressed }) => [styles.primaryButton, submitting && styles.disabled, pressed && styles.pressed]}>{submitting ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <ReceiptText color={BudgetColors.surface} size={16} />}<Text style={styles.primaryText}>{submitting ? 'Saving' : 'Save transaction'}</Text></Pressable>
      </View>
    </>}
  </Page>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

function Field({ icon, label, required, children }: { icon: React.ReactNode; label: string; required?: boolean; children: React.ReactNode }) {
  return <View style={styles.field}><View style={styles.fieldHeading}>{icon}<Text style={styles.fieldLabel}>{label}{required ? ' *' : ''}</Text></View>{children}</View>;
}

const styles = StyleSheet.create({
  loader: { minHeight: 360, alignItems: 'center', justifyContent: 'center' },
  success: { minHeight: 70, padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#C6DCCA', backgroundColor: BudgetColors.greenSoft, flexDirection: 'row', alignItems: 'center', gap: 12 }, successCopy: { flex: 1, gap: 2 }, successTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' }, successDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 }, successLink: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  fieldLabel: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800', marginBottom: 8 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: 36, paddingHorizontal: 11, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, alignItems: 'center', justifyContent: 'center' }, choiceSelected: { borderColor: BudgetColors.green, backgroundColor: BudgetColors.greenSoft }, choiceText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' }, choiceTextSelected: { color: BudgetColors.green },
  subcategoryBlock: { marginTop: 22 }, columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 }, columnsCompact: { flexDirection: 'column' }, column: { flex: 1, width: '100%', gap: 18 },
  field: { gap: 7 }, fieldHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  input: { height: 44, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, color: BudgetColors.ink, paddingHorizontal: 12, fontFamily: Fonts.sans, fontSize: 13 }, notes: { height: 118, paddingTop: 11 },
  amountInput: { height: 44, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, flexDirection: 'row', alignItems: 'center' }, dollar: { color: BudgetColors.muted, paddingLeft: 12, fontFamily: Fonts.sans, fontSize: 14 }, flexInput: { flex: 1, height: 42, paddingHorizontal: 8, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }, secondaryButton: { height: 42, paddingHorizontal: 14, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.surface, flexDirection: 'row', alignItems: 'center', gap: 7 }, secondaryText: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' }, primaryButton: { height: 42, paddingHorizontal: 16, borderRadius: 7, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', gap: 7 }, primaryText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.68 },
});