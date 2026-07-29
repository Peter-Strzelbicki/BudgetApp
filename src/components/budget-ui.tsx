import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { ReactElement, ReactNode } from 'react';
import {
    Pressable,
    RefreshControlProps,
    ScrollView,
    StyleProp,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
    ViewStyle,
} from 'react-native';

import { BudgetColors, Fonts, MaxContentWidth } from '@/constants/theme';

export function Page({ children, refreshControl }: {
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  const { width } = useWindowDimensions();
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.pageContent, width < 700 && styles.pageContentCompact]}
      refreshControl={refreshControl}>
      {children}
    </ScrollView>
  );
}

export function PageHeading({ eyebrow, title, description, action }: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.headingRow}>
      <View style={styles.headingCopy}>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.heading}>{title}</Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>
      {action}
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function SectionHeader({ title, detail, action }: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
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
    <View style={styles.statCard}>
      <View style={styles.statTop}>
        <View style={[styles.statAccent, { backgroundColor: accent }]} />
        {icon}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {detail && <Text style={styles.statDetail}>{detail}</Text>}
    </View>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorNotice}>
      <View style={styles.errorCopy}>
        <Text style={styles.errorTitle}>Could not load this data</Text>
        <Text style={styles.errorMessage}>{message}</Text>
      </View>
      {onRetry && (
        <Pressable onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

export function MonthSwitcher({ month, year, onPrevious, onNext }: {
  month: number;
  year: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const label = new Date(year, month - 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  return (
    <View style={styles.monthSwitcher}>
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

export function moveMonth(month: number, year: number, offset: number) {
  const date = new Date(year, month - 1 + offset, 1);
  return { month: date.getMonth() + 1, year: date.getFullYear() };
}

export function formatCurrency(value: number, digits = 0) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BudgetColors.canvas },
  pageContent: {
    width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: 24,
    paddingTop: 36, paddingBottom: 64, gap: 24,
  },
  pageContentCompact: { paddingHorizontal: 14, paddingTop: 24, paddingBottom: 40, gap: 18 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' },
  headingCopy: { maxWidth: 680, gap: 6 },
  eyebrow: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0 },
  heading: { color: BudgetColors.ink, fontFamily: Fonts.serif, fontSize: 34, lineHeight: 40, fontWeight: '700' },
  description: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 14, lineHeight: 21 },
  panel: { backgroundColor: BudgetColors.surface, borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 8, padding: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 },
  sectionCopy: { flex: 1, gap: 3 },
  sectionTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 16, fontWeight: '800' },
  sectionDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 12 },
  statCard: { minWidth: 180, flex: 1, minHeight: 138, backgroundColor: BudgetColors.surface, borderWidth: 1, borderColor: BudgetColors.line, borderRadius: 8, padding: 17 },
  statTop: { height: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statAccent: { width: 30, height: 3, borderRadius: 2 },
  statLabel: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700', marginTop: 12 },
  statValue: { color: BudgetColors.ink, fontFamily: Fonts.serif, fontSize: 25, fontWeight: '700', marginTop: 4 },
  statDetail: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 11, marginTop: 5 },
  errorNotice: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#EDC6B9', backgroundColor: BudgetColors.coralSoft },
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
  pressed: { opacity: 0.65 },
});