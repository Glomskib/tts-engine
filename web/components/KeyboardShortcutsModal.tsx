'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, Keyboard, Command } from 'lucide-react';

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUTS: { category: string; shortcuts: Shortcut[] }[] = [
  {
    category: 'Go To (press G then...)',
    shortcuts: [
      { keys: ['G', 'P'], description: 'Pipeline' },
      { keys: ['G', 'C'], description: 'Content Studio' },
      { keys: ['G', 'W'], description: 'Winners Bank' },
      { keys: ['G', 'I'], description: 'Import' },
      { keys: ['G', 'A'], description: 'Analytics' },
      { keys: ['G', 'D'], description: 'Dashboard' },
      { keys: ['G', 'S'], description: 'Settings' },
    ],
  },
  {
    category: 'Actions',
    shortcuts: [
      { keys: ['N'], description: 'New script (Content Studio)' },
      { keys: ['⌘', 'K'], description: 'Open search' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
    ],
  },
  {
    category: 'General',
    shortcuts: [
      { keys: ['Esc'], description: 'Close any modal' },
      { keys: ['⌘', 'Enter'], description: 'Generate/Submit' },
    ],
  },
];

const GO_TO_MAP: Record<string, string> = {
  p: '/admin/pipeline',
  c: '/admin/content-studio',
  w: '/admin/winners-bank',
  i: '/admin/winners/import',
  a: '/admin/analytics',
  d: '/admin',
  s: '/admin/settings',
};

function isInputFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

export function KeyboardShortcutsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const gPendingRef = useRef(false);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't intercept when typing in inputs
    if (isInputFocused() && e.key !== 'Escape') return;

    // Escape closes any open modal
    if (e.key === 'Escape') {
      if (isOpen) setIsOpen(false);
      return;
    }

    // ? opens shortcuts help
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!isInputFocused()) {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
    }

    // G chord — first press sets pending, second press navigates
    if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey && !gPendingRef.current) {
      gPendingRef.current = true;
      // Clear after 1.5s if no second key
      if (gTimerRef.current) clearTimeout(gTimerRef.current);
      gTimerRef.current = setTimeout(() => { gPendingRef.current = false; }, 1500);
      return;
    }

    // G chord — second key
    if (gPendingRef.current) {
      gPendingRef.current = false;
      if (gTimerRef.current) clearTimeout(gTimerRef.current);
      const dest = GO_TO_MAP[e.key.toLowerCase()];
      if (dest) {
        e.preventDefault();
        setIsOpen(false);
        router.push(dest);
        return;
      }
    }

    // N — new script
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      router.push('/admin/content-studio');
      return;
    }
  }, [isOpen, router]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Keyboard className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
          </div>
          <button type="button"
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {SHORTCUTS.map((section) => (
            <div key={section.category}>
              <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
                {section.category}
              </h3>
              <div className="space-y-2">
                {section.shortcuts.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="text-zinc-300">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <span key={keyIdx} className="flex items-center">
                          <kbd className="px-2 py-1 text-xs font-medium bg-zinc-800 border border-zinc-700 rounded text-zinc-300">
                            {key === '⌘' ? (
                              <Command className="w-3 h-3 inline" />
                            ) : key}
                          </kbd>
                          {keyIdx < shortcut.keys.length - 1 && (
                            <span className="text-zinc-600 mx-1">then</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-900/50">
          <p className="text-xs text-zinc-500 text-center">
            Press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">?</kbd> anytime to show this dialog
          </p>
        </div>
      </div>
    </div>
  );
}

export default KeyboardShortcutsModal;
