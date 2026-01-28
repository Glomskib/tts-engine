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

// CSS variable getters for inline styles - Ops Console Design System
export function getThemeColors(isDark: boolean) {
  return {
    // Core surfaces
    bg: isDark ? '#0B0F14' : '#F6F7F9',
    surface: isDark ? '#111827' : '#FFFFFF',
    surface2: isDark ? '#0F172A' : '#F0F2F5',

    // Legacy aliases for compatibility
    bgSecondary: isDark ? '#0F172A' : '#F0F2F5',
    bgTertiary: isDark ? '#0F172A' : '#F0F2F5',
    bgHover: isDark ? '#1F2937' : '#E5E7EB',

    // Typography
    text: isDark ? '#E5E7EB' : '#111827',
    textSecondary: isDark ? '#9CA3AF' : '#6B7280',
    textMuted: isDark ? '#6B7280' : '#9CA3AF',

    // Borders
    border: isDark ? '#1F2937' : '#E5E7EB',
    borderLight: isDark ? '#1F2937' : '#E5E7EB',

    // Accent
    accent: isDark ? '#2DD4BF' : '#0F766E',
    accentHover: isDark ? '#26BCA8' : '#0D6D66',
    accentSubtle: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(15, 118, 110, 0.08)',

    // Cards/Panels (use surface)
    card: isDark ? '#111827' : '#FFFFFF',
    cardHover: isDark ? '#1F2937' : '#F0F2F5',

    // Table
    tableRow: isDark ? '#111827' : '#FFFFFF',
    tableRowAlt: isDark ? '#0F172A' : '#F6F7F9',
    tableRowHover: isDark ? '#1F2937' : '#F0F2F5',

    // Drawer
    drawer: isDark ? '#111827' : '#FFFFFF',
    drawerHeader: isDark ? '#0F172A' : '#F6F7F9',

    // Input
    input: isDark ? '#0F172A' : '#FFFFFF',
    inputBorder: isDark ? '#1F2937' : '#E5E7EB',
    inputFocus: isDark ? '#2DD4BF' : '#0F766E',

    // Semantic status colors (use sparingly)
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: isDark ? '#2DD4BF' : '#0F766E',
  };
}
