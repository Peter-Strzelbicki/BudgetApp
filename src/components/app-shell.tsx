import { Href, router, usePathname } from 'expo-router';
import {
    ChartNoAxesColumnIncreasing,
    CircleDollarSign,
    LayoutDashboard,
    Plus,
    ReceiptText,
    Settings,
    Target,
    WalletCards,
} from 'lucide-react-native';
import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BudgetColors, Fonts, MaxContentWidth } from '@/constants/theme';

const navItems = [
  { label: 'Overview', href: '/' as Href, icon: LayoutDashboard },
  { label: 'Transactions', href: '/transactions' as Href, icon: ReceiptText },
  { label: 'Budget', href: '/budget' as Href, icon: WalletCards },
  { label: 'Insights', href: '/explore' as Href, icon: ChartNoAxesColumnIncreasing },
  { label: 'Goals', href: '/goals' as Href, icon: Target },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const compact = width < 820;

  return (
    <View style={styles.app}>
      <View style={styles.header}>
        <View style={[styles.headerInner, compact && styles.headerInnerCompact]}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Go to overview"
            onPress={() => router.navigate('/')}
            style={styles.brand}>
            <View style={styles.brandMark}>
              <CircleDollarSign color={BudgetColors.surface} size={22} strokeWidth={2.2} />
            </View>
            <View>
              <Text style={styles.brandName}>HomeBudget</Text>
              {!compact && <Text style={styles.brandDetail}>Household ledger</Text>}
            </View>
          </Pressable>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={compact ? styles.navCompact : styles.nav}
            contentContainerStyle={styles.navContent}>
            {navItems.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(String(item.href));
              const Icon = item.icon;

              return (
                <Pressable
                  key={item.label}
                  accessibilityRole="link"
                  accessibilityState={{ selected: active }}
                  onPress={() => router.navigate(item.href)}
                  style={({ pressed }) => [
                    styles.navItem,
                    active && styles.navItemActive,
                    pressed && styles.pressed,
                  ]}>
                  <Icon
                    color={active ? BudgetColors.ink : BudgetColors.muted}
                    size={17}
                    strokeWidth={2}
                  />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add transaction"
              onPress={() => router.push('/add-transaction')}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
              <Plus color={BudgetColors.surface} size={18} strokeWidth={2.5} />
              {!compact && <Text style={styles.addButtonText}>Add transaction</Text>}
            </Pressable>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open settings"
              onPress={() => router.navigate('/settings')}
              style={({ pressed }) => [
                styles.iconButton,
                pathname === '/settings' && styles.iconButtonActive,
                pressed && styles.pressed,
              ]}>
              <Settings color={BudgetColors.ink} size={19} />
            </Pressable>
          </View>
        </View>
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: BudgetColors.canvas,
  },
  header: {
    backgroundColor: BudgetColors.surface,
    borderBottomColor: BudgetColors.line,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  headerInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    minHeight: 72,
    alignSelf: 'center',
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  headerInnerCompact: {
    minHeight: 64,
    paddingHorizontal: 14,
    gap: 10,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BudgetColors.green,
  },
  brandName: {
    color: BudgetColors.ink,
    fontFamily: Fonts.serif,
    fontSize: 18,
    fontWeight: '700',
  },
  brandDetail: {
    color: BudgetColors.muted,
    fontFamily: Fonts.sans,
    fontSize: 10,
  },
  nav: {
    flex: 1,
  },
  navCompact: {
    flex: 1,
    minWidth: 0,
  },
  navContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  navItem: {
    height: 38,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 7,
  },
  navItemActive: {
    backgroundColor: BudgetColors.greenSoft,
  },
  navLabel: {
    color: BudgetColors.muted,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
  },
  navLabelActive: {
    color: BudgetColors.ink,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addButton: {
    height: 40,
    paddingHorizontal: 13,
    borderRadius: 8,
    backgroundColor: BudgetColors.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  addButtonText: {
    color: BudgetColors.surface,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BudgetColors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: {
    backgroundColor: BudgetColors.greenSoft,
    borderColor: BudgetColors.greenSoft,
  },
  pressed: {
    opacity: 0.72,
  },
  content: {
    flex: 1,
  },
});