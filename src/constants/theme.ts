/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

function themeColor(variable: string, fallback: string) {
  return Platform.OS === 'web' ? `var(--budget-${variable}, ${fallback})` : fallback;
}

export const Colors = {
  light: {
    text: '#172019',
    background: '#F3F5F0',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E2EDE6',
    textSecondary: '#667069',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export const BudgetColors = {
  canvas: themeColor('canvas', '#F3F5F0'),
  surface: themeColor('surface', '#FFFFFF'),
  ink: themeColor('ink', '#172019'),
  muted: themeColor('muted', '#667069'),
  faint: themeColor('faint', '#8C958F'),
  line: themeColor('line', '#DDE2DC'),
  green: themeColor('green', '#236B53'),
  greenSoft: themeColor('green-soft', '#E2EDE6'),
  coral: themeColor('coral', '#C85B3F'),
  coralSoft: themeColor('coral-soft', '#F7E5DF'),
  gold: themeColor('gold', '#D6A63A'),
  goldSoft: themeColor('gold-soft', '#F8EFD7'),
  blue: themeColor('blue', '#3E6F8E'),
  blueSoft: themeColor('blue-soft', '#E1EBF0'),
  successLine: themeColor('success-line', '#C6DCCA'),
  dangerLine: themeColor('danger-line', '#EDC6B9'),
  infoLine: themeColor('info-line', '#C8DCE6'),
  warningLine: themeColor('warning-line', '#E9D499'),
  warningSurface: themeColor('warning-surface', '#FFFCF4'),
  warningInk: themeColor('warning-ink', '#8A6516'),
  warningDivider: themeColor('warning-divider', '#F0E4C4'),
  bar: themeColor('bar', '#AFC8BA'),
  barFuture: themeColor('bar-future', '#E8ECE7'),
  scrim: themeColor('scrim', 'rgba(23, 32, 25, 0.38)'),
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 1180;
