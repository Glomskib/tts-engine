'use client';

import { useEffect, useCallback } from 'react';

type ModifierKey = 'ctrl' | 'alt' | 'shift' | 'meta';

interface ShortcutConfig {
  /** The key to listen for (e.g., 'k', 'Enter', 'Escape') */
  key: string;
  /** Modifier keys required (ctrl, alt, shift, meta) */
  modifiers?: ModifierKey[];
  /** Callback when shortcut is triggered */
  handler: (e: KeyboardEvent) => void;
  /** Whether to prevent default browser behavior */
  preventDefault?: boolean;
  /** Whether shortcut is enabled */
  enabled?: boolean;
  /** Description for help dialogs */
  description?: string;
}

/**
 * Hook for handling keyboard shortcuts
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        if (shortcut.enabled === false) continue;

        const modifiers = shortcut.modifiers || [];
        const ctrlRequired = modifiers.includes('ctrl');
        const altRequired = modifiers.includes('alt');
        const shiftRequired = modifiers.includes('shift');
        const metaRequired = modifiers.includes('meta');

        // Check if all required modifiers are pressed
        const ctrlMatch = ctrlRequired ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
        const altMatch = altRequired ? e.altKey : !e.altKey;
        const shiftMatch = shiftRequired ? e.shiftKey : !e.shiftKey;
        const metaMatch = metaRequired ? e.metaKey : true; // Meta is optional by default

        // Check if key matches (case insensitive for letters)
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

        // Allow global shortcuts (with modifiers) even in inputs
        const hasModifiers = ctrlRequired || altRequired || metaRequired;
        const shouldTrigger = (hasModifiers || !isInput) && keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch;

        if (shouldTrigger) {
          if (shortcut.preventDefault !== false) {
            e.preventDefault();
          }
          shortcut.handler(e);
          return;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Hook for a single keyboard shortcut
 */
export function useKeyboardShortcut(
  key: string,
  handler: (e: KeyboardEvent) => void,
  options: Omit<ShortcutConfig, 'key' | 'handler'> = {}
) {
  useKeyboardShortcuts([{ key, handler, ...options }]);
}

/**
 * Hook for Escape key handling
 */
export function useEscapeKey(handler: () => void, enabled = true) {
  useKeyboardShortcut('Escape', handler, { enabled, preventDefault: true });
}

/**
 * Hook for Enter key handling
 */
export function useEnterKey(handler: () => void, enabled = true) {
  useKeyboardShortcut('Enter', handler, { enabled });
}

/**
 * Common keyboard shortcut definitions
 */
export const commonShortcuts = {
  /** Cmd/Ctrl + K - Search/Command palette */
  search: { key: 'k', modifiers: ['ctrl'] as ModifierKey[] },
  /** Cmd/Ctrl + S - Save */
  save: { key: 's', modifiers: ['ctrl'] as ModifierKey[] },
  /** Cmd/Ctrl + Enter - Submit */
  submit: { key: 'Enter', modifiers: ['ctrl'] as ModifierKey[] },
  /** Cmd/Ctrl + N - New */
  new: { key: 'n', modifiers: ['ctrl'] as ModifierKey[] },
  /** Escape - Close/Cancel */
  close: { key: 'Escape', modifiers: [] as ModifierKey[] },
  /** Cmd/Ctrl + Z - Undo */
  undo: { key: 'z', modifiers: ['ctrl'] as ModifierKey[] },
  /** Cmd/Ctrl + Shift + Z - Redo */
  redo: { key: 'z', modifiers: ['ctrl', 'shift'] as ModifierKey[] },
};

/**
 * Format shortcut for display (e.g., "Ctrl+K" or "⌘K")
 */
export function formatShortcut(modifiers: ModifierKey[], key: string, useMacSymbols = false): string {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
  const shouldUseMacSymbols = useMacSymbols && isMac;

  const modifierSymbols: Record<ModifierKey, string> = shouldUseMacSymbols
    ? { ctrl: '⌘', alt: '⌥', shift: '⇧', meta: '⌘' }
    : { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta' };

  const parts = modifiers.map((m) => modifierSymbols[m]);
  parts.push(key.toUpperCase());

  return shouldUseMacSymbols ? parts.join('') : parts.join('+');
}

/**
 * Keyboard shortcut display badge
 */
export function ShortcutBadge({
  modifiers = [],
  shortcutKey,
  className = '',
}: {
  modifiers?: ModifierKey[];
  shortcutKey: string;
  className?: string;
}) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

  const symbols: Record<ModifierKey, string> = isMac
    ? { ctrl: '⌘', alt: '⌥', shift: '⇧', meta: '⌘' }
    : { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Win' };

  return (
    <kbd className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded text-zinc-400 ${className}`}>
      {modifiers.map((m) => (
        <span key={m}>{symbols[m]}</span>
      ))}
      <span>{shortcutKey.toUpperCase()}</span>
    </kbd>
  );
}
