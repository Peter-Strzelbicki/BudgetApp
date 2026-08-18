import { AnimatedIconButton } from '@/components/budget-ui';
import { router } from 'expo-router';
import { AlertTriangle, Copy, LayoutTemplate, Pencil, Plus, Save, Trash2, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { AnimatedHorizontalBar } from '@/components/animated-bar';
import { EmptyState, ErrorNotice, formatCurrency, MonthSwitcher, moveMonth, Page, PageHeading, Panel, SectionHeader, StatCard, StickyControlRow, useConfirm } from '@/components/budget-ui';
import { ContributionPanel } from '@/components/contribution-panel';
import { BudgetLine, BudgetTemplate, Category, ContributionSummary, createSubcategory, deleteBudgetTemplate, deleteSubcategory, getBudgetLines, getBudgetTemplate, getBudgetTemplates, getBudgetTotal, getCategories, getContributionSummary, saveBudgetLine, saveBudgetTemplate, saveBudgetTotal } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';
import { TRACKING_START_MONTH, TRACKING_START_YEAR } from '@/constants/tracking-period';

export default function BudgetScreen() {
  const now = new Date();
  const width = useWindowDimensions().width;
  const compact = width < 700;
  const confirm = useConfirm();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [contribution, setContribution] = useState<ContributionSummary | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [managing, setManaging] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [newLineName, setNewLineName] = useState('');
  const [addingBusy, setAddingBusy] = useState(false);
  const newLineRef = useRef<TextInput>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [totalBudget, setTotalBudget] = useState<number | null>(null);
  const [totalBudgetDraft, setTotalBudgetDraft] = useState('');
  const [savingTotalBudget, setSavingTotalBudget] = useState(false);
  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<number | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const [rows, contributionRows, categoryRows, cap] = await Promise.all([
        getBudgetLines(month, year),
        getContributionSummary(month, year),
        getCategories(),
        getBudgetTotal(month, year),
      ]);
      setLines(rows);
      setContribution(contributionRows);
      setCategories(categoryRows);
      setDrafts(Object.fromEntries(rows.map(line => [line.subcategory_id, String(line.projected_amount)])));
      setTotalBudget(cap);
      setTotalBudgetDraft(cap === null ? '' : String(cap));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The budget could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month, year]);

  const loadTemplates = async () => {
    try { setTemplates(await getBudgetTemplates()); }
    catch (templateError) { setError(templateError instanceof Error ? templateError.message : 'Templates could not be loaded.'); }
  };

  useEffect(() => { loadTemplates(); }, []);

  const changeMonth = (offset: number) => {
    const next = moveMonth(month, year, offset);
    const now = new Date();
    const maxAllowed = moveMonth(now.getMonth() + 1, now.getFullYear(), 1);
    const afterAllowedMonth = next.year > maxAllowed.year || (next.year === maxAllowed.year && next.month > maxAllowed.month);
    const beforeTrackingStart = next.year < TRACKING_START_YEAR || (next.year === TRACKING_START_YEAR && next.month < TRACKING_START_MONTH);
    if (afterAllowedMonth || beforeTrackingStart) return;
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

  const toggleManage = () => {
    setManaging(current => !current);
    setAddingTo(null);
    setNewLineName('');
    setError(null);
  };

  const startAdd = (categoryId: number) => {
    setAddingTo(categoryId);
    setNewLineName('');
    setTimeout(() => newLineRef.current?.focus(), 80);
  };

  const confirmAdd = async () => {
    const name = newLineName.trim();
    if (!name || addingTo === null) return;
    setAddingBusy(true);
    setError(null);
    try {
      await createSubcategory(addingTo, name);
      const [rows, categoryRows] = await Promise.all([getBudgetLines(month, year), getCategories()]);
      setLines(rows);
      setCategories(categoryRows);
      setDrafts(current => ({ ...current, ...Object.fromEntries(rows.filter(row => !(row.subcategory_id in current)).map(row => [row.subcategory_id, '0'])) }));
      setAddingTo(null);
      setNewLineName('');
      setNotice(`"${name}" added.`);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'The line could not be added.');
    } finally {
      setAddingBusy(false);
    }
  };

  const removeLine = async (line: BudgetLine) => {
    const confirmed = await confirm({
      title: 'Remove line?',
      message: `Remove "${line.subcategory}" from the budget? This cannot be undone if the line has no transactions.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingId(line.subcategory_id);
    setError(null);
    try {
      await deleteSubcategory(line.subcategory_id);
      setLines(current => current.filter(row => row.subcategory_id !== line.subcategory_id));
      setDrafts(current => { const next = { ...current }; delete next[line.subcategory_id]; return next; });
      setNotice(`"${line.subcategory}" removed.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'The line could not be removed.');
    } finally {
      setDeletingId(null);
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

  const saveTotalBudget = async () => {
    const trimmed = totalBudgetDraft.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setError('Enter a valid total budget amount.');
      return;
    }
    setSavingTotalBudget(true);
    setError(null);
    try {
      const saved = await saveBudgetTotal(month, year, parsed);
      setTotalBudget(saved);
      setTotalBudgetDraft(saved === null ? '' : String(saved));
      setNotice(saved === null ? 'Monthly budget cap cleared.' : `Monthly budget cap set to ${formatCurrency(saved)}.`);
    } catch (totalError) {
      setError(totalError instanceof Error ? totalError.message : 'The monthly budget cap could not be saved.');
    } finally {
      setSavingTotalBudget(false);
    }
  };

  const toggleTemplates = () => {
    setTemplatesOpen(current => !current);
    setTemplateName('');
    setError(null);
  };

  const saveCurrentAsTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    setSavingTemplate(true);
    setError(null);
    try {
      const templateLines = lines.map(line => ({
        subcategory_id: line.subcategory_id,
        projected_amount: Number(drafts[line.subcategory_id] || 0),
      }));
      await saveBudgetTemplate(name, templateLines);
      await loadTemplates();
      setTemplateName('');
      setNotice(`"${name}" saved as a template.`);
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : 'The template could not be saved.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const applyTemplate = async (template: BudgetTemplate) => {
    setApplyingTemplateId(template.template_id);
    setError(null);
    try {
      const detail = await getBudgetTemplate(template.template_id);
      const templateAmounts = new Map(detail.lines.map((line: { subcategory_id: number; projected_amount: number }) => [line.subcategory_id, line.projected_amount]));
      setDrafts(current => Object.fromEntries(Object.keys(current).map(key => [key, String(templateAmounts.get(Number(key)) ?? 0)])));
      setNotice(`"${template.name}" applied. Review the amounts, then save.`);
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : 'The template could not be applied.');
    } finally {
      setApplyingTemplateId(null);
    }
  };

  const removeTemplate = async (template: BudgetTemplate) => {
    const confirmed = await confirm({
      title: 'Delete template?',
      message: `Delete the "${template.name}" template? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingTemplateId(template.template_id);
    setError(null);
    try {
      await deleteBudgetTemplate(template.template_id);
      setTemplates(current => current.filter(item => item.template_id !== template.template_id));
      setNotice(`"${template.name}" deleted.`);
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : 'The template could not be deleted.');
    } finally {
      setDeletingTemplateId(null);
    }
  };

  const planned = lines.reduce((sum, line) => sum + Number(drafts[line.subcategory_id] || 0), 0);
  const actual = lines.reduce((sum, line) => sum + line.actual_amount, 0);
  const remaining = planned - actual;
  const groups = lines.reduce<Record<string, BudgetLine[]>>((result, line) => {
    (result[line.category] ||= []).push(line);
    return result;
  }, {});
  const isUpcomingMonth = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);

  return (
    <Page>
      <PageHeading
        eyebrow="Planning"
        title="Monthly budget"
        description="Set a plan by category and compare it with transaction activity."
      />
      <StickyControlRow>
        <MonthSwitcher month={month} year={year} onPrevious={() => changeMonth(-1)} onNext={() => changeMonth(1)} sticky />
      </StickyControlRow>
      {error && <ErrorNotice message={error} onRetry={load} />}
      {notice && <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View>}
      {isUpcomingMonth && (
        <View style={styles.planningNotice}>
          <Text style={styles.planningNoticeText}>
            Planning ahead: this month has not started yet. Amounts saved here will not affect graphs, stats, or insights until it begins.
          </Text>
        </View>
      )}
      {totalBudget !== null && planned > totalBudget && (
        <View style={styles.capWarning}>
          <AlertTriangle color={BudgetColors.warningInk} size={17} />
          <Text style={styles.capWarningText}>
            Planned budget is {formatCurrency(planned - totalBudget)} over the {formatCurrency(totalBudget)} monthly cap.
          </Text>
        </View>
      )}
      <View style={styles.stats}>
        <StatCard label="Planned" value={formatCurrency(planned)} detail="Across all categories" />
        <StatCard label="Actual" value={formatCurrency(actual)} detail="From recorded transactions" accent={BudgetColors.blue} />
        <StatCard label={remaining >= 0 ? 'Remaining' : 'Over plan'} value={formatCurrency(Math.abs(remaining))} detail={planned > 0 ? `${Math.round(actual / planned * 100)}% used` : 'Enter a plan below'} accent={remaining >= 0 ? BudgetColors.gold : BudgetColors.coral} />
      </View>
      <Panel>
        <SectionHeader title="Monthly budget cap" detail="Set the most this month can allocate across every category" />
        <View style={styles.capRow}>
          <View style={styles.inputWrap}>
            <Text style={styles.currency}>$</Text>
            <TextInput
              value={totalBudgetDraft}
              onChangeText={value => setTotalBudgetDraft(value.replace(/[^0-9.]/g, ''))}
              placeholder="No cap set"
              placeholderTextColor={BudgetColors.faint}
              keyboardType="decimal-pad"
              style={styles.input}
            />
          </View>
          <AnimatedIconButton disabled={savingTotalBudget} onPress={saveTotalBudget} style={[styles.secondaryButton, savingTotalBudget && styles.disabled]}>
            {savingTotalBudget ? <ActivityIndicator color={BudgetColors.ink} size="small" /> : <Save color={BudgetColors.ink} size={16} />}
            <Text style={styles.secondaryText}>Save cap</Text>
          </AnimatedIconButton>
        </View>
      </Panel>
      <ContributionPanel summary={contribution} style={styles.contributionPanel} />
      <View style={styles.toolbar}>
        <Pressable onPress={copyPrevious} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Copy color={BudgetColors.ink} size={16} /><Text style={styles.secondaryText}>Copy previous</Text>
        </Pressable>
        <Pressable onPress={toggleTemplates} style={({ pressed }) => [styles.secondaryButton, templatesOpen && styles.secondaryButtonActive, pressed && styles.pressed]}>
          <LayoutTemplate color={templatesOpen ? BudgetColors.green : BudgetColors.ink} size={16} />
          <Text style={[styles.secondaryText, templatesOpen && styles.secondaryTextActive]}>Templates</Text>
        </Pressable>
        <Pressable onPress={toggleManage} style={({ pressed }) => [styles.secondaryButton, managing && styles.secondaryButtonActive, pressed && styles.pressed]}>
          {managing ? <X color={BudgetColors.green} size={16} /> : <Pencil color={BudgetColors.ink} size={16} />}
          <Text style={[styles.secondaryText, managing && styles.secondaryTextActive]}>{managing ? 'Done' : 'Manage lines'}</Text>
        </Pressable>
        <AnimatedIconButton disabled={saving || managing} onPress={saveAll} style={[styles.primaryButton, (saving || managing) && styles.disabled]}>
          {saving ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <Save color={BudgetColors.surface} size={16} />}
          <Text style={styles.primaryText}>{saving ? 'Saving' : 'Save changes'}</Text>
        </AnimatedIconButton>
      </View>
      {templatesOpen && (
        <Panel>
          <SectionHeader title="Budget templates" detail="Save this month's amounts, or apply a saved starting point to any month" />
          <View style={styles.composer}>
            <TextInput
              value={templateName}
              onChangeText={setTemplateName}
              onSubmitEditing={saveCurrentAsTemplate}
              placeholder="Template name, for example: Base plan"
              placeholderTextColor={BudgetColors.faint}
              maxLength={100}
              style={styles.templateInput}
            />
            <Pressable
              disabled={savingTemplate || !templateName.trim()}
              onPress={saveCurrentAsTemplate}
              style={({ pressed }) => [styles.addButton, (!templateName.trim() || savingTemplate) && styles.disabled, pressed && styles.pressed]}>
              {savingTemplate ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <Plus color={BudgetColors.surface} size={16} />}
              <Text style={styles.addText}>Save as template</Text>
            </Pressable>
          </View>
          {templates.length === 0 ? (
            <EmptyState title="No templates yet" detail="Save the amounts shown above as a reusable starting point for any month." />
          ) : templates.map((template, index) => (
            <View key={template.template_id} style={[styles.templateRow, index === 0 && styles.lineFirst]}>
              <Text style={styles.templateName}>{template.name}</Text>
              <Pressable
                disabled={applyingTemplateId === template.template_id}
                onPress={() => applyTemplate(template)}
                style={({ pressed }) => [styles.templateApplyBtn, pressed && styles.pressed]}>
                {applyingTemplateId === template.template_id
                  ? <ActivityIndicator color={BudgetColors.green} size="small" />
                  : <Copy color={BudgetColors.green} size={15} />}
                <Text style={styles.templateApplyText}>Apply</Text>
              </Pressable>
              <AnimatedIconButton
                accessibilityLabel={`Delete ${template.name} template`}
                disabled={deletingTemplateId === template.template_id}
                onPress={() => removeTemplate(template)}
                style={styles.deleteBtn}>
                {deletingTemplateId === template.template_id
                  ? <ActivityIndicator color={BudgetColors.coral} size="small" />
                  : <Trash2 color={BudgetColors.coral} size={17} />}
              </AnimatedIconButton>
            </View>
          ))}
        </Panel>
      )}
      {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} size="large" /></View> : Object.entries(groups).map(([category, categoryLines]) => {
        const categoryId = categories.find(c => c.name === category)?.category_id ?? null;
        const categoryPlanned = categoryLines.reduce((sum, line) => sum + Number(drafts[line.subcategory_id] || 0), 0);
        const categoryActual = categoryLines.reduce((sum, line) => sum + line.actual_amount, 0);
        const isAddingHere = addingTo === categoryId;
        return <Panel key={category}>
          <SectionHeader
            title={category}
            detail={managing ? 'Manage lines' : `${formatCurrency(categoryActual)} spent of ${formatCurrency(categoryPlanned)} planned`}
          />
          {categoryLines.map((line, index) => {
            const linePlan = Number(drafts[line.subcategory_id] || 0);
            const percent = linePlan > 0 ? line.actual_amount / linePlan * 100 : line.actual_amount > 0 ? 100 : 0;
            const overBudget = linePlan > 0 ? line.actual_amount > linePlan : line.actual_amount > 0;
            const isDeleting = deletingId === line.subcategory_id;
            return <View key={line.subcategory_id} style={[styles.line, compact && styles.lineCompact, index === 0 && styles.lineFirst]}>
              {managing && (
                <AnimatedIconButton
                  accessibilityLabel={`Remove ${line.subcategory}`}
                  disabled={isDeleting}
                  onPress={() => removeLine(line)}
                  style={styles.deleteBtn}>
                  {isDeleting
                    ? <ActivityIndicator color={BudgetColors.coral} size="small" />
                    : <Trash2 color={BudgetColors.coral} size={17} />}
                </AnimatedIconButton>
              )}
              <Pressable
                disabled={managing}
                onPress={() => router.push({ pathname: '/transactions', params: { month: String(month), year: String(year), category: line.category } })}
                style={({ pressed }) => [styles.lineCopy, !managing && pressed && styles.pressed]}>
                <Text style={styles.lineName}>{line.subcategory}</Text>
                {!managing && <Text style={[styles.lineActual, overBudget && styles.over]}>{formatCurrency(line.actual_amount, 2)} spent{overBudget ? ' • Over budget' : ''}</Text>}
                {!managing && <View style={styles.progress}><AnimatedHorizontalBar delay={index * 25} percent={percent} style={[styles.progressFill, overBudget && styles.progressOver]} /></View>}
              </Pressable>
              {!managing && (
                <View style={styles.inputWrap}>
                  <Text style={styles.currency}>$</Text>
                  <TextInput
                    value={drafts[line.subcategory_id] ?? '0'}
                    onChangeText={value => setDrafts(current => ({ ...current, [line.subcategory_id]: value.replace(/[^0-9.]/g, '') }))}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    style={styles.input}
                  />
                </View>
              )}
            </View>;
          })}
          {managing && categoryId && (
            isAddingHere ? (
              <View style={styles.addRow}>
                <TextInput
                  ref={newLineRef}
                  value={newLineName}
                  onChangeText={setNewLineName}
                  onSubmitEditing={confirmAdd}
                  placeholder={`New ${category} line name…`}
                  placeholderTextColor={BudgetColors.faint}
                  returnKeyType="done"
                  style={styles.addInput}
                />
                <Pressable
                  disabled={addingBusy || !newLineName.trim()}
                  onPress={confirmAdd}
                  style={({ pressed }) => [styles.addConfirmBtn, (!newLineName.trim() || addingBusy) && styles.disabled, pressed && styles.pressed]}>
                  {addingBusy
                    ? <ActivityIndicator color={BudgetColors.surface} size="small" />
                    : <Plus color={BudgetColors.surface} size={16} />}
                  <Text style={styles.addConfirmText}>Add</Text>
                </Pressable>
                <Pressable onPress={() => { setAddingTo(null); setNewLineName(''); }} style={({ pressed }) => [styles.addCancelBtn, pressed && styles.pressed]}>
                  <X color={BudgetColors.muted} size={17} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => startAdd(categoryId)} style={({ pressed }) => [styles.addLineBtn, pressed && styles.pressed]}>
                <Plus color={BudgetColors.green} size={16} />
                <Text style={styles.addLineBtnText}>Add line to {category}</Text>
              </Pressable>
            )
          )}
        </Panel>;
      })}
    </Page>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  contributionPanel: { flex: 1, minWidth: 0 },
  notice: { padding: 12, borderRadius: 7, backgroundColor: BudgetColors.greenSoft, borderWidth: 1, borderColor: BudgetColors.successLine },
  noticeText: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '700' },
  planningNotice: { padding: 12, borderRadius: 7, backgroundColor: BudgetColors.blueSoft, borderWidth: 1, borderColor: BudgetColors.infoLine },
  planningNoticeText: { color: BudgetColors.blue, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '700' },
  capWarning: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 7, backgroundColor: BudgetColors.warningSurface, borderWidth: 1, borderColor: BudgetColors.warningLine },
  capWarningText: { flex: 1, color: BudgetColors.warningInk, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '700' },
  capRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  composer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  addButton: { height: 44, paddingHorizontal: 15, borderRadius: 7, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  addText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  templateInput: { minWidth: 240, flex: 1, height: 44, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, paddingHorizontal: 13, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13 },
  templateRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: BudgetColors.line },
  templateName: { flex: 1, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  templateApplyBtn: { height: 36, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.successLine, backgroundColor: BudgetColors.greenSoft, flexDirection: 'row', alignItems: 'center', gap: 6 },
  templateApplyText: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' },
  secondaryButton: { height: 40, paddingHorizontal: 13, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.surface, flexDirection: 'row', alignItems: 'center', gap: 7 },
  secondaryButtonActive: { borderColor: BudgetColors.green, backgroundColor: BudgetColors.greenSoft },
  secondaryText: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  secondaryTextActive: { color: BudgetColors.green },
  primaryButton: { height: 40, paddingHorizontal: 14, borderRadius: 7, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', gap: 7 },
  primaryText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.55 }, pressed: { opacity: 0.7 }, loader: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  line: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: 1, borderTopColor: BudgetColors.line },
  lineFirst: { borderTopWidth: 0 }, lineCompact: { minHeight: 92 }, lineCopy: { flex: 1, minWidth: 0, gap: 4 },
  deleteBtn: { width: 38, height: 38, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: BudgetColors.coralSoft },
  addLineBtn: { marginTop: 14, height: 38, borderRadius: 7, borderWidth: 1, borderStyle: 'dashed', borderColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  addLineBtnText: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  addRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  addInput: { flex: 1, height: 40, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.green, backgroundColor: BudgetColors.canvas, color: BudgetColors.ink, paddingHorizontal: 11, fontFamily: Fonts.sans, fontSize: 13 },
  addConfirmBtn: { height: 40, paddingHorizontal: 12, borderRadius: 7, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', gap: 6 },
  addConfirmText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  addCancelBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  lineName: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  lineActual: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 }, over: { color: BudgetColors.coral },
  progress: { width: '100%', maxWidth: 380, height: 4, borderRadius: 2, backgroundColor: BudgetColors.canvas, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: BudgetColors.green }, progressOver: { backgroundColor: BudgetColors.coral },
  inputWrap: { width: 148, height: 40, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 7, backgroundColor: BudgetColors.canvas, overflow: 'hidden' },
  currency: { color: BudgetColors.muted, paddingLeft: 11, fontFamily: Fonts.sans, fontSize: 13, flexShrink: 0 },
  input: { flex: 1, minWidth: 0, height: 38, color: BudgetColors.ink, paddingHorizontal: 7, textAlign: 'right', fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
});