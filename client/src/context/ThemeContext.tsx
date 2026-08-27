import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'emerald' | 'sunset' | 'midnight';

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_KEY = 'edugen_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      const saved = localStorage.getItem(THEME_KEY) as ThemeMode;
      return saved && ['light', 'dark', 'emerald', 'sunset', 'midnight'].includes(saved)
        ? saved
        : 'light';
    } catch {
      return 'light';
    }
  });

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_KEY, newTheme);
    } catch {
      // ignore
    }
  };

  const isDarkMode = theme === 'dark' || theme === 'midnight';

  const toggleDarkMode = () => {
    setTheme(isDarkMode ? 'light' : 'dark');
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
