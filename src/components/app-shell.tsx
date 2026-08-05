import { Href, router, usePathname } from 'expo-router';

const ADD_PAYCHECK = '/add-paycheck' as Href;
import {
    ChartNoAxesColumnIncreasing,
    CircleDollarSign,
    DollarSign,
    LayoutDashboard,
    Menu,
    Moon,
    PawPrint,
    PiggyBank,
    Plus,
    ReceiptText,
    Repeat,
    Settings,
    Target,
    Sun,
    WalletCards,
    X,
} from 'lucide-react-native';
  import { Image } from 'expo-image';
  import { ComponentType, ReactNode, useEffect, useRef, useState } from 'react';
  import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeInDown, ReduceMotion, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { BudgetColors, Fonts, MaxContentWidth } from '@/constants/theme';
import { useBudgetTheme } from '@/hooks/use-budget-theme';

const headerEntrance = FadeInDown.duration(300)
  .easing(Easing.out(Easing.cubic))
  .reduceMotion(ReduceMotion.System);
const brandEntrance = ZoomIn.duration(360)
  .delay(80)
  .easing(Easing.out(Easing.back(1.25)))
  .reduceMotion(ReduceMotion.System);

const navItems = [
  { label: 'Overview', href: '/' as Href, icon: LayoutDashboard },
  { label: 'Transactions', href: '/transactions' as Href, icon: ReceiptText },
  { label: 'Budget', href: '/budget' as Href, icon: WalletCards },
  { label: 'Savings', href: '/savings' as Href, icon: PiggyBank },
  { label: 'Insights', href: '/explore' as Href, icon: ChartNoAxesColumnIncreasing },
  { label: 'Goals', href: '/goals' as Href, icon: Target },
  { label: 'Recurring', href: '/recurring' as Href, icon: Repeat },
];

const mobileNavItems = [
  ...navItems,
  { label: 'Settings', href: '/settings' as Href, icon: Settings },
];

function DesktopNavItem({ item, active, onPress }: {
  item: { label: string; icon: ComponentType<{ color: string; size: number; strokeWidth?: number }> };
  active: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(active ? 1.2 : 1);
  const Icon = item.icon;
  useEffect(() => {
    scale.value = withSpring(active ? 1.2 : 1, { damping: 12, stiffness: 240 });
  }, [active]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.navItem, active && styles.navItemActive, pressed && styles.pressed]}>
      <Animated.View style={iconStyle}>
        <Icon color={active ? BudgetColors.ink : BudgetColors.muted} size={17} strokeWidth={2} />
      </Animated.View>
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
    </Pressable>
  );
}

function MobileNavItem({ item, active, onPress }: {
  item: { label: string; icon: ComponentType<{ color: string; size: number }> };
  active: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(active ? 1.2 : 1);
  const Icon = item.icon;
  useEffect(() => {
    scale.value = withSpring(active ? 1.2 : 1, { damping: 12, stiffness: 240 });
  }, [active]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.mobileNavItem, active && styles.mobileNavItemActive, pressed && styles.pressed]}>
      <Animated.View style={iconStyle}>
        <Icon color={active ? BudgetColors.green : BudgetColors.muted} size={20} />
      </Animated.View>
      <Text style={[styles.mobileNavLabel, active && styles.mobileNavLabelActive]}>{item.label}</Text>
    </Pressable>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const compact = width < 1040;
  const desktopCollapsedNav = !compact && width < 1380;
  const narrowHeader = width < 360;
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDogEgg, setShowDogEgg] = useState(false);
  const { mode, toggle: toggleTheme } = useBudgetTheme();
  const themeRot   = useSharedValue(0);
  const settingsRot = useSharedValue(0);
  const plusScale  = useSharedValue(1);
  const dollarScale = useSharedValue(1);
  const menuRot    = useSharedValue(0);
  const closeScale = useSharedValue(1);
  const themeIconStyle   = useAnimatedStyle(() => ({ transform: [{ rotate: `${themeRot.value}deg` }] }));
  const settingsIconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${settingsRot.value}deg` }] }));
  const plusStyle        = useAnimatedStyle(() => ({ transform: [{ scale: plusScale.value }] }));
  const dollarStyle      = useAnimatedStyle(() => ({ transform: [{ scale: dollarScale.value }] }));
  const menuIconStyle    = useAnimatedStyle(() => ({ transform: [{ rotate: `${menuRot.value}deg` }] }));
  const closeStyle       = useAnimatedStyle(() => ({ transform: [{ scale: closeScale.value }] }));
  const desktopPrimaryNavItems = desktopCollapsedNav ? navItems.slice(0, 4) : navItems;
  const brandTapCount = useRef(0);
  const brandTapResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMenuOpen(false); }, [pathname, compact]);
  useEffect(() => { menuRot.value = withSpring(menuOpen ? 90 : 0, { damping: 15, stiffness: 200 }); }, [menuOpen]);

  useEffect(() => () => {
    if (brandTapResetTimer.current) clearTimeout(brandTapResetTimer.current);
  }, []);

  const navigate = (href: Href) => {
    setMenuOpen(false);
    router.navigate(href);
  };

  const handleBrandPress = () => {
    // five quick taps on the logo reveals a hidden easter egg
    brandTapCount.current += 1;
    if (brandTapResetTimer.current) clearTimeout(brandTapResetTimer.current);
    if (brandTapCount.current >= 5) {
      brandTapCount.current = 0;
      setShowDogEgg(true);
    } else {
      brandTapResetTimer.current = setTimeout(() => { brandTapCount.current = 0; }, 2000);
    }
    navigate('/');
  };

  return (
    <View style={styles.app}>
      <Animated.View entering={headerEntrance} style={styles.header}>
        <View style={[styles.headerInner, compact && styles.headerInnerCompact]}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Go to overview"
            onPress={handleBrandPress}
            style={[styles.brand, narrowHeader && styles.brandNarrow]}>
            <Animated.View id="budget-brand-mark" entering={brandEntrance} style={[styles.brandMark, narrowHeader && styles.brandMarkNarrow]}>
              <CircleDollarSign color={BudgetColors.surface} size={22} strokeWidth={2.2} />
            </Animated.View>
            <View>
              <Text style={[styles.brandName, narrowHeader && styles.brandNameNarrow]}>HomeBudget</Text>
              {!compact && <Text style={styles.brandDetail}>Household ledger</Text>}
            </View>
          </Pressable>

          {compact ? (
            <View style={[styles.compactActions, narrowHeader && styles.compactActionsNarrow]}>
              {!narrowHeader && <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add paycheck"
                onPressIn={() => { dollarScale.value = withSpring(0.82, { damping: 14, stiffness: 300 }); }}
                onPressOut={() => { dollarScale.value = withSpring(1, { damping: 7, stiffness: 200 }); }}
                onPress={() => router.push(ADD_PAYCHECK)}
                style={({ pressed }) => [styles.compactPaycheckButton, pressed && styles.pressed]}>
                <Animated.View style={dollarStyle}>
                  <DollarSign color={BudgetColors.green} size={19} strokeWidth={2.5} />
                </Animated.View>
              </Pressable>}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add transaction"
                onPressIn={() => { plusScale.value = withSpring(0.82, { damping: 14, stiffness: 300 }); }}
                onPressOut={() => { plusScale.value = withSpring(1, { damping: 7, stiffness: 200 }); }}
                onPress={() => router.push('/add-transaction')}
                style={({ pressed }) => [styles.compactAddButton, pressed && styles.pressed]}>
                <Animated.View style={plusStyle}>
                  <Plus color={BudgetColors.surface} size={19} strokeWidth={2.5} />
                </Animated.View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open navigation menu"
                accessibilityState={{ expanded: menuOpen }}
                onPress={() => setMenuOpen(true)}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                <Animated.View style={menuIconStyle}>
                  <Menu color={BudgetColors.ink} size={21} />
                </Animated.View>
              </Pressable>
            </View>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.nav}
                contentContainerStyle={styles.navContent}>
                {desktopPrimaryNavItems.map((item) => {
                  const active = item.href === '/' ? pathname === '/' : pathname.startsWith(String(item.href));
                  return (
                    <DesktopNavItem
                      key={item.label}
                      item={item}
                      active={active}
                      onPress={() => navigate(item.href)}
                    />
                  );
                })}
                {desktopCollapsedNav && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open navigation menu"
                    accessibilityState={{ expanded: menuOpen }}
                    onPress={() => setMenuOpen(true)}
                    style={({ pressed }) => [styles.navItem, styles.navMoreButton, pressed && styles.pressed]}>
                    <Animated.View style={menuIconStyle}>
                      <Menu color={BudgetColors.muted} size={17} strokeWidth={2} />
                    </Animated.View>
                    <Text style={styles.navLabel}>More</Text>
                  </Pressable>
                )}
              </ScrollView>

              <View style={styles.headerActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add paycheck"
                  onPressIn={() => { dollarScale.value = withSpring(0.82, { damping: 14, stiffness: 300 }); }}
                  onPressOut={() => { dollarScale.value = withSpring(1, { damping: 7, stiffness: 200 }); }}
                  onPress={() => router.push(ADD_PAYCHECK)}
                  style={({ pressed }) => [styles.paycheckButton, pressed && styles.pressed]}>
                  <Animated.View style={dollarStyle}>
                    <DollarSign color={BudgetColors.green} size={19} strokeWidth={2.5} />
                  </Animated.View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add transaction"
                  onPressIn={() => { plusScale.value = withSpring(0.82, { damping: 14, stiffness: 300 }); }}
                  onPressOut={() => { plusScale.value = withSpring(1, { damping: 7, stiffness: 200 }); }}
                  onPress={() => router.push('/add-transaction')}
                  style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
                  <Animated.View style={plusStyle}>
                    <Plus color={BudgetColors.surface} size={18} strokeWidth={2.5} />
                  </Animated.View>
                  <Text style={styles.addButtonText}>Add transaction</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
                  onPress={() => { themeRot.value = withSpring(themeRot.value + 180, { damping: 16, stiffness: 200 }); toggleTheme(); }}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                  <Animated.View style={themeIconStyle}>
                    {mode === 'dark'
                      ? <Sun color={BudgetColors.ink} size={19} />
                      : <Moon color={BudgetColors.ink} size={19} />}
                  </Animated.View>
                </Pressable>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Open settings"
                  onPress={() => { settingsRot.value = withSequence(withTiming(25, { duration: 130 }), withSpring(0, { damping: 10, stiffness: 280 })); navigate('/settings'); }}
                  style={({ pressed }) => [
                    styles.iconButton,
                    pathname === '/settings' && styles.iconButtonActive,
                    pressed && styles.pressed,
                  ]}>
                  <Animated.View style={settingsIconStyle}>
                    <Settings color={BudgetColors.ink} size={19} />
                  </Animated.View>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </Animated.View>

      <Modal
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        statusBarTranslucent
        transparent
        visible={menuOpen && (compact || desktopCollapsedNav)}>
        <View style={[styles.menuOverlay, !compact && styles.menuOverlayDesktop]}>
          <Pressable
            accessibilityLabel="Close navigation menu"
            onPress={() => setMenuOpen(false)}
            style={styles.menuScrim}
          />
          <View style={[styles.mobileMenu, !compact && styles.desktopMenu]}>
            <View style={styles.mobileMenuHeader}>
              <View>
                <Text style={styles.mobileMenuEyebrow}>HomeBudget</Text>
                <Text style={styles.mobileMenuTitle}>{compact ? 'Menu' : 'More pages'}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close navigation menu"
                onPressIn={() => { closeScale.value = withSpring(0.82, { damping: 14, stiffness: 300 }); }}
                onPressOut={() => { closeScale.value = withSpring(1, { damping: 7, stiffness: 200 }); }}
                onPress={() => setMenuOpen(false)}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                <Animated.View style={closeStyle}>
                  <X color={BudgetColors.ink} size={21} />
                </Animated.View>
              </Pressable>
            </View>

            <View style={styles.mobileNav}>
              {mobileNavItems.map((item) => {
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(String(item.href));
                return (
                  <MobileNavItem
                    key={item.label}
                    item={item}
                    active={active}
                    onPress={() => navigate(item.href)}
                  />
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
              onPress={() => { themeRot.value = withSpring(themeRot.value + 180, { damping: 16, stiffness: 200 }); toggleTheme(); }}
              style={({ pressed }) => [styles.mobileThemeButton, pressed && styles.pressed]}>
              <Animated.View style={themeIconStyle}>
                <View style={styles.mobileThemeIcon}>
                  {mode === 'dark'
                    ? <Sun color={BudgetColors.gold} size={19} />
                    : <Moon color={BudgetColors.blue} size={19} />}
                </View>
              </Animated.View>
              <View style={styles.mobileThemeCopy}>
                <Text style={styles.mobileThemeTitle}>{mode === 'dark' ? 'Light mode' : 'Dark mode'}</Text>
                <Text style={styles.mobileThemeDetail}>Change the appearance on this device</Text>
              </View>
            </Pressable>

            <View style={styles.mobileAddRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add paycheck"
                onPressIn={() => { dollarScale.value = withSpring(0.82, { damping: 14, stiffness: 300 }); }}
                onPressOut={() => { dollarScale.value = withSpring(1, { damping: 7, stiffness: 200 }); }}
                onPress={() => {
                  setMenuOpen(false);
                  router.push(ADD_PAYCHECK);
                }}
                style={({ pressed }) => [styles.mobilePaycheckButton, pressed && styles.pressed]}>
                <Animated.View style={dollarStyle}>
                  <DollarSign color={BudgetColors.green} size={20} strokeWidth={2.5} />
                </Animated.View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPressIn={() => { plusScale.value = withSpring(0.82, { damping: 14, stiffness: 300 }); }}
                onPressOut={() => { plusScale.value = withSpring(1, { damping: 7, stiffness: 200 }); }}
                onPress={() => {
                  setMenuOpen(false);
                  router.push('/add-transaction');
                }}
                style={({ pressed }) => [styles.mobileAddButton, pressed && styles.pressed]}>
                <Animated.View style={plusStyle}>
                  <Plus color={BudgetColors.surface} size={19} strokeWidth={2.5} />
                </Animated.View>
                <Text style={styles.mobileAddButtonText}>Add transaction</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={() => setShowDogEgg(false)}
        statusBarTranslucent
        transparent
        visible={showDogEgg}>
        <Pressable style={styles.eggBackdrop} onPress={() => setShowDogEgg(false)}>
          <Animated.View entering={ZoomIn.duration(320).easing(Easing.out(Easing.back(1.4))).reduceMotion(ReduceMotion.System)}>
            <Pressable style={styles.eggCard} onPress={() => null}>
              <Image
                style={styles.eggPhoto}
                source={require('@/assets/images/dog-easter-egg.jpg')}
                contentFit="cover"
              />
              <Text style={styles.eggTitle}>Koda?! What are you doing here?</Text>
              <PawPrint color={BudgetColors.gold} size={18} style={styles.eggPaw} />
              <Pressable
                onPress={() => setShowDogEgg(false)}
                style={({ pressed }) => [styles.eggCloseButton, pressed && styles.pressed]}>
                <Text style={styles.eggCloseText}>Close</Text>
              </Pressable>
            </Pressable>
          </Animated.View>
        </Pressable>
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
  eggBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 24, 36, 0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  eggCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BudgetColors.line,
    backgroundColor: BudgetColors.surface,
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 8,
  },
  eggPhoto: {
    width: 180,
    height: 180,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BudgetColors.line,
    backgroundColor: BudgetColors.canvas,
    marginBottom: 6,
  },
  eggTitle: {
    color: BudgetColors.ink,
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '800',
  },
  eggDetail: {
    color: BudgetColors.muted,
    fontFamily: Fonts.sans,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  eggPaw: {
    marginTop: 2,
    marginBottom: 4,
    transform: [{ rotate: '18deg' }],
  },
  eggCloseButton: {
    marginTop: 6,
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BudgetColors.line,
    backgroundColor: BudgetColors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eggCloseText: {
    color: BudgetColors.ink,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '800',
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
  brandNarrow: {
    gap: 8,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BudgetColors.green,
  },
  brandMarkNarrow: {
    width: 34,
    height: 34,
  },
  brandName: {
    color: BudgetColors.ink,
    fontFamily: Fonts.serif,
    fontSize: 18,
    fontWeight: '700',
  },
  brandNameNarrow: {
    fontSize: 16,
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
  navMoreButton: {
    borderWidth: 1,
    borderColor: BudgetColors.line,
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
  compactActionsNarrow: {
    gap: 6,
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
  menuOverlayDesktop: {
    justifyContent: 'center',
    alignItems: 'flex-start',
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
  desktopMenu: {
    width: 360,
    maxWidth: '92%',
    height: 'auto',
    maxHeight: '78%',
    marginTop: 78,
    marginRight: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BudgetColors.line,
    borderLeftWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
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