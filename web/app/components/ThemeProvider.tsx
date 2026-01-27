'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = 'tts-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
    setMounted(true);
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (!mounted) return;

    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme, mounted]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Prevent flash of wrong theme
  if (!mounted) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// CSS variable getters for inline styles
export function getThemeColors(isDark: boolean) {
  return {
    // Backgrounds
    bg: isDark ? '#1a1a2e' : '#ffffff',
    bgSecondary: isDark ? '#16213e' : '#f8f9fa',
    bgTertiary: isDark ? '#0f3460' : '#e9ecef',
    bgHover: isDark ? '#1f4068' : '#f1f3f5',

    // Text
    text: isDark ? '#e4e4e4' : '#212529',
    textSecondary: isDark ? '#a0a0a0' : '#6c757d',
    textMuted: isDark ? '#666' : '#adb5bd',

    // Borders
    border: isDark ? '#2d2d44' : '#dee2e6',
    borderLight: isDark ? '#3d3d5c' : '#e9ecef',

    // Cards/Panels
    card: isDark ? '#1e1e3f' : '#ffffff',
    cardHover: isDark ? '#252550' : '#f8f9fa',

    // Table
    tableRow: isDark ? '#1a1a2e' : '#ffffff',
    tableRowAlt: isDark ? '#16213e' : '#f8f9fa',
    tableRowHover: isDark ? '#1f4068' : '#e9ecef',

    // Drawer
    drawer: isDark ? '#1a1a2e' : '#ffffff',
    drawerHeader: isDark ? '#16213e' : '#f8f9fa',

    // Input
    input: isDark ? '#16213e' : '#ffffff',
    inputBorder: isDark ? '#3d3d5c' : '#ced4da',
    inputFocus: isDark ? '#4dabf7' : '#228be6',

    // Status colors (kept consistent)
    success: '#40c057',
    warning: '#fab005',
    danger: '#e03131',
    info: '#228be6',
  };
}
