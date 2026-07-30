import { Href, router, usePathname } from 'expo-router';

const ADD_PAYCHECK = '/add-paycheck' as Href;
import {
    ChartNoAxesColumnIncreasing,
    CircleDollarSign,
    DollarSign,
    FileUp,
    LayoutDashboard,
    Menu,
    Moon,
    Plus,
    ReceiptText,
    Settings,
    Target,
    Sun,
    WalletCards,
    X,
} from 'lucide-react-native';
  import { ReactNode, useEffect, useState } from 'react';
  import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BudgetColors, Fonts, MaxContentWidth } from '@/constants/theme';
import { useBudgetTheme } from '@/hooks/use-budget-theme';

const navItems = [
  { label: 'Overview', href: '/' as Href, icon: LayoutDashboard },
  { label: 'Transactions', href: '/transactions' as Href, icon: ReceiptText },
  { label: 'Budget', href: '/budget' as Href, icon: WalletCards },
  { label: 'Insights', href: '/explore' as Href, icon: ChartNoAxesColumnIncreasing },
  { label: 'Goals', href: '/goals' as Href, icon: Target },
  { label: 'Import', href: '/import' as Href, icon: FileUp },
];

const mobileNavItems = [
  ...navItems,
  { label: 'Settings', href: '/settings' as Href, icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const compact = width < 1040;
  const [menuOpen, setMenuOpen] = useState(false);
  const { mode, toggle: toggleTheme } = useBudgetTheme();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname, compact]);

  const navigate = (href: Href) => {
    setMenuOpen(false);
    router.navigate(href);
  };

  return (
    <View style={styles.app}>
      <View style={styles.header}>
        <View style={[styles.headerInner, compact && styles.headerInnerCompact]}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Go to overview"
            onPress={() => navigate('/')}
            style={styles.brand}>
            <View style={styles.brandMark}>
              <CircleDollarSign color={BudgetColors.surface} size={22} strokeWidth={2.2} />
            </View>
            <View>
              <Text style={styles.brandName}>HomeBudget</Text>
              {!compact && <Text style={styles.brandDetail}>Household ledger</Text>}
            </View>
          </Pressable>

          {compact ? (
            <View style={styles.compactActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add paycheck"
                onPress={() => router.push(ADD_PAYCHECK)}
                style={({ pressed }) => [styles.compactPaycheckButton, pressed && styles.pressed]}>
                <DollarSign color={BudgetColors.green} size={19} strokeWidth={2.5} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add transaction"
                onPress={() => router.push('/add-transaction')}
                style={({ pressed }) => [styles.compactAddButton, pressed && styles.pressed]}>
                <Plus color={BudgetColors.surface} size={19} strokeWidth={2.5} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open navigation menu"
                accessibilityState={{ expanded: menuOpen }}
                onPress={() => setMenuOpen(true)}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                <Menu color={BudgetColors.ink} size={21} />
              </Pressable>
            </View>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.nav}
                contentContainerStyle={styles.navContent}>
                {navItems.map((item) => {
                  const active = item.href === '/' ? pathname === '/' : pathname.startsWith(String(item.href));
                  const Icon = item.icon;

                  return (
                    <Pressable
                      key={item.label}
                      accessibilityRole="link"
                      accessibilityState={{ selected: active }}
                      onPress={() => navigate(item.href)}
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
                  accessibilityLabel="Add paycheck"
                  onPress={() => router.push(ADD_PAYCHECK)}
                  style={({ pressed }) => [styles.paycheckButton, pressed && styles.pressed]}>
                  <DollarSign color={BudgetColors.green} size={19} strokeWidth={2.5} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add transaction"
                  onPress={() => router.push('/add-transaction')}
                  style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
                  <Plus color={BudgetColors.surface} size={18} strokeWidth={2.5} />
                  <Text style={styles.addButtonText}>Add transaction</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
                  onPress={toggleTheme}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                  {mode === 'dark'
                    ? <Sun color={BudgetColors.ink} size={19} />
                    : <Moon color={BudgetColors.ink} size={19} />}
                </Pressable>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Open settings"
                  onPress={() => navigate('/settings')}
                  style={({ pressed }) => [
                    styles.iconButton,
                    pathname === '/settings' && styles.iconButtonActive,
                    pressed && styles.pressed,
                  ]}>
                  <Settings color={BudgetColors.ink} size={19} />
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        statusBarTranslucent
        transparent
        visible={compact && menuOpen}>
        <View style={styles.menuOverlay}>
          <Pressable
            accessibilityLabel="Close navigation menu"
            onPress={() => setMenuOpen(false)}
            style={styles.menuScrim}
          />
          <View style={styles.mobileMenu}>
            <View style={styles.mobileMenuHeader}>
              <View>
                <Text style={styles.mobileMenuEyebrow}>HomeBudget</Text>
                <Text style={styles.mobileMenuTitle}>Menu</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close navigation menu"
                onPress={() => setMenuOpen(false)}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                <X color={BudgetColors.ink} size={21} />
              </Pressable>
            </View>

            <View style={styles.mobileNav}>
              {mobileNavItems.map((item) => {
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(String(item.href));
                const Icon = item.icon;

                return (
                  <Pressable
                    key={item.label}
                    accessibilityRole="link"
                    accessibilityState={{ selected: active }}
                    onPress={() => navigate(item.href)}
                    style={({ pressed }) => [
                      styles.mobileNavItem,
                      active && styles.mobileNavItemActive,
                      pressed && styles.pressed,
                    ]}>
                    <Icon color={active ? BudgetColors.green : BudgetColors.muted} size={20} />
                    <Text style={[styles.mobileNavLabel, active && styles.mobileNavLabelActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
              onPress={toggleTheme}
              style={({ pressed }) => [styles.mobileThemeButton, pressed && styles.pressed]}>
              <View style={styles.mobileThemeIcon}>
                {mode === 'dark'
                  ? <Sun color={BudgetColors.gold} size={19} />
                  : <Moon color={BudgetColors.blue} size={19} />}
              </View>
              <View style={styles.mobileThemeCopy}>
                <Text style={styles.mobileThemeTitle}>{mode === 'dark' ? 'Light mode' : 'Dark mode'}</Text>
                <Text style={styles.mobileThemeDetail}>Change the appearance on this device</Text>
              </View>
            </Pressable>

            <View style={styles.mobileAddRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add paycheck"
                onPress={() => {
                  setMenuOpen(false);
                  router.push(ADD_PAYCHECK);
                }}
                style={({ pressed }) => [styles.mobilePaycheckButton, pressed && styles.pressed]}>
                <DollarSign color={BudgetColors.green} size={20} strokeWidth={2.5} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMenuOpen(false);
                  router.push('/add-transaction');
                }}
                style={({ pressed }) => [styles.mobileAddButton, pressed && styles.pressed]}>
                <Plus color={BudgetColors.surface} size={19} strokeWidth={2.5} />
                <Text style={styles.mobileAddButtonText}>Add transaction</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  compactActions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactAddButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: BudgetColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactPaycheckButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BudgetColors.green,
    backgroundColor: BudgetColors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
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
  paycheckButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BudgetColors.green,
    backgroundColor: BudgetColors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
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
  menuOverlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  menuScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BudgetColors.scrim,
  },
  mobileMenu: {
    width: '86%',
    maxWidth: 340,
    height: '100%',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 24,
    backgroundColor: BudgetColors.surface,
    borderLeftWidth: 1,
    borderLeftColor: BudgetColors.line,
  },
  mobileMenuHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  mobileMenuEyebrow: {
    color: BudgetColors.green,
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  mobileMenuTitle: {
    marginTop: 2,
    color: BudgetColors.ink,
    fontFamily: Fonts.serif,
    fontSize: 25,
    fontWeight: '700',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BudgetColors.line,
    borderRadius: 8,
  },
  mobileNav: {
    flex: 1,
    gap: 5,
  },
  mobileNavItem: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mobileNavItemActive: {
    backgroundColor: BudgetColors.greenSoft,
  },
  mobileNavLabel: {
    color: BudgetColors.muted,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
  },
  mobileNavLabelActive: {
    color: BudgetColors.green,
  },
  mobileAddButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: BudgetColors.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mobileAddRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  mobilePaycheckButton: {
    width: 46,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BudgetColors.green,
    backgroundColor: BudgetColors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileAddButtonText: {
    color: BudgetColors.surface,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '800',
  },
  mobileThemeButton: {
    minHeight: 58,
    marginBottom: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: BudgetColors.line,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mobileThemeIcon: {
    width: 34,
    height: 34,
    borderRadius: 7,
    backgroundColor: BudgetColors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileThemeCopy: {
    flex: 1,
    gap: 2,
  },
  mobileThemeTitle: {
    color: BudgetColors.ink,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '800',
  },
  mobileThemeDetail: {
    color: BudgetColors.muted,
    fontFamily: Fonts.sans,
    fontSize: 9,
  },
  pressed: {
    opacity: 0.72,
  },
  content: {
    flex: 1,
  },
});