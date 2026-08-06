import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { createContext, ReactElement, ReactNode, useCallback, useContext, useState } from 'react';
import {
    Modal,
    Platform,
    Pressable,
    RefreshControlProps,
    StyleProp,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
    ViewStyle,
} from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeInUp, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { BudgetColors, Fonts, MaxContentWidth } from '@/constants/theme';

/** Keeps a date/year control visible at the top of the page scroll on web (desktop and mobile browsers). */
const webStickyControl: ViewStyle | undefined = Platform.OS === 'web'
  ? ({ position: 'sticky', top: 0, zIndex: 8 } as unknown as ViewStyle)
  : undefined;

const easeOut = Easing.out(Easing.cubic);
const pageEntrance = FadeIn.duration(220).easing(easeOut).reduceMotion(ReduceMotion.System);
const headingEntrance = FadeInDown.duration(340).delay(30).easing(easeOut).reduceMotion(ReduceMotion.System);
const panelEntrance = FadeInUp.duration(380).delay(70).easing(easeOut).reduceMotion(ReduceMotion.System);
const statEntrance = FadeInUp.duration(360).delay(110).easing(easeOut).reduceMotion(ReduceMotion.System);
const noticeEntrance = FadeIn.duration(240).delay(40).easing(easeOut).reduceMotion(ReduceMotion.System);

export function Page({ children, refreshControl }: {
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  const { width } = useWindowDimensions();
  return (
    <Animated.ScrollView
      entering={pageEntrance}
      style={styles.page}
      contentContainerStyle={[styles.pageContent, width < 700 && styles.pageContentCompact]}
      refreshControl={refreshControl}>
      {children}
    </Animated.ScrollView>
  );
}

export function PageHeading({ eyebrow, title, description, action }: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Animated.View entering={headingEntrance} style={styles.headingRow}>
      <View style={styles.headingCopy}>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.heading}>{title}</Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>
      {action}
    </Animated.View>
  );
}

export function StickyControlRow({ children }: { children: ReactNode }) {
  return <View style={[styles.stickyControlRow, webStickyControl]}>{children}</View>;
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Animated.View entering={panelEntrance} style={[styles.panel, style]}>{children}</Animated.View>;
}

export function SectionHeader({ title, detail, action }: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  const compact = useWindowDimensions().width < 520;
  return (
    <View style={[styles.sectionHeader, compact && styles.sectionHeaderCompact]}>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail && <Text style={styles.sectionDetail}>{detail}</Text>}
      </View>
      {action}
    </View>
  );
}

export function StatCard({ label, value, detail, accent = BudgetColors.green, icon }: {
  label: string;
  value: string;
  detail?: string;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <Animated.View entering={statEntrance} style={styles.statCard}>
      <View style={styles.statTop}>
        <View style={[styles.statAccent, { backgroundColor: accent }]} />
        {icon}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {detail && <Text style={styles.statDetail}>{detail}</Text>}
    </Animated.View>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Animated.View entering={noticeEntrance} style={styles.errorNotice}>
      <View style={styles.errorCopy}>
        <Text style={styles.errorTitle}>Could not load this data</Text>
        <Text style={styles.errorMessage}>{message}</Text>
      </View>
      {onRetry && (
        <Pressable onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <Animated.View entering={noticeEntrance} style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </Animated.View>
  );
}

export function MonthSwitcher({ month, year, onPrevious, onNext, sticky = false }: {
  month: number;
  year: number;
  onPrevious: () => void;
  onNext: () => void;
  sticky?: boolean;
}) {
  const label = new Date(year, month - 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  return (
    <View style={[styles.monthSwitcher, sticky && webStickyControl]}>
      <Pressable accessibilityLabel="Previous month" onPress={onPrevious} style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}>
        <ChevronLeft color={BudgetColors.ink} size={20} />
      </Pressable>
      <Text style={styles.monthLabel}>{label}</Text>
      <Pressable accessibilityLabel="Next month" onPress={onNext} style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}>
        <ChevronRight color={BudgetColors.ink} size={20} />
      </Pressable>
    </View>
  );
}

export function YearSwitcher({ year, onPrevious, onNext, previousDisabled = false, nextDisabled = false, sticky = false }: {
  year: number;
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  sticky?: boolean;
}) {
  return (
    <View style={[styles.yearSwitcher, sticky && webStickyControl]}>
      <Pressable
        accessibilityLabel="Previous year"
        disabled={previousDisabled}
        onPress={onPrevious}
        style={({ pressed }) => [styles.yearButton, previousDisabled && styles.disabled, pressed && styles.pressed]}>
        <ChevronLeft color={BudgetColors.ink} size={19} />
      </Pressable>
      <Text style={styles.yearLabel}>{year}</Text>
      <Pressable
        accessibilityLabel="Next year"
        disabled={nextDisabled}
        onPress={onNext}
        style={({ pressed }) => [styles.yearButton, nextDisabled && styles.disabled, pressed && styles.pressed]}>
        <ChevronRight color={BudgetColors.ink} size={19} />
      </Pressable>
    </View>
  );
}

export function moveMonth(month: number, year: number, offset: number) {
  const date = new Date(year, month - 1 + offset, 1);
  return { month: date.getMonth() + 1, year: date.getFullYear() };
}

export function formatCurrency(value: number, digits = 2) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Spring-press animation wrapper — drop-in for any Pressable that contains an icon. */
export function AnimatedIconButton({
  onPress,
  style,
  children,
  disabled,
  accessibilityLabel,
  accessibilityRole,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: string;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole as any}
      disabled={disabled}
      onPressIn={() => { scale.value = withSpring(0.80, { damping: 14, stiffness: 300 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 7, stiffness: 200 }); }}
      onPress={onPress}
      style={style}
    >
      <Animated.View style={animStyle}>{children}</Animated.View>
    </Pressable>
  );
}

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmState = ConfirmOptions & { resolve: (value: boolean) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

/** Mount once near the app root; provides the styled confirm dialog used by useConfirm(). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => setState({ ...options, resolve }));
  }, []);

  const resolveWith = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal transparent statusBarTranslucent animationType="fade" visible={Boolean(state)} onRequestClose={() => resolveWith(false)}>
        <Pressable style={styles.confirmBackdrop} onPress={() => resolveWith(false)}>
          {state && (
            <Pressable style={styles.confirmCard} onPress={() => null}>
              <Text style={styles.confirmTitle}>{state.title}</Text>
              {state.message && <Text style={styles.confirmMessage}>{state.message}</Text>}
              <View style={styles.confirmActions}>
                <Pressable onPress={() => resolveWith(false)} style={({ pressed }) => [styles.confirmButton, styles.confirmCancelButton, pressed && styles.pressed]}>
                  <Text style={styles.confirmCancelText}>{state.cancelLabel ?? 'Cancel'}</Text>
                </Pressable>
                <Pressable onPress={() => resolveWith(true)} style={({ pressed }) => [styles.confirmButton, state.destructive ? styles.confirmDestructiveButton : styles.confirmPrimaryButton, pressed && styles.pressed]}>
                  <Text style={state.destructive ? styles.confirmDestructiveText : styles.confirmPrimaryText}>{state.confirmLabel ?? 'Confirm'}</Text>
                </Pressable>
              </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </ConfirmContext.Provider>
  );
}

/** Styled in-app replacement for window.confirm/Alert.alert — resolves true/false. */
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used within a ConfirmProvider');
  return confirm;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BudgetColors.canvas },
  pageContent: {
    width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: 24,
    paddingTop: 36, paddingBottom: 64, gap: 24,
  },
  pageContentCompact: { paddingHorizontal: 14, paddingTop: 24, paddingBottom: 40, gap: 18 },
  stickyControlRow: { width: '100%', zIndex: 8, alignItems: 'flex-end' },
  headingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' },
  headingCopy: { width: '100%', maxWidth: 680, minWidth: 0, flexShrink: 1, gap: 6 },
  eyebrow: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0 },
  heading: { color: BudgetColors.ink, fontFamily: Fonts.serif, fontSize: 34, lineHeight: 40, fontWeight: '700' },
  description: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 14, lineHeight: 21 },
  panel: { backgroundColor: BudgetColors.surface, borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 8, padding: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 },
  sectionHeaderCompact: { flexDirection: 'column', alignItems: 'stretch' },
  sectionCopy: { flex: 1, gap: 3 },
  sectionTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 16, fontWeight: '800' },
  sectionDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 12 },
  statCard: { minWidth: 180, flex: 1, minHeight: 138, backgroundColor: BudgetColors.surface, borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 8, padding: 17 },
  statTop: { height: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statAccent: { width: 30, height: 3, borderRadius: 2 },
  statLabel: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700', marginTop: 12 },
  statValue: { color: BudgetColors.ink, fontFamily: Fonts.serif, fontSize: 25, fontWeight: '700', marginTop: 4 },
  statDetail: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 11, marginTop: 5 },
  errorNotice: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: BudgetColors.dangerLine, backgroundColor: BudgetColors.coralSoft },
  errorCopy: { flex: 1, gap: 2 },
  errorTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  errorMessage: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 12 },
  retry: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, backgroundColor: BudgetColors.surface },
  retryText: { color: BudgetColors.coral, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  emptyState: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 5, padding: 20 },
  emptyTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 15, fontWeight: '800' },
  emptyDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 12, textAlign: 'center' },
  monthSwitcher: { height: 42, minWidth: 250, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 8, backgroundColor: BudgetColors.surface },
  monthButton: { width: 42, height: 40, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  yearSwitcher: { height: 42, minWidth: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 8, backgroundColor: BudgetColors.surface },
  yearButton: { width: 42, height: 40, alignItems: 'center', justifyContent: 'center' },
  yearLabel: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.3 },
  pressed: { opacity: 0.65 },
  confirmBackdrop: { flex: 1, backgroundColor: 'rgba(15, 24, 36, 0.4)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  confirmCard: { width: '100%', maxWidth: 380, borderRadius: 10, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.surface, padding: 18, gap: 8 },
  confirmTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 16, fontWeight: '800' },
  confirmMessage: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  confirmButton: { minHeight: 40, paddingHorizontal: 16, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  confirmCancelButton: { backgroundColor: BudgetColors.canvas, borderWidth: 1, borderColor: BudgetColors.line },
  confirmCancelText: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
  confirmPrimaryButton: { backgroundColor: BudgetColors.green },
  confirmPrimaryText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
  confirmDestructiveButton: { backgroundColor: BudgetColors.coral },
  confirmDestructiveText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' },
});