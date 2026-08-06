import { Pencil, Plus, ReceiptText, Repeat, Save, Trash2, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { AnimatedIconButton, EmptyState, ErrorNotice, formatCurrency, Page, PageHeading, Panel, SectionHeader, useConfirm } from '@/components/budget-ui';
import {
    Category,
    createRecurringTransaction,
    deleteRecurringTransaction,
    getCategories,
    getPeople,
    getRecurringTransactions,
    getSubcategories,
    Person,
    RecurringTransaction,
    Subcategory,
    updateRecurringTransaction,
} from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

type FormState = {
  category_id: number | null;
  subcategory_id: number | null;
  amount: string;
  location: string;
  paid_by_person_id: number | null;
  day_of_month: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  category_id: null, subcategory_id: null, amount: '', location: '',
  paid_by_person_id: null, day_of_month: '1', notes: '',
};

export default function RecurringScreen() {
  const compact = useWindowDimensions().width < 720;
  const confirm = useConfirm();
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [r, c, p] = await Promise.all([getRecurringTransactions(), getCategories(), getPeople()]);
      setRecurring(r); setCategories(c); setPeople(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load recurring transactions.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!form.category_id) { setSubcategories([]); return; }
    getSubcategories(form.category_id).then(setSubcategories).catch(() => setSubcategories([]));
  }, [form.category_id]);

  const openAdd = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); setError(null); };

  const openEdit = (rt: RecurringTransaction) => {
    setForm({
      category_id: null, subcategory_id: rt.subcategory_id,
      amount: String(rt.amount), location: rt.location || '',
      paid_by_person_id: rt.paid_by_person_id, day_of_month: String(rt.day_of_month), notes: rt.notes || '',
    });
    setEditingId(rt.recurring_id); setShowForm(true); setError(null);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setError(null); };

  const save = async () => {
    const amount = Number(form.amount);
    if (!form.subcategory_id || !Number.isFinite(amount) || amount <= 0) {
      setError('Choose a subcategory and enter a positive amount.');
      return;
    }
    const day = Math.min(Math.max(Number.parseInt(form.day_of_month) || 1, 1), 31);
    setSaving(true); setError(null);
    try {
      const data = {
        subcategory_id: form.subcategory_id,
        amount,
        location: form.location.trim() || undefined,
        paid_by_person_id: form.paid_by_person_id || undefined,
        day_of_month: day,
        notes: form.notes.trim() || undefined,
      };
      if (editingId) {
        await updateRecurringTransaction(editingId, data);
      } else {
        await createRecurringTransaction(data);
      }
      await load();
      closeForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save recurring transaction.');
    } finally { setSaving(false); }
  };

  const remove = async (rt: RecurringTransaction) => {
    const name = rt.location || rt.subcategory;
    const confirmed = await confirm({
      title: 'Remove recurring?',
      message: `"${name}" · Previously applied transactions will not be affected.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingId(rt.recurring_id); setError(null);
    try {
      await deleteRecurringTransaction(rt.recurring_id);
      setRecurring(current => current.filter(r => r.recurring_id !== rt.recurring_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove recurring transaction.');
    } finally { setDeletingId(null); }
  };

  const groups = recurring.reduce<Record<string, RecurringTransaction[]>>((result, rt) => {
    (result[rt.category] ||= []).push(rt);
    return result;
  }, {});

  const ordinal = (n: number) => {
    const s = ['th','st','nd','rd']; const v = n % 100;
    return n + (s[(v-20)%10] || s[v] || s[0]);
  };

  return (
    <Page>
      <PageHeading
        eyebrow="Automation"
        title="Recurring transactions"
        description="Bills and regular expenses that repeat monthly. Apply them to any month from the Transactions screen."
        action={<Pressable onPress={openAdd} style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}>
          <Plus color={BudgetColors.surface} size={17} />
          <Text style={styles.addBtnText}>Add recurring</Text>
        </Pressable>}
      />
      {error && <ErrorNotice message={error} onRetry={load} />}

      {showForm && (
        <Panel>
          <SectionHeader title={editingId ? 'Edit recurring transaction' : 'New recurring transaction'} />
          {!editingId && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.chips}>
                {categories.map(c => (
                  <Pressable key={c.category_id} onPress={() => setForm(f => ({ ...f, category_id: c.category_id, subcategory_id: null }))} style={({ pressed }) => [styles.chip, form.category_id === c.category_id && styles.chipSelected, pressed && styles.pressed]}>
                    <Text style={[styles.chipText, form.category_id === c.category_id && styles.chipTextSelected]}>{c.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {!editingId && form.category_id && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Subcategory</Text>
              <View style={styles.chips}>
                {subcategories.map(sc => (
                  <Pressable key={sc.subcategory_id} onPress={() => setForm(f => ({ ...f, subcategory_id: sc.subcategory_id }))} style={({ pressed }) => [styles.chip, form.subcategory_id === sc.subcategory_id && styles.chipSelected, pressed && styles.pressed]}>
                    <Text style={[styles.chipText, form.subcategory_id === sc.subcategory_id && styles.chipTextSelected]}>{sc.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <View style={[styles.formRow, compact && styles.formCol]}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Amount *</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.dollar}>$</Text>
                <TextInput value={form.amount} onChangeText={v => setForm(f => ({ ...f, amount: v.replace(/[^0-9.]/g, '') }))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={BudgetColors.faint} style={styles.input} />
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Day of month</Text>
              <TextInput value={form.day_of_month} onChangeText={v => setForm(f => ({ ...f, day_of_month: v.replace(/[^0-9]/g, '') }))} keyboardType="number-pad" placeholder="1" placeholderTextColor={BudgetColors.faint} style={styles.smallInput} />
            </View>
          </View>
          <View style={[styles.formRow, compact && styles.formCol]}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Location / Payee</Text>
              <TextInput value={form.location} onChangeText={v => setForm(f => ({ ...f, location: v }))} placeholder="e.g. TD Bank, Intact Insurance" placeholderTextColor={BudgetColors.faint} maxLength={100} style={styles.textInput} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Paid by</Text>
              <View style={styles.chips}>
                {people.map(p => (
                  <Pressable key={p.person_id} onPress={() => setForm(f => ({ ...f, paid_by_person_id: f.paid_by_person_id === p.person_id ? null : p.person_id }))} style={({ pressed }) => [styles.chip, form.paid_by_person_id === p.person_id && styles.chipSelected, pressed && styles.pressed]}>
                    <Text style={[styles.chipText, form.paid_by_person_id === p.person_id && styles.chipTextSelected]}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
          <View style={styles.formActions}>
            <Pressable onPress={closeForm} style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}><X color={BudgetColors.muted} size={16} /><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
            <Pressable disabled={saving} onPress={save} style={({ pressed }) => [styles.saveBtn, saving && styles.disabled, pressed && styles.pressed]}>
              {saving ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <Save color={BudgetColors.surface} size={16} />}
              <Text style={styles.saveBtnText}>{saving ? 'Saving' : editingId ? 'Update' : 'Add'}</Text>
            </Pressable>
          </View>
        </Panel>
      )}

      {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View>
        : recurring.length === 0 && !showForm ? <Panel><EmptyState title="No recurring transactions" detail="Add bills and regular expenses here. Apply them to any month from the Transactions screen." /></Panel>
        : Object.entries(groups).map(([category, items]) => (
          <Panel key={category}>
            <SectionHeader title={category} detail={`${items.length} recurring · ${formatCurrency(items.reduce((sum, rt) => sum + rt.amount, 0))} / month`} />
            {items.map((rt, index) => (
              <View key={rt.recurring_id} style={[styles.row, index === 0 && styles.rowFirst]}>
                <View style={styles.rowIcon}><Repeat color={BudgetColors.green} size={18} /></View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowName}>{rt.location || rt.subcategory}</Text>
                  <Text style={styles.rowDetail}>{rt.subcategory} · {ordinal(rt.day_of_month)} of month{rt.paid_by ? ` · ${rt.paid_by}` : ''}</Text>
                </View>
                <Text style={styles.rowAmount}>{formatCurrency(rt.amount, 2)}</Text>
                <AnimatedIconButton onPress={() => openEdit(rt)} style={styles.iconBtn}><Pencil color={BudgetColors.blue} size={17} /></AnimatedIconButton>
                <AnimatedIconButton disabled={deletingId === rt.recurring_id} onPress={() => remove(rt)} style={styles.iconBtn}>
                  {deletingId === rt.recurring_id ? <ActivityIndicator color={BudgetColors.coral} size="small" /> : <Trash2 color={BudgetColors.coral} size={17} />}
                </AnimatedIconButton>
              </View>
            ))}
          </Panel>
        ))}

      <Panel style={styles.infoPanel}>
        <View style={styles.infoRow}><ReceiptText color={BudgetColors.muted} size={16} /><Text style={styles.infoText}>Recurring amounts only affect future applies. Transactions already applied to past months are never changed.</Text></View>
      </Panel>
    </Page>
  );
}

const styles = StyleSheet.create({
  addBtn: { minHeight: 42, paddingHorizontal: 14, borderRadius: 8, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', gap: 8 },
  addBtnText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  loader: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  formGroup: { flex: 1, gap: 7, minWidth: 220 },
  formRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  formCol: { flexDirection: 'column' },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  label: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas },
  chipSelected: { borderColor: BudgetColors.green, backgroundColor: BudgetColors.greenSoft },
  chipText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  chipTextSelected: { color: BudgetColors.green },
  inputWrap: { height: 42, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 7, backgroundColor: BudgetColors.canvas, overflow: 'hidden' },
  dollar: { color: BudgetColors.muted, paddingLeft: 10, fontFamily: Fonts.sans, fontSize: 13 },
  input: { flex: 1, minWidth: 0, height: 40, paddingHorizontal: 7, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800', textAlign: 'right' },
  smallInput: { height: 42, width: 90, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  textInput: { height: 42, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, color: BudgetColors.ink, paddingHorizontal: 12, fontFamily: Fonts.sans, fontSize: 13 },
  cancelBtn: { height: 40, paddingHorizontal: 13, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cancelBtnText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  saveBtn: { height: 40, paddingHorizontal: 14, borderRadius: 7, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', gap: 7 },
  saveBtnText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  row: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: BudgetColors.line },
  rowFirst: { borderTopWidth: 0 },
  rowIcon: { width: 36, height: 36, borderRadius: 7, backgroundColor: BudgetColors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  rowName: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  rowDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10 },
  rowAmount: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  infoPanel: { flexDirection: 'row', gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  infoText: { flex: 1, color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 17 },
});
