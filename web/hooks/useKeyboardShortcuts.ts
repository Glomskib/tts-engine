'use client';

import { useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Shortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: () => void;
}

// Check if we're on Mac
const isMac = typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

// Global shortcuts for the app
export function useGlobalShortcuts() {
  const router = useRouter();
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  const shortcuts: Shortcut[] = [
    {
      key: 'g',
      ctrl: !isMac,
      meta: isMac,
      description: 'Go to Skit Generator',
      action: () => router.push('/admin/skit-generator'),
    },
    {
      key: 'l',
      ctrl: !isMac,
      meta: isMac,
      description: 'Go to Script Library',
      action: () => router.push('/admin/skit-library'),
    },
    {
      key: 'a',
      ctrl: !isMac,
      meta: isMac,
      description: 'Go to Audience',
      action: () => router.push('/admin/audience'),
    },
    {
      key: 'k',
      ctrl: !isMac,
      meta: isMac,
      description: 'Quick search (coming soon)',
      action: () => {
        // Placeholder for quick search
        console.log('Quick search not yet implemented');
      },
    },
    {
      key: '/',
      ctrl: !isMac,
      meta: isMac,
      description: 'Show keyboard shortcuts',
      action: () => setShowShortcutsModal(true),
    },
    {
      key: 'Escape',
      description: 'Close modal',
      action: () => setShowShortcutsModal(false),
    },
  ];

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Allow Escape to close modals even in inputs
      if (event.key !== 'Escape') {
        return;
      }
    }

    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl ? (isMac ? event.metaKey : event.ctrlKey) : true;
      const metaMatch = shortcut.meta ? event.metaKey : true;
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
      const altMatch = shortcut.alt ? event.altKey : !event.altKey;

      // Handle modifier key requirements
      const modifierRequired = shortcut.ctrl || shortcut.meta;
      const modifierPressed = event.ctrlKey || event.metaKey;

      if (
        event.key.toLowerCase() === shortcut.key.toLowerCase() &&
        (modifierRequired ? modifierPressed : !modifierPressed) &&
        shiftMatch &&
        altMatch
      ) {
        event.preventDefault();
        shortcut.action();
        return;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    showShortcutsModal,
    setShowShortcutsModal,
    shortcuts: shortcuts.filter(s => s.key !== 'Escape'), // Don't show Escape in the list
  };
}

// Format shortcut for display
export function formatShortcut(shortcut: Shortcut): string {
  const parts: string[] = [];

  if (shortcut.ctrl || shortcut.meta) {
    parts.push(isMac ? 'Cmd' : 'Ctrl');
  }
  if (shortcut.shift) {
    parts.push('Shift');
  }
  if (shortcut.alt) {
    parts.push(isMac ? 'Option' : 'Alt');
  }

  parts.push(shortcut.key.toUpperCase());

  return parts.join(' + ');
}

// Keyboard shortcuts modal component
export function KeyboardShortcutsModal({
  isOpen,
  onClose,
  shortcuts,
}: {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: Shortcut[];
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-zinc-900 rounded-2xl border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="p-4 space-y-3">
          {shortcuts.map((shortcut, index) => (
            <div
              key={index}
              className="flex items-center justify-between py-2"
            >
              <span className="text-sm text-zinc-300">{shortcut.description}</span>
              <kbd className="px-2 py-1 bg-zinc-800 border border-white/10 rounded text-xs font-mono text-zinc-400">
                {formatShortcut(shortcut)}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 text-center">
          <p className="text-xs text-zinc-500">
            Press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}
