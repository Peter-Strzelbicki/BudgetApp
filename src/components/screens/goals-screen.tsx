import { Check, ChevronLeft, ChevronRight, Plus, Square, Target, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AnimatedIconButton, EmptyState, ErrorNotice, Page, PageHeading, Panel, SectionHeader } from '@/components/budget-ui';
import { addGoal, deleteGoal, getGoals, Goal, setGoalCompleted } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

export default function GoalsScreen() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [goals, setGoals] = useState<Goal[]>([]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { setGoals(await getGoals(year)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Goals could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [year]);

  const create = async () => {
    const value = description.trim();
    if (!value) return;
    setSubmitting(true); setError(null);
    try {
      const result = await addGoal(year, value);
      setGoals(current => [{ goal_id: result.goal_id, year, description: value, completed: false }, ...current]);
      setDescription('');
    } catch (createError) { setError(createError instanceof Error ? createError.message : 'The goal could not be added.'); }
    finally { setSubmitting(false); }
  };

  const remove = async (goalId: number) => {
    setError(null);
    try { await deleteGoal(goalId); setGoals(current => current.filter(goal => goal.goal_id !== goalId)); }
    catch (removeError) { setError(removeError instanceof Error ? removeError.message : 'The goal could not be removed.'); }
  };

  const toggle = async (goal: Goal) => {
    setError(null);
    const nextCompleted = !goal.completed;
    setGoals(current => current.map(item => item.goal_id === goal.goal_id ? { ...item, completed: nextCompleted } : item));
    try { await setGoalCompleted(goal.goal_id, nextCompleted); }
    catch (toggleError) {
      setGoals(current => current.map(item => item.goal_id === goal.goal_id ? { ...item, completed: goal.completed } : item));
      setError(toggleError instanceof Error ? toggleError.message : 'The goal could not be updated.');
    }
  };

  const completedCount = goals.filter(goal => goal.completed).length;
  const orderedGoals = [...goals].sort((a, b) => Number(a.completed) - Number(b.completed));
  const completionPercent = goals.length ? Math.round((completedCount / goals.length) * 100) : 0;

  return <Page>
    <PageHeading eyebrow="Intentions" title="Household goals" description="Keep the financial priorities for the year visible and concrete." action={<View style={styles.yearPicker}><Pressable accessibilityLabel="Previous year" onPress={() => setYear(value => value - 1)} style={({ pressed }) => [styles.yearButton, pressed && styles.pressed]}><ChevronLeft color={BudgetColors.green} size={18} /></Pressable><Text style={styles.year}>{year}</Text><Pressable accessibilityLabel="Next year" onPress={() => setYear(value => value + 1)} style={({ pressed }) => [styles.yearButton, pressed && styles.pressed]}><ChevronRight color={BudgetColors.green} size={18} /></Pressable></View>} />
    {error && <ErrorNotice message={error} onRetry={load} />}
    <Panel>
      <SectionHeader title="Add a goal" detail={`A clear financial intention for ${year}`} />
      <View style={styles.composer}>
        <TextInput value={description} onChangeText={setDescription} onSubmitEditing={create} placeholder="For example: build a six-month emergency fund" placeholderTextColor={BudgetColors.faint} maxLength={255} style={styles.input} />
        <Pressable disabled={submitting || !description.trim()} onPress={create} style={({ pressed }) => [styles.addButton, (!description.trim() || submitting) && styles.disabled, pressed && styles.pressed]}>
          {submitting ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <Plus color={BudgetColors.surface} size={18} />}
          <Text style={styles.addText}>Add goal</Text>
        </Pressable>
      </View>
    </Panel>
    <Panel>
      <SectionHeader title={`${year} priorities`} detail={`${completedCount} of ${goals.length} goal${goals.length === 1 ? '' : 's'} complete`} action={<View style={styles.goalIcon}><Target color={BudgetColors.green} size={18} /></View>} />
      {goals.length > 0 && <View style={styles.progressBlock}>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${completionPercent}%` }]} /></View>
        <View style={styles.progressMeta}><Text style={styles.progressLabel}>{completionPercent === 100 ? 'All priorities complete' : 'Progress this year'}</Text><Text style={styles.progressValue}>{completionPercent}%</Text></View>
      </View>}
      {loading ? <View style={styles.loader}><ActivityIndicator color={BudgetColors.green} /></View> : goals.length === 0 ? <EmptyState title="No goals yet" detail="Add the first priority you want the household budget to support." /> : orderedGoals.map((goal, index) => <View key={goal.goal_id} style={[styles.goal, index === 0 && styles.goalFirst]}>
        <AnimatedIconButton accessibilityLabel={goal.completed ? `Mark ${goal.description} as not complete` : `Mark ${goal.description} as complete`} onPress={() => toggle(goal)} style={[styles.check, goal.completed && styles.checkDone]}>
          {goal.completed ? <Check color={BudgetColors.surface} size={17} /> : <Square color={BudgetColors.faint} size={17} />}
        </AnimatedIconButton>
        <Text style={[styles.goalText, goal.completed && styles.goalTextDone]}>{goal.description}</Text>
        <AnimatedIconButton accessibilityLabel={`Delete ${goal.description}`} onPress={() => remove(goal.goal_id)} style={styles.deleteButton}><Trash2 color={BudgetColors.coral} size={17} /></AnimatedIconButton>
      </View>)}
    </Panel>
  </Page>;
}

const styles = StyleSheet.create({
  yearPicker: { height: 42, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 8, backgroundColor: BudgetColors.surface },
  yearButton: { width: 38, height: 40, alignItems: 'center', justifyContent: 'center' }, yearButtonText: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  year: { minWidth: 54, textAlign: 'center', color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  composer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  input: { minWidth: 240, flex: 1, height: 44, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, paddingHorizontal: 13, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13 },
  addButton: { height: 44, paddingHorizontal: 15, borderRadius: 7, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  addText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.68 },
  loader: { minHeight: 140, alignItems: 'center', justifyContent: 'center' },
  goalIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: BudgetColors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  progressBlock: { paddingTop: 2, paddingBottom: 6 },
  progressTrack: { height: 8, overflow: 'hidden', borderRadius: 4, backgroundColor: BudgetColors.greenSoft },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: BudgetColors.green },
  progressMeta: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  progressValue: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '900' },
  goal: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: BudgetColors.line }, goalFirst: { borderTopWidth: 0 },
  check: { width: 32, height: 32, borderRadius: 7, backgroundColor: BudgetColors.canvas, borderWidth: 1, borderColor: BudgetColors.line, alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: BudgetColors.green, borderColor: BudgetColors.green },
  goalText: { flex: 1, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  goalTextDone: { color: BudgetColors.faint, textDecorationLine: 'line-through' },
  deleteButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
});