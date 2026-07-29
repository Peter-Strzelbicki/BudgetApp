import { useFocusEffect, router } from 'expo-router';
import { MapPin, Plus, ReceiptText, Search, Trash2, UserRound } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { EmptyState, ErrorNotice, formatCurrency, MonthSwitcher, moveMonth, Page, PageHeading, Panel, SectionHeader, StatCard } from '@/components/budget-ui';
import { deleteTransaction, getTransactions, Transaction } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

export default function TransactionsScreen() {
  const now = new Date();
  const compact = useWindowDimensions().width < 720;
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { setTransactions(await getTransactions(month, year)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Transactions could not be loaded.'); }
    finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, [month, year]));

  const changeMonth = (offset: number) => {
    const next = moveMonth(month, year, offset);
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

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = transactions.filter(transaction => !normalizedQuery || [transaction.location, transaction.category, transaction.subcategory, transaction.paid_by, transaction.notes].some(value => value?.toLowerCase().includes(normalizedQuery)));
  const total = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const largest = transactions.reduce((maximum, transaction) => Math.max(maximum, transaction.amount), 0);

  return <Page>
    <PageHeading eyebrow="Ledger" title="Transactions" description="Search, review, and maintain the household spending record." action={<Pressable onPress={() => router.push('/add-transaction')} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Plus color={BudgetColors.surface} size={17} /><Text style={styles.primaryText}>Add transaction</Text></Pressable>} />
    {error && <ErrorNotice message={error} onRetry={load} />}
    <View style={styles.controls}>
      <MonthSwitcher month={month} year={year} onPrevious={() => changeMonth(-1)} onNext={() => changeMonth(1)} />
      <View style={styles.searchWrap}><Search color={BudgetColors.muted} size={17} /><TextInput value={query} onChangeText={setQuery} placeholder="Search transactions" placeholderTextColor={BudgetColors.faint} style={styles.searchInput} /></View>
    </View>
    <View style={styles.stats}>
      <StatCard label="Total spending" value={formatCurrency(total)} detail={`${transactions.length} transaction${transactions.length === 1 ? '' : 's'}`} />
      <StatCard label="Average transaction" value={formatCurrency(transactions.length ? total / transactions.length : 0)} detail="Across this month" accent={BudgetColors.blue} />
      <StatCard label="Largest expense" value={formatCurrency(largest)} detail="Single recorded transaction" accent={BudgetColors.gold} />
    </View>
    <Panel>
      <SectionHeader title="Monthly ledger" detail={query ? `${filtered.length} matching result${filtered.length === 1 ? '' : 's'}` : 'Newest transactions first'} />
      {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View> : filtered.length === 0 ? <EmptyState title={query ? 'Nothing matches' : 'No transactions yet'} detail={query ? 'Try a category, person, or location.' : 'Record the first expense for this month.'} /> : filtered.map((transaction, index) => <View key={transaction.transaction_id} style={[styles.row, compact && styles.rowCompact, index === 0 && styles.rowFirst]}>
        <View style={styles.glyph}><ReceiptText color={BudgetColors.green} size={18} /></View>
        <View style={styles.main}>
          <View style={styles.titleRow}><Text style={styles.name} numberOfLines={1}>{transaction.location || transaction.subcategory}</Text><View style={styles.categoryChip}><Text style={styles.categoryText}>{transaction.category}</Text></View></View>
          <Text style={styles.meta}>{transaction.subcategory} · {new Date(transaction.transaction_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
          <View style={styles.details}>
            {transaction.location && <View style={styles.detail}><MapPin color={BudgetColors.faint} size={12} /><Text style={styles.detailText}>{transaction.location}</Text></View>}
            {transaction.paid_by && <View style={styles.detail}><UserRound color={BudgetColors.faint} size={12} /><Text style={styles.detailText}>{transaction.paid_by}</Text></View>}
          </View>
          {transaction.notes && <Text style={styles.note} numberOfLines={2}>{transaction.notes}</Text>}
        </View>
        <View style={styles.amountColumn}><Text style={styles.amount}>{formatCurrency(transaction.amount, 2)}</Text><Pressable accessibilityLabel={`Delete ${transaction.location || transaction.subcategory}`} disabled={deletingId === transaction.transaction_id} onPress={() => remove(transaction)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>{deletingId === transaction.transaction_id ? <ActivityIndicator color={BudgetColors.coral} size="small" /> : <Trash2 color={BudgetColors.coral} size={16} />}</Pressable></View>
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
  primaryText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' }, pressed: { opacity: 0.68 },
  controls: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  searchWrap: { height: 42, minWidth: 240, flex: 1, maxWidth: 390, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 8, backgroundColor: BudgetColors.surface },
  searchInput: { flex: 1, height: 40, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, loader: { minHeight: 280, alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 104, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 16, borderTopWidth: 1, borderTopColor: BudgetColors.line }, rowFirst: { borderTopWidth: 0 }, rowCompact: { minHeight: 120 },
  glyph: { width: 38, height: 38, borderRadius: 7, backgroundColor: BudgetColors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minWidth: 0, gap: 4 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' },
  categoryChip: { backgroundColor: BudgetColors.blueSoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 }, categoryText: { color: BudgetColors.blue, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '800' },
  meta: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 }, details: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' }, detail: { flexDirection: 'row', alignItems: 'center', gap: 4 }, detailText: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 10 },
  note: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, marginTop: 2 },
  amountColumn: { alignItems: 'flex-end', gap: 12 }, amount: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' }, deleteButton: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center' },
});