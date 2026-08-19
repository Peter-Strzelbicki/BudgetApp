import { CalendarDays, ChevronDown, ChevronUp, Landmark, Pencil, Plus, Save, Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState, ErrorNotice, formatCurrency, Panel, SectionHeader, useConfirm } from '@/components/budget-ui';
import { DateInput } from '@/components/date-input';
import { InvestmentTrendChart, InvestmentTrendPoint, InvestmentTrendSeries } from '@/components/investment-trend-chart';
import {
    addInvestmentAccount,
    addInvestmentBalance,
    deleteInvestmentAccount,
    deleteInvestmentBalance,
    getInvestmentAccounts,
    getInvestmentBalances,
    InvestmentAccount,
    InvestmentBalance,
    updateInvestmentAccount,
} from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

const ACCOUNT_TYPES: { key: InvestmentAccount['account_type']; label: string }[] = [
  { key: 'TFSA', label: 'TFSA' },
  { key: 'RRSP', label: 'RRSP' },
  { key: 'DCPP', label: 'DCPP' },
  { key: 'OTHER', label: 'Other' },
];

/** Manually-tracked TFSA/RRSP balances at outside institutions (Wealthsimple, Quadrus, etc.), separate from the cash-flow savings calculation above. */
export function InvestmentAccountsPanel() {
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [accountType, setAccountType] = useState<InvestmentAccount['account_type']>('TFSA');
  const [addingAccount, setAddingAccount] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<number | null>(null);

  const [expandedAccountId, setExpandedAccountId] = useState<number | null>(null);
  const [historyByAccount, setHistoryByAccount] = useState<Record<number, InvestmentBalance[]>>({});
  const [updatingAccountId, setUpdatingAccountId] = useState<number | null>(null);
  const [balanceDate, setBalanceDate] = useState(todayIso());
  const [balanceAmount, setBalanceAmount] = useState('');
  const [savingBalance, setSavingBalance] = useState(false);
  const [deletingBalanceId, setDeletingBalanceId] = useState<number | null>(null);

  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editInstitution, setEditInstitution] = useState('');
  const [editType, setEditType] = useState<InvestmentAccount['account_type']>('TFSA');
  const [savingEdit, setSavingEdit] = useState(false);
  const [selectedTrendKey, setSelectedTrendKey] = useState('both');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const rows = await getInvestmentAccounts();
      setAccounts(rows);
      const histories = await Promise.all(rows.map(account => getInvestmentBalances(account.account_id)));
      setHistoryByAccount(Object.fromEntries(rows.map((account, index) => [account.account_id, histories[index]])));
    }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Investment accounts could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const createAccount = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setAddingAccount(true); setError(null);
    try {
      await addInvestmentAccount({ name: trimmedName, institution: institution.trim() || undefined, account_type: accountType });
      await load();
      setName(''); setInstitution('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'The account could not be added.');
    } finally { setAddingAccount(false); }
  };

  const removeAccount = async (account: InvestmentAccount) => {
    const confirmed = await confirm({
      title: 'Delete account?',
      message: `Delete "${account.name}" and its balance history? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingAccountId(account.account_id); setError(null);
    try {
      await deleteInvestmentAccount(account.account_id);
      setAccounts(current => current.filter(item => item.account_id !== account.account_id));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'The account could not be deleted.');
    } finally { setDeletingAccountId(null); }
  };

  const toggleHistory = (accountId: number) => {
    setExpandedAccountId(current => current === accountId ? null : accountId);
  };

  const openUpdate = (accountId: number) => {
    setUpdatingAccountId(current => current === accountId ? null : accountId);
    setBalanceDate(todayIso());
    setBalanceAmount('');
  };

  const openEdit = (account: InvestmentAccount) => {
    setEditingAccountId(current => current === account.account_id ? null : account.account_id);
    setEditName(account.name);
    setEditInstitution(account.institution ?? '');
    setEditType(account.account_type);
  };

  const saveEdit = async (accountId: number) => {
    const trimmedName = editName.trim();
    if (!trimmedName) { setError('An account name is required.'); return; }
    setSavingEdit(true); setError(null);
    try {
      const updated = await updateInvestmentAccount(accountId, { name: trimmedName, institution: editInstitution.trim() || undefined, account_type: editType });
      setAccounts(current => current.map(item => item.account_id === accountId ? { ...item, ...updated } : item));
      setEditingAccountId(null);
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : 'The account could not be updated.');
    } finally { setSavingEdit(false); }
  };

  const saveBalance = async (accountId: number) => {
    const parsed = Number(balanceAmount);
    if (!isValidIsoDate(balanceDate)) { setError('Enter a valid date in YYYY-MM-DD format.'); return; }
    if (!Number.isFinite(parsed) || parsed < 0) { setError('Enter a balance amount of zero or more.'); return; }
    setSavingBalance(true); setError(null);
    try {
      await addInvestmentBalance({ account_id: accountId, as_of_date: balanceDate, balance: parsed });
      const [rows, refreshedAccounts] = await Promise.all([getInvestmentBalances(accountId), getInvestmentAccounts()]);
      setHistoryByAccount(current => ({ ...current, [accountId]: rows }));
      setAccounts(refreshedAccounts);
      setUpdatingAccountId(null);
      setBalanceAmount('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The balance could not be saved.');
    } finally { setSavingBalance(false); }
  };

  const removeBalance = async (accountId: number, entry: InvestmentBalance) => {
    const confirmed = await confirm({
      title: 'Delete balance entry?',
      message: `Remove the ${formatCurrency(entry.balance)} entry from ${formatDate(entry.as_of_date)}?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingBalanceId(entry.balance_id); setError(null);
    try {
      await deleteInvestmentBalance(entry.balance_id);
      const [rows, refreshedAccounts] = await Promise.all([getInvestmentBalances(accountId), getInvestmentAccounts()]);
      setHistoryByAccount(current => ({ ...current, [accountId]: rows }));
      setAccounts(refreshedAccounts);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'The balance entry could not be deleted.');
    } finally { setDeletingBalanceId(null); }
  };

  const total = accounts.reduce((sum, account) => sum + (account.latest_balance ?? 0), 0);
  const trendPoints = useMemo(() => buildTrendPoints(accounts, historyByAccount), [accounts, historyByAccount]);
  const trendSeries = useMemo(() => buildTrendSeries(accounts), [accounts]);

  return (
    <Panel>
      <SectionHeader
        title="Investment accounts"
        detail={`${formatCurrency(total)} across ${accounts.length} account${accounts.length === 1 ? '' : 's'} \u00b7 TFSA/RRSP/DCPP balances you update manually`}
      />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {!loading && accounts.length > 0 && <InvestmentTrendChart points={trendPoints} series={trendSeries} selectedKey={selectedTrendKey} onSelect={setSelectedTrendKey} />}
      <View style={styles.composer}>
        <TextInput value={name} onChangeText={setName} placeholder="Account name, e.g. Wealthsimple TFSA" placeholderTextColor={BudgetColors.faint} style={styles.nameInput} />
        <TextInput value={institution} onChangeText={setInstitution} placeholder="Institution (optional)" placeholderTextColor={BudgetColors.faint} style={styles.institutionInput} />
        <View style={styles.typeChoices}>
          {ACCOUNT_TYPES.map(type => (
            <Pressable key={type.key} onPress={() => setAccountType(type.key)} style={({ pressed }) => [styles.typeChoice, accountType === type.key && styles.typeChoiceSelected, pressed && styles.pressed]}>
              <Text style={[styles.typeChoiceText, accountType === type.key && styles.typeChoiceTextSelected]}>{type.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable disabled={addingAccount || !name.trim()} onPress={createAccount} style={({ pressed }) => [styles.addButton, (!name.trim() || addingAccount) && styles.disabled, pressed && styles.pressed]}>
          {addingAccount ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <Plus color={BudgetColors.surface} size={16} />}
          <Text style={styles.addButtonText}>Add account</Text>
        </Pressable>
      </View>
      {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} /></View> : accounts.length === 0 ? (
        <EmptyState title="No investment accounts yet" detail="Add a TFSA or RRSP to start tracking its balance here." />
      ) : accounts.map((account, index) => (
        <View key={account.account_id} style={[styles.accountBlock, index === 0 && styles.accountBlockFirst]}>
          <View style={styles.accountRow}>
            <View style={styles.accountIcon}><Landmark color={BudgetColors.green} size={18} /></View>
            <View style={styles.accountCopy}>
              <Text style={styles.accountName}>{account.name}</Text>
              <Text style={styles.accountMeta}>
                {account.account_type}{account.institution ? ` \u00b7 ${account.institution}` : ''}
                {account.latest_as_of_date ? ` \u00b7 as of ${formatDate(account.latest_as_of_date)}` : ''}
              </Text>
            </View>
            <Text style={styles.accountBalance}>{account.latest_balance === null ? 'No balance yet' : formatCurrency(account.latest_balance)}</Text>
            <Pressable accessibilityLabel={`Update ${account.name} balance`} onPress={() => openUpdate(account.account_id)} style={({ pressed }) => [styles.iconButton, updatingAccountId === account.account_id && styles.iconButtonActive, pressed && styles.pressed]}>
              <Plus color={updatingAccountId === account.account_id ? BudgetColors.green : BudgetColors.ink} size={16} />
            </Pressable>
            <Pressable accessibilityLabel={`Edit ${account.name}`} onPress={() => openEdit(account)} style={({ pressed }) => [styles.iconButton, editingAccountId === account.account_id && styles.iconButtonActive, pressed && styles.pressed]}>
              <Pencil color={editingAccountId === account.account_id ? BudgetColors.green : BudgetColors.ink} size={16} />
            </Pressable>
            <Pressable accessibilityLabel={`${expandedAccountId === account.account_id ? 'Hide' : 'Show'} ${account.name} history`} onPress={() => toggleHistory(account.account_id)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              {expandedAccountId === account.account_id ? <ChevronUp color={BudgetColors.ink} size={16} /> : <ChevronDown color={BudgetColors.ink} size={16} />}
            </Pressable>
            <Pressable accessibilityLabel={`Delete ${account.name}`} disabled={deletingAccountId === account.account_id} onPress={() => removeAccount(account)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              {deletingAccountId === account.account_id ? <ActivityIndicator color={BudgetColors.coral} size="small" /> : <Trash2 color={BudgetColors.coral} size={16} />}
            </Pressable>
          </View>
          {editingAccountId === account.account_id && (
            <View style={styles.editRow}>
              <TextInput value={editName} onChangeText={setEditName} placeholder="Account name" placeholderTextColor={BudgetColors.faint} style={styles.editNameInput} />
              <TextInput value={editInstitution} onChangeText={setEditInstitution} placeholder="Institution (optional)" placeholderTextColor={BudgetColors.faint} style={styles.editInstitutionInput} />
              <View style={styles.typeChoices}>
                {ACCOUNT_TYPES.map(type => (
                  <Pressable key={type.key} onPress={() => setEditType(type.key)} style={({ pressed }) => [styles.typeChoice, editType === type.key && styles.typeChoiceSelected, pressed && styles.pressed]}>
                    <Text style={[styles.typeChoiceText, editType === type.key && styles.typeChoiceTextSelected]}>{type.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable disabled={savingEdit || !editName.trim()} onPress={() => saveEdit(account.account_id)} style={({ pressed }) => [styles.saveButton, (!editName.trim() || savingEdit) && styles.disabled, pressed && styles.pressed]}>
                {savingEdit ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <Save color={BudgetColors.surface} size={15} />}
              </Pressable>
              <Pressable onPress={() => setEditingAccountId(null)} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
                <X color={BudgetColors.muted} size={16} />
              </Pressable>
            </View>
          )}
          {updatingAccountId === account.account_id && (
            <View style={styles.updateRow}>
              <View style={styles.updateDate}><DateInput value={balanceDate} onChange={setBalanceDate} /></View>
              <View style={styles.amountInput}>
                <Text style={styles.dollar}>$</Text>
                <TextInput value={balanceAmount} onChangeText={value => setBalanceAmount(value.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={BudgetColors.faint} style={styles.amountInputField} />
              </View>
              <Pressable disabled={savingBalance || !balanceAmount.trim()} onPress={() => saveBalance(account.account_id)} style={({ pressed }) => [styles.saveButton, (!balanceAmount.trim() || savingBalance) && styles.disabled, pressed && styles.pressed]}>
                {savingBalance ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <Save color={BudgetColors.surface} size={15} />}
              </Pressable>
              <Pressable onPress={() => setUpdatingAccountId(null)} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
                <X color={BudgetColors.muted} size={16} />
              </Pressable>
            </View>
          )}
          {expandedAccountId === account.account_id && (
            <View style={styles.history}>
              {(historyByAccount[account.account_id]?.length ?? 0) === 0 ? (
                <Text style={styles.historyEmpty}>No balance entries recorded yet.</Text>
              ) : historyByAccount[account.account_id].map(entry => (
                <View key={entry.balance_id} style={styles.historyRow}>
                  <CalendarDays color={BudgetColors.faint} size={13} />
                  <Text style={styles.historyDate}>{formatDate(entry.as_of_date)}</Text>
                  <Text style={styles.historyAmount}>{formatCurrency(entry.balance)}</Text>
                  <Pressable accessibilityLabel={`Delete entry from ${formatDate(entry.as_of_date)}`} disabled={deletingBalanceId === entry.balance_id} onPress={() => removeBalance(account.account_id, entry)} style={({ pressed }) => [styles.historyDeleteButton, pressed && styles.pressed]}>
                    {deletingBalanceId === entry.balance_id ? <ActivityIndicator color={BudgetColors.coral} size="small" /> : <Trash2 color={BudgetColors.coral} size={14} />}
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </Panel>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildTrendSeries(accounts: InvestmentAccount[]): InvestmentTrendSeries[] {
  const accountColors = [BudgetColors.gold, BudgetColors.coral, BudgetColors.green, BudgetColors.blue];
  return [
    { key: 'tfsa', label: 'TFSA total', color: BudgetColors.green },
    { key: 'rrsp', label: 'RRSP/DCPP total', color: BudgetColors.blue },
    ...accounts.map((account, index) => ({
      key: `account-${account.account_id}`,
      label: account.name,
      color: accountColors[index % accountColors.length],
    })),
  ];
}

/** Forward-fills each account's latest known balance onto every date any account was updated. */
function buildTrendPoints(accounts: InvestmentAccount[], historyByAccount: Record<number, InvestmentBalance[]>): InvestmentTrendPoint[] {
  const sortedByAccount = new Map<number, InvestmentBalance[]>();
  const dateSet = new Set<string>();
  accounts.forEach(account => {
    const entries = [...(historyByAccount[account.account_id] ?? [])]
      .map(entry => ({ ...entry, as_of_date: entry.as_of_date.slice(0, 10) }))
      .sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
    sortedByAccount.set(account.account_id, entries);
    entries.forEach(entry => dateSet.add(entry.as_of_date));
  });

  const dates = Array.from(dateSet).sort();

  return dates.map(date => {
    let tfsa = 0;
    let rrsp = 0;
    const values: Record<string, number> = {};
    accounts.forEach(account => {
      const entries = sortedByAccount.get(account.account_id) ?? [];
      let latest: number | null = null;
      for (const entry of entries) {
        if (entry.as_of_date > date) break;
        latest = entry.balance;
      }
      if (latest === null) return;
      values[`account-${account.account_id}`] = latest;
      if (account.account_type === 'TFSA') tfsa += latest;
      else if (account.account_type === 'RRSP' || account.account_type === 'DCPP') rrsp += latest;
    });
    return { date, values: { ...values, tfsa, rrsp } };
  });
}

const styles = StyleSheet.create({
  loader: { minHeight: 100, alignItems: 'center', justifyContent: 'center' },
  composer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 6 },
  nameInput: { minWidth: 200, flex: 1.4, height: 42, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, paddingHorizontal: 12, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13 },
  institutionInput: { minWidth: 160, flex: 1, height: 42, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, paddingHorizontal: 12, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13 },
  typeChoices: { flexDirection: 'row', gap: 6 },
  typeChoice: { height: 42, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, alignItems: 'center', justifyContent: 'center' },
  typeChoiceSelected: { borderColor: BudgetColors.green, backgroundColor: BudgetColors.greenSoft },
  typeChoiceText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  typeChoiceTextSelected: { color: BudgetColors.green },
  addButton: { height: 42, paddingHorizontal: 14, borderRadius: 7, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  addButtonText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.5 }, pressed: { opacity: 0.7 },
  accountBlock: { paddingTop: 12, borderTopWidth: 1, borderTopColor: BudgetColors.line },
  accountBlockFirst: { borderTopWidth: 0 },
  accountRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  accountIcon: { width: 32, height: 32, borderRadius: 7, backgroundColor: BudgetColors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  accountCopy: { flex: 1, minWidth: 140, gap: 2 },
  accountName: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  accountMeta: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10 },
  accountBalance: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' },
  iconButton: { width: 34, height: 34, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.surface, alignItems: 'center', justifyContent: 'center' },
  iconButtonActive: { borderColor: BudgetColors.green, backgroundColor: BudgetColors.greenSoft },
  updateRow: { marginTop: 10, marginLeft: 42, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  updateDate: { minWidth: 160 },
  editRow: { marginTop: 10, marginLeft: 42, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  editNameInput: { minWidth: 180, flex: 1, height: 40, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, paddingHorizontal: 11, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12 },
  editInstitutionInput: { minWidth: 140, flex: 1, height: 40, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, paddingHorizontal: 11, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12 },
  amountInput: { minWidth: 130, height: 42, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, flexDirection: 'row', alignItems: 'center' },
  dollar: { color: BudgetColors.muted, paddingLeft: 11, fontFamily: Fonts.sans, fontSize: 13 },
  amountInputField: { flex: 1, minWidth: 0, height: 40, paddingHorizontal: 7, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
  saveButton: { width: 42, height: 42, borderRadius: 7, backgroundColor: BudgetColors.green, alignItems: 'center', justifyContent: 'center' },
  cancelButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  history: { marginTop: 10, marginLeft: 42, gap: 6, paddingBottom: 4 },
  historyEmpty: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 11 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyDate: { flex: 1, color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  historyAmount: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  historyDeleteButton: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
});
