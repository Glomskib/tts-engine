'use client';

/**
 * PWAInstallPrompt — smart "Install FlashFlow" banner.
 *
 * 2026-05-31: manifest is already set, start_url is /home, theme color
 * matches. Adding a subtle dismissible banner that appears on a user's
 * SECOND visit (not first — too pushy) and only if they haven't already
 * installed or dismissed it.
 *
 * Behaviour:
 *   • Listens for the `beforeinstallprompt` event (Chrome, Edge, Android).
 *   • iOS Safari doesn't fire that event; we show a hand-rolled "tap Share →
 *     Add to Home Screen" tip instead (only on iOS, only on 2nd+ visit).
 *   • If user dismisses, suppress for 30 days via localStorage.
 *   • If user installs, the banner won't reappear (display-mode: standalone).
 *
 * No external libs; this is intentionally tiny so it never blocks render.
 */

import { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const VISITS_KEY = 'ff_pwa_visits';
const DISMISSED_KEY = 'ff_pwa_dismissed_at';
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function isRecentlyDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const ts = parseInt(localStorage.getItem(DISMISSED_KEY) || '0', 10);
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch { return false; }
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosTip, setShowIosTip] = useState(false);
  const [visible, setVisible] = useState(false);

  // Track visits + decide whether to show on this load
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone()) return;                   // already installed
    if (isRecentlyDismissed()) return;            // recently dismissed

    let visits = 0;
    try {
      visits = parseInt(localStorage.getItem(VISITS_KEY) || '0', 10) || 0;
      localStorage.setItem(VISITS_KEY, String(visits + 1));
    } catch { /* private mode — best effort */ }

    // Show on 2nd visit or later
    if (visits + 1 < 2) return;

    if (isIos()) {
      setShowIosTip(true);
      setVisible(true);
    }
    // Chrome/Edge/Android: wait for beforeinstallprompt event below
  }, []);

  // Listen for the native install prompt
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone() || isRecentlyDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* best effort */ }
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setVisible(false);
    } else {
      dismiss();
    }
    setDeferredPrompt(null);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-3 z-50 rounded-2xl border border-teal-500/40 bg-zinc-900/95 backdrop-blur shadow-2xl shadow-teal-500/10 px-4 py-3 flex items-center gap-3 sm:left-auto sm:right-4 sm:max-w-sm"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0) + 76px)' }}
      role="dialog"
      aria-label="Install FlashFlow"
    >
      <Smartphone className="w-5 h-5 text-teal-300 shrink-0" />
      <div className="flex-1 min-w-0 text-sm">
        <div className="font-semibold text-white">Install FlashFlow</div>
        <div className="text-[11px] text-zinc-400 leading-snug">
          {showIosTip
            ? <>Tap <span className="font-semibold text-zinc-200">Share → Add to Home Screen</span> for the fastest open.</>
            : <>One tap to open, no browser tabs.</>}
        </div>
      </div>
      {!showIosTip && (
        <button
          type="button"
          onClick={install}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-zinc-900 text-xs font-semibold"
        >
          Install
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="shrink-0 p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
