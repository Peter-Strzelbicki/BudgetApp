import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { MapPin, Pencil, Plus, ReceiptText, Repeat, Search, Trash2, UserRound } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { AnimatedHorizontalBar } from '@/components/animated-bar';
import { EmptyState, ErrorNotice, formatCurrency, MonthSwitcher, moveMonth, Page, PageHeading, Panel, SectionHeader } from '@/components/budget-ui';
import { applyRecurringTransactions, BudgetLine, ContributionSummary, deleteTransaction, getBudgetLines, getContributionSummary, getPendingRecurring, getTransactions, Transaction } from '@/constants/api';
import { TRACKING_START_MONTH, TRACKING_START_YEAR } from '@/constants/tracking-period';
import { BudgetColors, Fonts } from '@/constants/theme';

export default function TransactionsScreen() {
  const now = new Date();
  const compact = useWindowDimensions().width < 720;
  const params = useLocalSearchParams<{ month?: string; year?: string; category?: string }>();
  const [month, setMonth] = useState(() => params.month ? Number(params.month) : now.getMonth() + 1);
  const [year, setYear] = useState(() => params.year ? Number(params.year) : now.getFullYear());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pendingRecurring, setPendingRecurring] = useState(0);
  const [applying, setApplying] = useState(false);
  const [contribution, setContribution] = useState<ContributionSummary | null>(null);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [categoryFilter, setCategoryFilter] = useState(() => params.category ?? 'All');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [txRows, pending, contributionRows, budgetRows] = await Promise.all([
        getTransactions(month, year),
        getPendingRecurring(month, year),
        getContributionSummary(month, year),
        getBudgetLines(month, year),
      ]);
      setTransactions(txRows);
      setPendingRecurring(pending.pending);
      setContribution(contributionRows);
      setBudgetLines(budgetRows);
    }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Transactions could not be loaded.'); }
    finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, [month, year]));

  const changeMonth = (offset: number) => {
    const next = moveMonth(month, year, offset);
    const now = new Date();
    const afterCurrentMonth = next.year > now.getFullYear() || (next.year === now.getFullYear() && next.month > now.getMonth() + 1);
    const beforeTrackingStart = next.year < TRACKING_START_YEAR || (next.year === TRACKING_START_YEAR && next.month < TRACKING_START_MONTH);
    if (afterCurrentMonth || beforeTrackingStart) return;
    setMonth(next.month); setYear(next.year);
  };

  const remove = async (transaction: Transaction) => {
    const confirmed = await confirmRemoval(transaction);
    if (!confirmed) return;
    setDeletingId(transaction.transaction_id); setError(null);
    try {
      await deleteTransaction(transaction.transaction_id);
      setTransactions(current => current.filter(item => item.transaction_id !== transaction.transaction_id));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'The transaction could not be deleted.');
    } finally { setDeletingId(null); }
  };

  const applyRecurring = async () => {
    setApplying(true); setError(null);
    try {
      const result = await applyRecurringTransactions(month, year);
      if (result.applied > 0) {
        const [txRows, pending] = await Promise.all([getTransactions(month, year), getPendingRecurring(month, year)]);
        setTransactions(txRows); setPendingRecurring(pending.pending);
      }
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Could not apply recurring transactions.');
    } finally { setApplying(false); }
  };

  const categories = ['All', ...Array.from(new Set(transactions.map(transaction => transaction.category))).sort((a, b) => a.localeCompare(b))];
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedCategory = categoryFilter.toLowerCase();
  const filtered = transactions.filter(transaction => {
    const matchesCategory = normalizedCategory === 'all' || transaction.category.toLowerCase() === normalizedCategory;
    if (!matchesCategory) return false;
    if (!normalizedQuery) return true;
    const recurringTerms = transaction.is_recurring ? ['recurring', 'repeat', 'repeats'] : [];
    return [transaction.location, transaction.category, transaction.subcategory, transaction.paid_by, transaction.notes, ...recurringTerms].some(value => value?.toLowerCase().includes(normalizedQuery));
  });
  const filteredTotal = filtered.reduce((sum, transaction) => sum + transaction.amount, 0);
  const total = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const monthlyIncome = contribution?.household_income ?? 0;
  const graphSpent = categoryFilter === 'All' ? total : filteredTotal;
  const incomeRemaining = monthlyIncome - graphSpent;
  const categoryBudget = categoryFilter === 'All'
    ? null
    : budgetLines
      .filter(line => line.category.toLowerCase() === normalizedCategory)
      .reduce((sum, line) => sum + line.projected_amount, 0);
  const categoryBudgetVariance = categoryBudget === null ? null : categoryBudget - graphSpent;
  const isAllCategories = categoryFilter === 'All';
  const barTarget = isAllCategories ? monthlyIncome : (categoryBudget ?? 0);
  const barPct = barTarget > 0 ? Math.min(graphSpent / barTarget * 100, 100) : 0;
  const barOver = barTarget > 0 && graphSpent > barTarget;
  const showSummaryBar = isAllCategories ? monthlyIncome > 0 : true;

  return <Page>
    <PageHeading eyebrow="Ledger" title="Transactions" description="Search, review, and maintain the household spending record." action={<Pressable onPress={() => router.push('/add-transaction')} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Plus color={BudgetColors.surface} size={17} /><Text style={styles.primaryText}>Add transaction</Text></Pressable>} />
    {error && <ErrorNotice message={error} onRetry={load} />}
    {pendingRecurring > 0 && (
      <Pressable disabled={applying} onPress={applyRecurring} style={({ pressed }) => [styles.recurringBanner, applying && styles.disabled, pressed && styles.pressed]}>
        <Repeat color={BudgetColors.green} size={17} />
        <Text style={styles.recurringBannerText}>
          {applying ? 'Applying…' : `Apply ${pendingRecurring} recurring transaction${pendingRecurring === 1 ? '' : 's'} for this month`}
        </Text>
        {applying && <ActivityIndicator color={BudgetColors.green} size="small" />}
      </Pressable>
    )}
    <View style={styles.controls}>
      <MonthSwitcher month={month} year={year} onPrevious={() => changeMonth(-1)} onNext={() => changeMonth(1)} />
      <View style={styles.searchWrap}><Search color={BudgetColors.muted} size={17} /><TextInput value={query} onChangeText={setQuery} placeholder="Search transactions or type recurring" placeholderTextColor={BudgetColors.faint} style={styles.searchInput} /></View>
      <View style={styles.filterRow}>
        {categories.map(category => (
          <Pressable
            key={category}
            onPress={() => setCategoryFilter(category)}
            style={({ pressed }) => [styles.filterButton, categoryFilter === category && styles.filterButtonActive, pressed && styles.pressed]}>
            <Text style={[styles.filterButtonText, categoryFilter === category && styles.filterButtonTextActive]}>{category}</Text>
          </Pressable>
        ))}
      </View>
    </View>
    {showSummaryBar && (
      <View style={styles.incomeBarPanel}>
        <View style={styles.incomeBarHeader}>
          <Text style={styles.incomeBarTitle}>{isAllCategories ? 'Monthly income' : `${categoryFilter} budget`}</Text>
          <Text style={styles.incomeBarTotal}>{formatCurrency(barTarget, 2)}</Text>
        </View>
        <View style={styles.incomeTrack}>
          <AnimatedHorizontalBar percent={barPct} style={[styles.incomeFill, barOver && styles.incomeFillOver]} />
        </View>
        <View style={styles.incomeBarFooter}>
          <Text style={styles.incomeSpent}>
            {categoryFilter === 'All'
              ? `${formatCurrency(graphSpent, 2)} spent`
              : `${formatCurrency(graphSpent, 2)} ${categoryFilter} spent`}
          </Text>
          {isAllCategories ? (
            <Text style={[styles.incomeLeft, incomeRemaining < 0 && styles.incomeOver]}>
              {incomeRemaining >= 0
                ? `${formatCurrency(incomeRemaining, 2)} remaining`
                : `${formatCurrency(Math.abs(incomeRemaining), 2)} over income`}
            </Text>
          ) : (
            <Text style={[styles.incomeLeft, categoryBudgetVariance !== null && categoryBudgetVariance < 0 && styles.incomeOver]}>
              {categoryBudget === null
                ? 'No budget set'
                : categoryBudgetVariance !== null && categoryBudgetVariance >= 0
                  ? `${formatCurrency(categoryBudgetVariance, 2)} under ${formatCurrency(categoryBudget, 2)} budget`
                  : `${formatCurrency(Math.abs(categoryBudgetVariance || 0), 2)} over ${formatCurrency(categoryBudget, 2)} budget`}
            </Text>
          )}
        </View>
      </View>
    )}
    <Panel>
      <SectionHeader title="Monthly ledger" detail={(query || categoryFilter !== 'All') ? `${filtered.length} matching result${filtered.length === 1 ? '' : 's'}` : 'Newest transactions first'} />
      <View style={styles.totalsRow}>
        <Text style={styles.totalsLabel}>Visible total</Text>
        <Text style={styles.totalsValue}>{formatCurrency(filteredTotal, 2)}</Text>
        {(query || categoryFilter !== 'All') && <Text style={styles.totalsContext}>of {formatCurrency(total, 2)} this month</Text>}
      </View>
      {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View> : filtered.length === 0 ? <EmptyState title={query ? 'Nothing matches' : 'No transactions yet'} detail={query ? 'Try a category, person, or location.' : 'Record the first expense for this month.'} /> : filtered.map((transaction, index) => <View key={transaction.transaction_id} style={[styles.row, compact && styles.rowCompact, index === 0 && styles.rowFirst]}>
        <Pressable style={({ pressed }) => [styles.rowContent, pressed && styles.pressed]} onPress={() => router.push({ pathname: '/add-transaction', params: { transactionId: String(transaction.transaction_id) } })}>
          <View style={styles.glyph}><ReceiptText color={BudgetColors.green} size={18} /></View>
          <View style={styles.main}>
          <View style={styles.titleRow}><Text style={styles.name} numberOfLines={1}>{transaction.location || transaction.subcategory}</Text><View style={styles.categoryChip}><Text style={styles.categoryText}>{transaction.category}</Text></View></View>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{transaction.subcategory} · {new Date(transaction.transaction_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
            {transaction.is_recurring && (
              <View style={styles.recurringBadge}>
                <Repeat color={BudgetColors.blue} size={12} />
                <Text style={styles.recurringBadgeText}>Recurring</Text>
              </View>
            )}
          </View>
          <View style={styles.details}>
            {transaction.location && <View style={styles.detail}><MapPin color={BudgetColors.faint} size={12} /><Text style={styles.detailText}>{transaction.location}</Text></View>}
            {transaction.paid_by && <View style={styles.detail}><UserRound color={BudgetColors.faint} size={12} /><Text style={styles.detailText}>{transaction.paid_by}</Text></View>}
          </View>
          {transaction.notes && <Text style={styles.note} numberOfLines={2}>{transaction.notes}</Text>}
          </View>
        </Pressable>
        <View style={styles.amountColumn}>
          <Text style={styles.amount}>{formatCurrency(transaction.amount, 2)}</Text>
          <View style={styles.rowActions}>
            <Pressable accessibilityLabel={`Edit ${transaction.location || transaction.subcategory}`} onPress={() => router.push({ pathname: '/add-transaction', params: { transactionId: String(transaction.transaction_id) } })} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}><Pencil color={BudgetColors.blue} size={16} /></Pressable>
            <Pressable accessibilityLabel={`Delete ${transaction.location || transaction.subcategory}`} disabled={deletingId === transaction.transaction_id} onPress={() => remove(transaction)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>{deletingId === transaction.transaction_id ? <ActivityIndicator color={BudgetColors.coral} size="small" /> : <Trash2 color={BudgetColors.coral} size={16} />}</Pressable>
          </View>
        </View>
      </View>)}
    </Panel>
  </Page>;
}

function confirmRemoval(transaction: Transaction) {
  const name = transaction.location || transaction.subcategory;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return Promise.resolve(window.confirm(`Delete ${name} for ${formatCurrency(transaction.amount, 2)}?`));
  return new Promise<boolean>(resolve => Alert.alert('Delete transaction?', `${name} · ${formatCurrency(transaction.amount, 2)}`, [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Delete', style: 'destructive', onPress: () => resolve(true) }], { cancelable: true, onDismiss: () => resolve(false) }));
}

const styles = StyleSheet.create({
  primaryButton: { height: 42, paddingHorizontal: 15, borderRadius: 8, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', gap: 7 },
  primaryText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' }, pressed: { opacity: 0.68 }, disabled: { opacity: 0.6 },
  recurringBanner: { minHeight: 46, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: BudgetColors.green, backgroundColor: BudgetColors.greenSoft, flexDirection: 'row', alignItems: 'center', gap: 10 },
  recurringBannerText: { flex: 1, color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  controls: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  searchWrap: { height: 42, minWidth: 240, flex: 1, maxWidth: 390, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 8, backgroundColor: BudgetColors.surface },
  searchInput: { flex: 1, height: 40, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13 },
  filterRow: { width: '100%', flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterButton: { minHeight: 34, paddingHorizontal: 11, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.surface, alignItems: 'center', justifyContent: 'center' },
  filterButtonActive: { borderColor: BudgetColors.green, backgroundColor: BudgetColors.greenSoft },
  filterButtonText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  filterButtonTextActive: { color: BudgetColors.green },
  incomeBarPanel: { padding: 20, borderRadius: 8, backgroundColor: BudgetColors.surface, borderWidth: 1, borderColor: BudgetColors.line },
  incomeBarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  incomeBarTitle: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  incomeBarTotal: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  incomeTrack: { height: 16, borderRadius: 8, backgroundColor: BudgetColors.canvas, overflow: 'hidden', marginBottom: 10 },
  incomeFill: { height: 16, borderRadius: 8, backgroundColor: BudgetColors.green },
  incomeFillOver: { backgroundColor: BudgetColors.coral },
  incomeBarFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  incomeSpent: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  incomeLeft: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  incomeOver: { color: BudgetColors.coral },
  totalsRow: { minHeight: 44, paddingVertical: 8, borderTopWidth: 1, borderTopColor: BudgetColors.line, flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  totalsLabel: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  totalsValue: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 16, fontWeight: '800' },
  totalsContext: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 11 },
  loader: { minHeight: 280, alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 104, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 16, borderTopWidth: 1, borderTopColor: BudgetColors.line }, rowFirst: { borderTopWidth: 0 }, rowCompact: { minHeight: 120 },
  rowContent: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  glyph: { width: 38, height: 38, borderRadius: 7, backgroundColor: BudgetColors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minWidth: 0, gap: 4 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' },
  categoryChip: { backgroundColor: BudgetColors.blueSoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 }, categoryText: { color: BudgetColors.blue, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '800' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  meta: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 }, details: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' }, detail: { flexDirection: 'row', alignItems: 'center', gap: 4 }, detailText: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 10 },
  recurringBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: BudgetColors.infoLine, backgroundColor: BudgetColors.blueSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  recurringBadgeText: { color: BudgetColors.blue, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  note: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, marginTop: 2 },
  amountColumn: { alignItems: 'flex-end', gap: 12 }, amount: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  editButton: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center' },
  deleteButton: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center' },
});