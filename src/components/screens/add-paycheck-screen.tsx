import { ArrowDownToLine, CircleDollarSign, Plus, Save, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { EmptyState, ErrorNotice, formatCurrency, MonthSwitcher, moveMonth, Page, PageHeading, Panel, SectionHeader } from '@/components/budget-ui';
import { DateInput } from '@/components/date-input';
import { addExtraIncome, addJointPayment, ContributionSummary, deleteExtraIncome, deleteJointPayment, ExtraIncome, getContributionSummary, getExtraIncome, getIncomeConfig, getIncomeSummary, getJointPayments, IncomeConfig, IncomeMonthSummary, JointPayment, saveIncomeConfig } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

export default function AddPaycheckScreen() {
  const now = new Date();
  const { width } = useWindowDimensions();
  const compact = width < 620;
  const narrow = width < 430;
  const [configs, setConfigs] = useState<IncomeConfig[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [anchorDrafts, setAnchorDrafts] = useState<Record<number, string>>({});
  const [configLoading, setConfigLoading] = useState(true);
  const [incomeSummary, setIncomeSummary] = useState<IncomeMonthSummary[]>([]);
  const [incomeSummaryLoading, setIncomeSummaryLoading] = useState(true);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});

  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [contribution, setContribution] = useState<ContributionSummary | null>(null);
  const [payments, setPayments] = useState<JointPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(defaultDate(now.getMonth() + 1, now.getFullYear()));
  const [addingPayment, setAddingPayment] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);
  const [extras, setExtras] = useState<ExtraIncome[]>([]);
  const [extrasLoading, setExtrasLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState<number | null>(null);
  const [extraAmount, setExtraAmount] = useState('');
  const [extraDesc, setExtraDesc] = useState('');
  const [addingExtra, setAddingExtra] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPaymentDate(defaultDate(month, year));
    setConfigLoading(true);
    setIncomeSummaryLoading(true);
    setExtrasLoading(true);
    setPaymentsLoading(true);
    Promise.all([
      getIncomeConfig(month, year),
      getExtraIncome(month, year),
      getJointPayments(month, year),
      getContributionSummary(month, year),
      getIncomeSummary(year),
    ])
      .then(([configRows, extraRows, paymentRows, contributionSummary, summaryRows]) => {
        setConfigs(configRows);
        setDrafts(Object.fromEntries(configRows.map(row => [row.person_id, String(row.biweekly_amount || '')])));
        setAnchorDrafts(Object.fromEntries(configRows.map(row => [row.person_id, row.payday_anchor || ''])));
        setSelectedPerson(current => configRows.some(row => row.person_id === current) ? current : configRows[0]?.person_id ?? null);
        setExtras(extraRows);
        setPayments(paymentRows);
        setContribution(contributionSummary);
        setIncomeSummary(summaryRows);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load monthly income and payment details.'))
      .finally(() => {
        setConfigLoading(false);
        setIncomeSummaryLoading(false);
        setExtrasLoading(false);
        setPaymentsLoading(false);
      });
  }, [month, year]);

  const changeMonth = (offset: number) => {
    const next = moveMonth(month, year, offset);
    setMonth(next.month);
    setYear(next.year);
  };

  const saveConfig = async (personId: number) => {
    const amount = Number(drafts[personId]);
    const paydayAnchor = anchorDrafts[personId]?.trim() || null;
    if (!Number.isFinite(amount) || amount < 0 || (paydayAnchor !== null && !isValidDate(paydayAnchor))) {
      setError('Enter a non-negative income and a valid payday anchor in YYYY-MM-DD format.');
      return;
    }
    setSaving(current => ({ ...current, [personId]: true }));
    setSaved(current => ({ ...current, [personId]: false }));
    setError(null);
    try {
      await saveIncomeConfig(personId, month, year, amount, paydayAnchor);
      setConfigs(current => current.map(c => c.person_id === personId ? { ...c, biweekly_amount: amount, payday_anchor: paydayAnchor, source_month: month, source_year: year } : c));
      const [contributionSummary, summaryRows] = await Promise.all([
        getContributionSummary(month, year),
        getIncomeSummary(year),
      ]);
      setContribution(contributionSummary);
      setIncomeSummary(summaryRows);
      setSaved(current => ({ ...current, [personId]: true }));
      setTimeout(() => setSaved(current => ({ ...current, [personId]: false })), 2500);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save income.');
    } finally {
      setSaving(current => ({ ...current, [personId]: false }));
    }
  };

  const addPayment = async () => {
    const amount = Number(paymentAmount);
    if (!selectedPerson || !Number.isFinite(amount) || amount <= 0 || !isValidDate(paymentDate)) {
      setError('Choose a person and enter a positive amount and valid payment date.');
      return;
    }
    setAddingPayment(true);
    setError(null);
    try {
      await addJointPayment({ person_id: selectedPerson, payment_date: paymentDate, amount });
      const [paymentRows, contributionSummary] = await Promise.all([
        getJointPayments(month, year),
        getContributionSummary(month, year),
      ]);
      setPayments(paymentRows);
      setContribution(contributionSummary);
      setPaymentAmount('');
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Could not add the joint payment.');
    } finally {
      setAddingPayment(false);
    }
  };

  const removePayment = async (jointPaymentId: number) => {
    setDeletingPaymentId(jointPaymentId);
    setError(null);
    try {
      await deleteJointPayment(jointPaymentId);
      const contributionSummary = await getContributionSummary(month, year);
      setPayments(current => current.filter(payment => payment.joint_payment_id !== jointPaymentId));
      setContribution(contributionSummary);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not remove the joint payment.');
    } finally {
      setDeletingPaymentId(null);
    }
  };

  const useRemainingBalance = () => {
    const balance = contribution?.people.find(person => person.person_id === selectedPerson)?.remaining_due || 0;
    setPaymentAmount(balance > 0 ? balance.toFixed(2) : '');
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
      const [rows, contributionSummary, summaryRows] = await Promise.all([
        getExtraIncome(month, year),
        getContributionSummary(month, year),
        getIncomeSummary(year),
      ]);
      setExtras(rows);
      setContribution(contributionSummary);
      setIncomeSummary(summaryRows);
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
      const [contributionSummary, summaryRows] = await Promise.all([
        getContributionSummary(month, year),
        getIncomeSummary(year),
      ]);
      setExtras(current => current.filter(e => e.extra_income_id !== id));
      setContribution(contributionSummary);
      setIncomeSummary(summaryRows);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not remove extra income.');
    } finally {
      setDeletingId(null);
    }
  };

  const totalMonthly = configs.reduce((sum, c) => sum + (c.biweekly_amount || 0) * 2, 0);
  const extrasTotal = extras.reduce((sum, e) => sum + e.amount, 0);
  const paymentsTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const monthLabel = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const incomeMax = Math.max(...incomeSummary.map(row => row.total_income), 1);

  return (
    <Page>
      <PageHeading
        eyebrow="Configuration"
        title="Income"
        description="Set regular bi-weekly pay, payday schedules, and payments to the joint account."
        action={<MonthSwitcher month={month} year={year} onPrevious={() => changeMonth(-1)} onNext={() => changeMonth(1)} />}
      />
      {error && <ErrorNotice message={error} onRetry={undefined} />}

      <Panel style={styles.monthlyIncomePanel}>
        <View style={styles.monthlyIncomeSummary}>
          <View style={styles.monthlyIncomeIcon}><CircleDollarSign color={BudgetColors.green} size={20} /></View>
          <View style={styles.monthlyIncomeCopy}>
            <Text style={styles.monthlyIncomeLabel}>Total monthly income</Text>
            <Text style={styles.monthlyIncomeDetail}>{monthLabel} · {formatCurrency(totalMonthly, 2)} regular + {formatCurrency(extrasTotal, 2)} extra</Text>
          </View>
          <Text style={[styles.monthlyIncomeAmount, narrow && styles.monthlyIncomeAmountNarrow]}>{formatCurrency(totalMonthly + extrasTotal, 2)}</Text>
        </View>
      </Panel>

      <Panel>
        <SectionHeader title="Bi-weekly pay" detail={totalMonthly > 0 ? `${monthLabel} - ${formatCurrency(totalMonthly, 2)} regular monthly income` : `${monthLabel} - enter regular bi-weekly pay below`} />
        {configLoading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} /></View> : configs.map((config, index) => (
          <View key={config.person_id} style={[styles.row, index === 0 && styles.rowFirst, compact && styles.configRowCompact]}>
            <View style={[styles.rowCopy, compact && styles.configRowCopyCompact]}>
              <Text style={styles.name}>{config.name}</Text>
              <Text style={styles.detail}>Monthly: {formatCurrency((Number(drafts[config.person_id]) || 0) * 2, 2)}</Text>
            </View>
            <View style={[styles.configFields, compact && styles.configFieldsCompact]}>
              <View style={[styles.configField, compact && styles.configFieldCompact]}>
                <Text style={styles.fieldLabel}>Pay per check</Text>
                <View style={[styles.inputWrap, compact && styles.configInputCompact]}>
                  <Text style={styles.dollar}>$</Text>
                  <TextInput value={drafts[config.person_id] ?? ''} onChangeText={value => { setDrafts(c => ({ ...c, [config.person_id]: value.replace(/[^0-9.]/g, '') })); setSaved(c => ({ ...c, [config.person_id]: false })); }} onSubmitEditing={() => saveConfig(config.person_id)} keyboardType="decimal-pad" selectTextOnFocus placeholder="0.00" placeholderTextColor={BudgetColors.faint} style={styles.input} />
                </View>
              </View>
              <View style={[styles.anchorField, compact && styles.anchorFieldCompact]}>
                <Text style={styles.fieldLabel}>Payday anchor</Text>
                <DateInput value={anchorDrafts[config.person_id] ?? ''} onChange={value => { setAnchorDrafts(current => ({ ...current, [config.person_id]: value })); setSaved(current => ({ ...current, [config.person_id]: false })); }} />
              </View>
            </View>
            <View style={[styles.configActions, compact && styles.configActionsCompact]}>
              {saved[config.person_id] && !saving[config.person_id] && <Text style={styles.savedLabel}>Saved</Text>}
              <Pressable accessibilityLabel={`Save ${config.name} income schedule`} disabled={saving[config.person_id]} onPress={() => saveConfig(config.person_id)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                {saving[config.person_id] ? <ActivityIndicator color={BudgetColors.green} size="small" /> : <Save color={BudgetColors.green} size={16} />}
              </Pressable>
            </View>
          </View>
        ))}
      </Panel>

      <Panel>
        <SectionHeader title={`${year} income by month`} detail="Extra income is included in totals but does not change joint-account shares." />
        {incomeSummaryLoading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} /></View> : (
          <View style={styles.incomeChart}>
            <View style={styles.incomeChartLegend}>
              <View style={styles.legendItem}><View style={[styles.legendSwatch, styles.incomeBarRegular]} /><Text style={styles.legendText}>Regular</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendSwatch, styles.incomeBarExtra]} /><Text style={styles.legendText}>Extra</Text></View>
            </View>
            {incomeSummary.map(row => (
              <View key={row.month} style={[styles.incomeMonthRow, row.month === month && styles.incomeMonthRowSelected]}>
                <View style={styles.incomeMonthCopy}>
                  <Text style={styles.incomeMonthName}>{MONTH_SHORT[row.month - 1]}</Text>
                </View>
                <View style={styles.incomeBarWrap}>
                  <View style={styles.incomeBarTrack}>
                    <View style={[styles.incomeBarRegular, { width: `${Math.max(row.regular_income / incomeMax * 100, 0)}%` }]} />
                    <View style={[styles.incomeBarExtra, { width: `${Math.max(row.extra_income / incomeMax * 100, 0)}%` }]} />
                  </View>
                  {compact && <Text style={styles.incomeMonthDetail}>Regular {formatCurrency(row.regular_income, 2)} · Extra {formatCurrency(row.extra_income, 2)}</Text>}
                </View>
                <View style={styles.incomeTotalWrap}>
                  <Text style={styles.incomeTotalAmount}>{formatCurrency(row.total_income, 2)}</Text>
                  {!compact && <Text style={styles.incomeMonthDetail}>Regular {formatCurrency(row.regular_income, 2)} · Extra {formatCurrency(row.extra_income, 2)}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}
      </Panel>

      <Panel>
        <SectionHeader
          title="Joint account payments"
          detail={`${formatCurrency(paymentsTotal, 2)} paid this month${contribution ? ` - balances as of ${formatShortDate(contribution.as_of_date)}` : ''}`}
        />
        {contribution && (
          <View style={styles.balanceGrid}>
            {contribution.people.map(person => (
              <View key={person.person_id} style={styles.balanceItem}>
                <View style={styles.balanceCopy}>
                  <Text style={styles.name}>{person.name}</Text>
                  <Text style={styles.detail}>
                    {person.installments_due} of {contribution.pay_periods} paydays reached
                    {person.next_pay_date ? ` - next ${formatShortDate(person.next_pay_date)}` : ''}
                  </Text>
                </View>
                <View style={styles.balanceAmountCopy}>
                  <Text style={styles.balanceAmount}>{formatCurrency(person.remaining_due, 2)}</Text>
                  <Text style={styles.balanceLabel}>owed now</Text>
                </View>
              </View>
            ))}
          </View>
        )}
        <View style={styles.paymentForm}>
          <View style={styles.choices}>
            {configs.map(config => (
              <Pressable key={config.person_id} onPress={() => setSelectedPerson(config.person_id)} style={({ pressed }) => [styles.choice, selectedPerson === config.person_id && styles.choiceSelected, pressed && styles.pressed]}>
                <Text style={[styles.choiceText, selectedPerson === config.person_id && styles.choiceTextSelected]}>{config.name}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.paymentFields}>
            <View style={styles.inputWrap}>
              <Text style={styles.dollar}>$</Text>
              <TextInput value={paymentAmount} onChangeText={value => setPaymentAmount(value.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={BudgetColors.faint} style={styles.input} />
            </View>
            <Pressable onPress={useRemainingBalance} style={({ pressed }) => [styles.balanceButton, pressed && styles.pressed]}>
              <ArrowDownToLine color={BudgetColors.green} size={15} />
              <Text style={styles.balanceButtonText}>Use balance</Text>
            </Pressable>
            <View style={styles.paymentDate}><DateInput value={paymentDate} onChange={setPaymentDate} /></View>
            <Pressable disabled={addingPayment || !paymentAmount.trim()} onPress={addPayment} style={({ pressed }) => [styles.addBtn, (addingPayment || !paymentAmount.trim()) && styles.disabled, pressed && styles.pressed]}>
              {addingPayment ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <Plus color={BudgetColors.surface} size={16} />}
              <Text style={styles.addBtnText}>Add payment</Text>
            </Pressable>
          </View>
        </View>
        {paymentsLoading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} /></View> : payments.length === 0 ? <EmptyState title="No joint payments this month" detail="Add a partial payment or clear the full balance above." /> : payments.map((payment, index) => (
          <View key={payment.joint_payment_id} style={[styles.extraRow, index === 0 && styles.rowFirst]}>
            <View style={styles.rowCopy}>
              <Text style={styles.name}>{payment.person_name}</Text>
              <Text style={styles.detail}>{formatShortDate(payment.payment_date)}</Text>
            </View>
            <Text style={styles.extraAmount}>{formatCurrency(payment.amount, 2)}</Text>
            <Pressable accessibilityLabel={`Delete ${payment.person_name} joint payment`} disabled={deletingPaymentId === payment.joint_payment_id} onPress={() => removePayment(payment.joint_payment_id)} style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}>
              {deletingPaymentId === payment.joint_payment_id ? <ActivityIndicator color={BudgetColors.coral} size="small" /> : <Trash2 color={BudgetColors.coral} size={16} />}
            </Pressable>
          </View>
        ))}
      </Panel>

      <Panel>
        <SectionHeader
          title="Extra income"
          detail={extrasTotal > 0 ? `${formatCurrency(extrasTotal, 2)} extra this month` : 'Bonus, freelance, or other one-time income'}
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
              <Text style={styles.name}>{extra.person_name} - {extra.description || 'Extra income'}</Text>
            </View>
            <Text style={styles.extraAmount}>{formatCurrency(extra.amount, 2)}</Text>
            <Pressable disabled={deletingId === extra.extra_income_id} onPress={() => removeExtra(extra.extra_income_id)} style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}>
              {deletingId === extra.extra_income_id ? <ActivityIndicator color={BudgetColors.coral} size="small" /> : <Trash2 color={BudgetColors.coral} size={16} />}
            </Pressable>
          </View>
        ))}
      </Panel>
    </Page>
  );
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = MONTH_NAMES.map(name => name.slice(0, 3));

function defaultDate(month: number, year: number) {
  const today = new Date();
  if (today.getFullYear() === year && today.getMonth() + 1 === month) {
    return `${year}-${String(month).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function formatShortDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  loader: { minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  monthlyIncomePanel: { backgroundColor: BudgetColors.greenSoft, borderColor: BudgetColors.successLine },
  monthlyIncomeSummary: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  monthlyIncomeIcon: { width: 40, height: 40, borderRadius: 7, backgroundColor: BudgetColors.surface, alignItems: 'center', justifyContent: 'center' },
  monthlyIncomeCopy: { flex: 1, minWidth: 190, gap: 3 },
  monthlyIncomeLabel: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  monthlyIncomeDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  monthlyIncomeAmount: { color: BudgetColors.ink, fontFamily: Fonts.serif, fontSize: 26, fontWeight: '700' },
  monthlyIncomeAmountNarrow: { width: '100%', marginTop: 4, paddingLeft: 52, textAlign: 'left' },
  row: { minHeight: 82, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: BudgetColors.line, flexWrap: 'wrap' },
  rowFirst: { borderTopWidth: 0 },
  rowCopy: { flex: 1, gap: 3 },
  configRowCompact: { flexDirection: 'column', alignItems: 'stretch' },
  configRowCopyCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: '100%' },
  name: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  detail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  configFields: { flex: 2, minWidth: 300, flexDirection: 'row', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' },
  configFieldsCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minWidth: 0, width: '100%', flexDirection: 'column', alignItems: 'stretch' },
  configField: { width: 148, gap: 5 },
  configFieldCompact: { width: '100%' },
  anchorField: { flex: 1, minWidth: 190, gap: 5 },
  anchorFieldCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minWidth: 0, width: '100%' },
  fieldLabel: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  inputWrap: { width: 148, height: 42, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 7, backgroundColor: BudgetColors.canvas, overflow: 'hidden' },
  configInputCompact: { width: '100%' },
  dollar: { color: BudgetColors.muted, paddingLeft: 10, fontFamily: Fonts.sans, fontSize: 13, flexShrink: 0 },
  input: { flex: 1, minWidth: 0, height: 40, paddingHorizontal: 7, textAlign: 'right', color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' },
  iconButton: { width: 38, height: 38, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: BudgetColors.greenSoft },
  configActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  configActionsCompact: { alignSelf: 'stretch', justifyContent: 'flex-end' },
  savedLabel: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  incomeChart: { borderTopWidth: 1, borderTopColor: BudgetColors.line, gap: 2 },
  incomeChartLegend: { marginTop: 8, flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '700' },
  incomeMonthRow: { minHeight: 64, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: BudgetColors.line },
  incomeMonthRowSelected: { backgroundColor: BudgetColors.greenSoft },
  incomeMonthCopy: { width: 38, alignItems: 'flex-start' },
  incomeMonthName: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  incomeBarWrap: { flex: 1, minWidth: 0, gap: 6 },
  incomeBarTrack: { height: 16, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, flexDirection: 'row' },
  incomeBarRegular: { height: '100%', backgroundColor: BudgetColors.green },
  incomeBarExtra: { height: '100%', backgroundColor: BudgetColors.blue },
  incomeTotalWrap: { width: 128, alignItems: 'flex-end', gap: 3 },
  incomeTotalAmount: { color: BudgetColors.ink, fontFamily: Fonts.serif, fontSize: 16, fontWeight: '700' },
  incomeMonthDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10 },
  choices: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  choice: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas },
  choiceSelected: { borderColor: BudgetColors.green, backgroundColor: BudgetColors.greenSoft },
  choiceText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  choiceTextSelected: { color: BudgetColors.green },
  extraForm: { marginBottom: 18 },
  extraFields: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  balanceGrid: { borderTopWidth: 1, borderTopColor: BudgetColors.line },
  balanceItem: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: BudgetColors.line },
  balanceCopy: { flex: 1, minWidth: 0, gap: 3 },
  balanceAmountCopy: { alignItems: 'flex-end', gap: 2 },
  balanceAmount: { color: BudgetColors.ink, fontFamily: Fonts.serif, fontSize: 20, fontWeight: '700' },
  balanceLabel: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  paymentForm: { marginVertical: 18 },
  paymentFields: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  paymentDate: { flex: 1, minWidth: 180 },
  balanceButton: { height: 42, paddingHorizontal: 11, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.successLine, backgroundColor: BudgetColors.greenSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  balanceButtonText: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  descInput: { flex: 1, minWidth: 160, height: 42, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, color: BudgetColors.ink, paddingHorizontal: 11, fontFamily: Fonts.sans, fontSize: 13 },
  addBtn: { height: 42, paddingHorizontal: 18, borderRadius: 7, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  addBtnText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  extraRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: BudgetColors.line },
  extraAmount: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  deleteBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.68 },
});
