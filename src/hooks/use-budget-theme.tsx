import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

export type BudgetThemeMode = 'light' | 'dark';

const BudgetThemeContext = createContext<{
  mode: BudgetThemeMode;
  toggle: () => void;
}>({ mode: 'light', toggle: () => undefined });

function applyWebTheme(mode: BudgetThemeMode) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
}

export function BudgetThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<BudgetThemeMode>(systemScheme === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('homebudget-theme');
    const initial = stored === 'light' || stored === 'dark'
      ? stored
      : window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    setMode(initial);
    applyWebTheme(initial);
  }, []);

  const toggle = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    applyWebTheme(next);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem('homebudget-theme', next);
    }
  };

  return <BudgetThemeContext.Provider value={{ mode, toggle }}>{children}</BudgetThemeContext.Provider>;
}

export function useBudgetTheme() {
  return useContext(BudgetThemeContext);
}