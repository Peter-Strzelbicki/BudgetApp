import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, MapPin, NotebookPen, ReceiptText, Repeat, RotateCcw, UserRound, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOutUp, ReduceMotion, ZoomIn } from 'react-native-reanimated';

import { AnimatedHorizontalBar } from '@/components/animated-bar';
import { ErrorNotice, formatCurrency, Page, PageHeading, Panel, SectionHeader } from '@/components/budget-ui';
import { DateInput } from '@/components/date-input';
import { TimeInput } from '@/components/time-input';
import { addTransaction, BudgetLine, Category, getBudgetLines, getCategories, getPeople, getRecurringTransactions, getSubcategories, getTransaction, getTransactions, Person, RecurringTransaction, Subcategory, Transaction, updateTransaction } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

const successEntrance = FadeInDown.duration(380)
  .easing(Easing.out(Easing.back(1.15)))
  .reduceMotion(ReduceMotion.System);
const successIconEntrance = ZoomIn.duration(460)
  .delay(80)
  .easing(Easing.out(Easing.back(1.7)))
  .reduceMotion(ReduceMotion.System);
const toastExit = FadeOutUp.duration(220)
  .easing(Easing.out(Easing.cubic))
  .reduceMotion(ReduceMotion.System);

function nowHHMM() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

export default function AddTransactionScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const params = useLocalSearchParams<{ transactionId?: string }>();
  const transactionIdValue = Array.isArray(params.transactionId) ? params.transactionId[0] : params.transactionId;
  const transactionId = Number(transactionIdValue);
  const editing = Number.isInteger(transactionId) && transactionId > 0;
  const compact = useWindowDimensions().width < 720;
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(null);
  const [personId, setPersonId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [time, setTime] = useState(nowHHMM);
  const [loading, setLoading] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [dateInputVersion, setDateInputVersion] = useState(0);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [periodBudgetLines, setPeriodBudgetLines] = useState<BudgetLine[]>([]);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [recurringHintDismissed, setRecurringHintDismissed] = useState(false);
  const [duplicateHintDismissed, setDuplicateHintDismissed] = useState(false);

  const loadReferenceData = async () => {
    setLoading(true); setError(null);
    try {
      const [categoryRows, peopleRows, transaction, transactionRows, recurringRows] = await Promise.all([
        getCategories(),
        getPeople(),
        editing ? getTransaction(transactionId) : Promise.resolve(null),
        getTransactions(),
        getRecurringTransactions(),
      ]);
      setCategories(categoryRows); setPeople(peopleRows);
      setAllTransactions(transactionRows);
      setRecurring(recurringRows);
      if (transaction) {
        setCategoryId(transaction.category_id);
        setSubcategoryId(transaction.subcategory_id);
        setSubcategories(await getSubcategories(transaction.category_id));
        setPersonId(transaction.paid_by_person_id);
        setAmount(String(transaction.amount));
        setDate(transaction.transaction_date.slice(0, 10));
        setLocation(transaction.location || '');
        setNotes(transaction.notes || '');
        if (transaction.transaction_time) setTime(transaction.transaction_time.slice(0, 5));
      }
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Form options could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadReferenceData(); }, [transactionIdValue]);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setPeriodBudgetLines([]);
      return;
    }
    const targetMonth = Number(date.slice(5, 7));
    const targetYear = Number(date.slice(0, 4));
    let cancelled = false;
    setBudgetLoading(true);
    getBudgetLines(targetMonth, targetYear)
      .then(rows => {
        if (!cancelled) setPeriodBudgetLines(rows);
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Budget context could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setBudgetLoading(false);
      });
    return () => { cancelled = true; };
  }, [date]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 1500);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  // reset dismissal whenever the location text changes so a new match can surface
  useEffect(() => { setRecurringHintDismissed(false); setDuplicateHintDismissed(false); }, [location]);

  const chooseCategory = async (selectedId: number) => {
    setCategoryId(selectedId); setSubcategoryId(null); setSubcategories([]); setLoadingSubs(true); setError(null);
    try { setSubcategories(await getSubcategories(selectedId)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Subcategories could not be loaded.'); }
    finally { setLoadingSubs(false); }
  };

  const reset = () => {
    if (editing) {
      loadReferenceData();
      setToastMessage(null);
      return;
    }
    setCategoryId(null); setSubcategoryId(null); setSubcategories([]); setPersonId(null); setAmount(''); setLocation(''); setNotes(''); setTime(nowHHMM()); setDate(today); setDateInputVersion(current => current + 1); setError(null); setToastMessage(null);
  };

  const applyRecurringMatch = async (match: RecurringTransaction) => {
    const matchedCategory = categories.find(c => c.name === match.category);
    if (matchedCategory) {
      setCategoryId(matchedCategory.category_id);
      setSubcategoryId(null); setSubcategories([]); setLoadingSubs(true);
      try {
        const subs = await getSubcategories(matchedCategory.category_id);
        setSubcategories(subs);
        setSubcategoryId(match.subcategory_id);
      } catch { /* ignore */ } finally { setLoadingSubs(false); }
    }
    if (!amount) setAmount(String(match.amount));
    if (!personId && match.paid_by_person_id) setPersonId(match.paid_by_person_id);
    setRecurringHintDismissed(true);
  };

  const submit = async () => {
    const parsedAmount = Number(amount);
    if (!categoryId || !subcategoryId) { setError('Choose a category and subcategory.'); return; }
    if (!Number.isFinite(parsedAmount) || parsedAmount === 0) { setError('Enter a non-zero amount.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))) { setError('Enter a valid date in YYYY-MM-DD format.'); return; }
    setSubmitting(true); setError(null); setToastMessage(null);
    try {
      const payload = { subcategory_id: subcategoryId, transaction_date: date, transaction_time: time, amount: parsedAmount, location: location.trim() || undefined, paid_by_person_id: personId || undefined, notes: notes.trim() || undefined };
      if (editing) await updateTransaction(transactionId, payload);
      else await addTransaction(payload);
      const [transactionRows, budgetRows] = await Promise.all([
        getTransactions(),
        /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? getBudgetLines(Number(date.slice(5, 7)), Number(date.slice(0, 4)))
          : Promise.resolve([]),
      ]);
      setAllTransactions(transactionRows);
      setPeriodBudgetLines(budgetRows);
      setToastMessage(editing ? 'Transaction updated' : 'Transaction recorded');
      if (!editing) {
        setCategoryId(null); setSubcategoryId(null); setSubcategories([]); setAmount(''); setLocation(''); setNotes(''); setDate(today); setDateInputVersion(current => current + 1);
      }
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'The transaction could not be saved.'); }
    finally { setSubmitting(false); }
  };

  const selectedCategoryName = categories.find(category => category.category_id === categoryId)?.name;
  const selectedCategoryBudget = selectedCategoryName
    ? periodBudgetLines.filter(line => line.category === selectedCategoryName)
    : [];
  const categoryProjected = selectedCategoryBudget.reduce((sum, line) => sum + line.projected_amount, 0);
  const categoryActual = selectedCategoryBudget.reduce((sum, line) => sum + line.actual_amount, 0);
  const categoryRemaining = categoryProjected - categoryActual;
  const pendingAmount = Number(amount);
  const amountPreview = Number.isFinite(pendingAmount) ? pendingAmount : 0;
  const remainingAfterEntry = categoryRemaining - amountPreview;
  const categoryUsagePct = categoryProjected > 0 ? Math.min(categoryActual / categoryProjected * 100, 100) : 0;

  const recentForSelectedPerson = personId
    ? allTransactions
      .filter(transaction => transaction.paid_by_person_id === personId)
      .slice(0, 3)
    : [];

  const recurringMatch = (() => {
    if (recurringHintDismissed || location.trim().length < 3) return null;
    const needle = location.trim().toLowerCase();
    return recurring.find(r => {
      if (!r.is_active) return false;
      if (r.location) {
        const hay = r.location.toLowerCase();
        return hay.includes(needle) || needle.includes(hay);
      }
      const sub = r.subcategory.toLowerCase();
      return sub.includes(needle) || needle.includes(sub);
    }) ?? null;
  })();

  const recentDuplicates = (() => {
    if (duplicateHintDismissed || location.trim().length < 3) return [];
    const needle = location.trim().toLowerCase();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    return allTransactions.filter(t => {
      if (!t.location) return false;
      const hay = t.location.toLowerCase();
      return (hay.includes(needle) || needle.includes(hay)) && new Date(t.transaction_date) >= cutoff;
    });
  })();
  const duplicatesToday = recentDuplicates.filter(t => t.transaction_date.slice(0, 10) === today);

  return <Page>
    <PageHeading eyebrow={editing ? 'Ledger entry' : 'New entry'} title={editing ? 'Edit transaction' : 'Record a transaction'} description={editing ? 'Update the expense details, classification, or payer.' : 'Add an expense to the household ledger and monthly totals.'} />
    {error && <ErrorNotice message={error} onRetry={loading ? loadReferenceData : undefined} />}
    {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View> : <>
      <Panel>
        <SectionHeader title="Classification" detail="Choose where this expense belongs" />
        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.choices}>{categories.map(category => <Choice key={category.category_id} label={category.name} selected={categoryId === category.category_id} onPress={() => chooseCategory(category.category_id)} />)}</View>
        {categoryId && <View style={styles.subcategoryBlock}><Text style={styles.fieldLabel}>Subcategory</Text>{loadingSubs ? <ActivityIndicator color={BudgetColors.green} /> : <View style={styles.choices}>{subcategories.map(subcategory => <Choice key={subcategory.subcategory_id} label={subcategory.name} selected={subcategoryId === subcategory.subcategory_id} onPress={() => setSubcategoryId(subcategory.subcategory_id)} />)}</View>}</View>}
      </Panel>
      <View style={[styles.columns, compact && styles.columnsCompact]}>
        <Panel style={[styles.column, compact && styles.columnCompact]}>
          <SectionHeader title="Expense details" detail="Amount, date, and merchant" />
          <Field icon={<ReceiptText color={BudgetColors.muted} size={17} />} label="Amount" required><View style={styles.amountInput}><Text style={styles.dollar}>$</Text><TextInput value={amount} onChangeText={value => setAmount(sanitizeSignedAmountInput(value))} placeholder="0.00" placeholderTextColor={BudgetColors.faint} keyboardType="decimal-pad" style={styles.flexInput} /></View></Field>
          <Field icon={<CalendarDays color={BudgetColors.muted} size={17} />} label="Date" required>
            <DateInput key={dateInputVersion} value={date} onChange={setDate} />
          </Field>
          <Field icon={<Clock color={BudgetColors.muted} size={17} />} label="Time">
            <TimeInput value={time} onChange={setTime} />
          </Field>
          <Field icon={<MapPin color={BudgetColors.muted} size={17} />} label="Location"><TextInput value={location} onChangeText={setLocation} placeholder="Store or merchant" placeholderTextColor={BudgetColors.faint} maxLength={100} style={styles.input} /></Field>
          {recurringMatch && (
            <View style={styles.recurringHint}>
              <Repeat color={BudgetColors.green} size={14} />
              <View style={styles.recurringHintCopy}>
                <Text style={styles.recurringHintTitle} numberOfLines={1}>Recurring: {recurringMatch.location ?? recurringMatch.subcategory}</Text>
                <Text style={styles.recurringHintDetail}>{recurringMatch.category} · {formatCurrency(recurringMatch.amount, 2)}</Text>
              </View>
              <Pressable onPress={() => applyRecurringMatch(recurringMatch)} style={styles.recurringHintApply}><Text style={styles.recurringHintApplyText}>Apply</Text></Pressable>
              <Pressable onPress={() => setRecurringHintDismissed(true)} style={styles.recurringHintDismiss}><X color={BudgetColors.muted} size={14} /></Pressable>
            </View>
          )}
          {recentDuplicates.length > 0 && (
            <View style={styles.duplicateHint}>
              <AlertTriangle color={BudgetColors.gold} size={14} />
              <View style={styles.recurringHintCopy}>
                <Text style={styles.duplicateHintTitle} numberOfLines={1}>
                  {duplicatesToday.length > 0
                    ? `Already logged ${duplicatesToday.length}× today at ${recentDuplicates[0].location}`
                    : `${recentDuplicates.length}× in the last 30 days at ${recentDuplicates[0].location}`}
                </Text>
                <Text style={styles.recurringHintDetail}>Last: {new Date(recentDuplicates[0].transaction_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} · {formatCurrency(recentDuplicates[0].amount, 2)}</Text>
              </View>
              <Pressable onPress={() => setDuplicateHintDismissed(true)} style={styles.recurringHintDismiss}><X color={BudgetColors.muted} size={14} /></Pressable>
            </View>
          )}
          <View style={styles.categoryBudgetPanel}>
            <Text style={styles.categoryBudgetTitle}>Category budget</Text>
            {!categoryId ? (
              <Text style={styles.categoryBudgetDetail}>Choose a category to see its monthly budget and spending.</Text>
            ) : budgetLoading ? (
              <ActivityIndicator color={BudgetColors.green} size="small" />
            ) : categoryProjected <= 0 ? (
              <Text style={styles.categoryBudgetDetail}>No projected budget set for {selectedCategoryName} in this month.</Text>
            ) : (
              <>
                <View style={styles.categoryBudgetHeader}>
                  <Text style={styles.categoryBudgetDetail}>Spent {formatCurrency(categoryActual, 2)} of {formatCurrency(categoryProjected, 2)}</Text>
                  <Text style={[styles.categoryBudgetRemaining, categoryRemaining < 0 && styles.categoryBudgetOver]}>
                    {categoryRemaining >= 0
                      ? `${formatCurrency(categoryRemaining, 2)} remaining`
                      : `${formatCurrency(Math.abs(categoryRemaining), 2)} over`}
                  </Text>
                </View>
                <View style={styles.categoryBudgetTrack}>
                  <AnimatedHorizontalBar percent={categoryUsagePct} style={[styles.categoryBudgetFill, categoryActual > categoryProjected && styles.categoryBudgetFillOver]} />
                </View>
                {amountPreview !== 0 && (
                  <Text style={[styles.categoryBudgetPreview, remainingAfterEntry < 0 && styles.categoryBudgetOver]}>
                    After this entry: {remainingAfterEntry >= 0 ? `${formatCurrency(remainingAfterEntry, 2)} remaining` : `${formatCurrency(Math.abs(remainingAfterEntry), 2)} over`}
                  </Text>
                )}
              </>
            )}
          </View>
        </Panel>
        <Panel style={[styles.column, compact && styles.columnCompact]}>
          <SectionHeader title="Household context" detail="Who paid and any useful detail" />
          <Field icon={<UserRound color={BudgetColors.muted} size={17} />} label="Paid by"><View style={styles.choices}>{people.map(person => <Choice key={person.person_id} label={person.name} selected={personId === person.person_id} onPress={() => setPersonId(current => current === person.person_id ? null : person.person_id)} />)}</View></Field>
          <View style={styles.recentPanel}>
            <Text style={styles.recentTitle}>Last 3 transactions</Text>
            {!personId ? (
              <Text style={styles.recentDetail}>Select who paid to show their latest transactions.</Text>
            ) : recentForSelectedPerson.length === 0 ? (
              <Text style={styles.recentDetail}>No transactions found yet for this person.</Text>
            ) : (
              recentForSelectedPerson.map((transaction, index) => (
                <View key={transaction.transaction_id} style={[styles.recentRow, index === 0 && styles.recentRowFirst]}>
                  <View style={styles.recentCopy}>
                    <Text style={styles.recentName} numberOfLines={1}>{transaction.location || transaction.subcategory}</Text>
                    <Text style={styles.recentMeta}>{new Date(transaction.transaction_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} · {transaction.category}</Text>
                  </View>
                  <Text style={styles.recentAmount}>{formatCurrency(transaction.amount, 2)}</Text>
                </View>
              ))
            )}
          </View>
          <Field icon={<NotebookPen color={BudgetColors.muted} size={17} />} label="Notes"><TextInput value={notes} onChangeText={setNotes} placeholder="Optional context" placeholderTextColor={BudgetColors.faint} maxLength={255} multiline numberOfLines={5} textAlignVertical="top" style={[styles.input, styles.notes]} /></Field>
        </Panel>
      </View>
      <View style={[styles.actions, compact && styles.actionsCompact]}>
        <Pressable onPress={() => editing ? router.back() : router.replace('/transactions')} style={({ pressed }) => [styles.secondaryButton, compact && styles.actionButtonCompact, pressed && styles.pressed]}><Text style={styles.secondaryText}>{editing ? 'Back to ledger' : 'View ledger'}</Text></Pressable>
        <Pressable disabled={submitting} onPress={reset} style={({ pressed }) => [styles.secondaryButton, compact && styles.actionButtonCompact, pressed && styles.pressed]}><RotateCcw color={BudgetColors.ink} size={16} /><Text style={styles.secondaryText}>{editing ? 'Reset' : 'Clear'}</Text></Pressable>
        <Pressable disabled={submitting} onPress={submit} style={({ pressed }) => [styles.primaryButton, compact && styles.actionButtonCompact, submitting && styles.disabled, pressed && styles.pressed]}>{submitting ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <ReceiptText color={BudgetColors.surface} size={16} />}<Text style={styles.primaryText}>{submitting ? 'Saving' : editing ? 'Save changes' : 'Save transaction'}</Text></Pressable>
      </View>
    </>}
    <Modal transparent statusBarTranslucent animationType="none" visible={Boolean(toastMessage)}>
      <View pointerEvents="box-none" style={styles.toastViewport}>
        {toastMessage && (
          <Animated.View entering={successEntrance} exiting={toastExit} pointerEvents="none" style={styles.toastCard}>
            <Animated.View entering={successIconEntrance} style={styles.successIcon}>
              <CheckCircle2 color={BudgetColors.green} size={22} strokeWidth={2.4} />
            </Animated.View>
            <Text style={styles.toastText}>{toastMessage}</Text>
          </Animated.View>
        )}
      </View>
    </Modal>
  </Page>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

function Field({ icon, label, required, children }: { icon: React.ReactNode; label: string; required?: boolean; children: React.ReactNode }) {
  return <View style={styles.field}><View style={styles.fieldHeading}>{icon}<Text style={styles.fieldLabel}>{label}{required ? ' *' : ''}</Text></View>{children}</View>;
}

function sanitizeSignedAmountInput(value: string) {
  const normalized = value.replace(/[^0-9.-]/g, '');
  const hasLeadingMinus = normalized.startsWith('-');
  const unsigned = normalized.replace(/-/g, '');
  const [wholePart, ...decimalParts] = unsigned.split('.');
  const decimalPart = decimalParts.join('');
  return `${hasLeadingMinus ? '-' : ''}${wholePart}${decimalParts.length > 0 ? `.${decimalPart}` : ''}`;
}

const styles = StyleSheet.create({
  loader: { minHeight: 360, alignItems: 'center', justifyContent: 'center' },
  successIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: BudgetColors.surface, borderWidth: 1, borderColor: BudgetColors.successLine, alignItems: 'center', justifyContent: 'center' },
  toastViewport: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  toastCard: { minHeight: 66, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: BudgetColors.successLine, backgroundColor: BudgetColors.greenSoft, flexDirection: 'row', alignItems: 'center', gap: 11, shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 9 },
  toastText: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  fieldLabel: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800', marginBottom: 8 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: 36, paddingHorizontal: 11, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, alignItems: 'center', justifyContent: 'center' }, choiceSelected: { borderColor: BudgetColors.green, backgroundColor: BudgetColors.greenSoft }, choiceText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' }, choiceTextSelected: { color: BudgetColors.green },
  subcategoryBlock: { marginTop: 22 }, columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 }, columnsCompact: { flexDirection: 'column' }, column: { flex: 1, minWidth: 0, gap: 18 }, columnCompact: { alignSelf: 'stretch', flexGrow: 0, flexShrink: 1, flexBasis: 'auto' },
  categoryBudgetPanel: { width: '100%', minWidth: 0, marginTop: 6, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.surface, padding: 11, gap: 7 },
  categoryBudgetTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  categoryBudgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  categoryBudgetDetail: { flexShrink: 1, color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  categoryBudgetRemaining: { flexShrink: 1, color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  categoryBudgetOver: { color: BudgetColors.coral },
  categoryBudgetTrack: { height: 11, borderRadius: 6, backgroundColor: BudgetColors.canvas, overflow: 'hidden' },
  categoryBudgetFill: { height: 11, borderRadius: 6, backgroundColor: BudgetColors.green },
  categoryBudgetFillOver: { backgroundColor: BudgetColors.coral },
  categoryBudgetPreview: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  recentPanel: { marginTop: 4, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.surface, paddingHorizontal: 11, paddingTop: 9, paddingBottom: 7 },
  recentTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800', marginBottom: 3 },
  recentDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, marginBottom: 2 },
  recentRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: BudgetColors.line, paddingVertical: 6 },
  recentRowFirst: { borderTopWidth: 0 },
  recentCopy: { flex: 1, minWidth: 0, gap: 1 },
  recentName: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  recentMeta: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 10 },
  recentAmount: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  field: { gap: 7 }, fieldHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  input: { height: 44, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, color: BudgetColors.ink, paddingHorizontal: 12, fontFamily: Fonts.sans, fontSize: 13 }, notes: { height: 118, paddingTop: 11 },
  amountInput: { height: 44, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, flexDirection: 'row', alignItems: 'center' }, dollar: { color: BudgetColors.muted, paddingLeft: 12, fontFamily: Fonts.sans, fontSize: 14 }, flexInput: { flex: 1, height: 42, paddingHorizontal: 8, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }, actionsCompact: { flexDirection: 'column', width: '100%' }, actionButtonCompact: { width: '100%', justifyContent: 'center' }, secondaryButton: { height: 42, paddingHorizontal: 14, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.surface, flexDirection: 'row', alignItems: 'center', gap: 7 }, secondaryText: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' }, primaryButton: { height: 42, paddingHorizontal: 16, borderRadius: 7, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', gap: 7 }, primaryText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.68 },
  recurringHint: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 4, padding: 10, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.successLine, backgroundColor: BudgetColors.greenSoft }, recurringHintCopy: { flex: 1, minWidth: 0, gap: 1 }, recurringHintTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' }, recurringHintDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10 }, recurringHintApply: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5, backgroundColor: BudgetColors.green }, recurringHintApplyText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' }, recurringHintDismiss: { padding: 5 },
  duplicateHint: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 4, padding: 10, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.warningLine, backgroundColor: BudgetColors.goldSoft }, duplicateHintTitle: { color: BudgetColors.warningInk, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
});