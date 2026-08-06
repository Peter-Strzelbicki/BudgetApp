import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppShell } from '@/components/app-shell';
import { ConfirmProvider } from '@/components/budget-ui';
import { BudgetColors } from '@/constants/theme';
import { BudgetThemeProvider } from '@/hooks/use-budget-theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const theme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: BudgetColors.canvas,
      card: BudgetColors.surface,
      text: BudgetColors.ink,
      border: BudgetColors.line,
      primary: BudgetColors.green,
    },
  };

  return (
    <BudgetThemeProvider>
      <ThemeProvider value={theme}>
        <AnimatedSplashOverlay />
        <ConfirmProvider>
          <AppShell>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: BudgetColors.canvas },
              }}
            />
          </AppShell>
        </ConfirmProvider>
      </ThemeProvider>
    </BudgetThemeProvider>
  );
}