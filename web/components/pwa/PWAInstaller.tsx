'use client';

import { useEffect, useState } from 'react';
import { X, Share, Plus } from 'lucide-react';

const DISMISS_KEY = 'pwa.install.dismissed.until';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstaller() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (until > Date.now()) return;

    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const ua = window.navigator.userAgent || '';
    const isIos = /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);

    if (isIos) {
      const t = setTimeout(() => setShowIosHint(true), 6000);
      return () => clearTimeout(t);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const snooze = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_MS)); } catch {}
    setEvt(null); setShowIosHint(false);
  };

  if (evt) {
    return (
      <div className="fixed bottom-4 inset-x-4 z-40 max-w-sm mx-auto" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
        <div className="rounded-2xl bg-zinc-900/95 backdrop-blur border border-white/10 p-4 shadow-2xl flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Install FlashFlow Studio</div>
            <div className="text-[11px] text-zinc-400">Save to your home screen for one-tap record.</div>
          </div>
          <button onClick={snooze} className="p-1.5 text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          <button
            onClick={async () => {
              try { await evt.prompt(); await evt.userChoice; } finally { setEvt(null); }
            }}
            className="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-sm font-semibold"
          >Install</button>
        </div>
      </div>
    );
  }

  if (showIosHint) {
    return (
      <div className="fixed bottom-4 inset-x-4 z-40 max-w-sm mx-auto" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
        <div className="rounded-2xl bg-zinc-900/95 backdrop-blur border border-white/10 p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Save FlashFlow to your home screen</div>
              <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1 flex-wrap">
                Tap <Share className="w-3.5 h-3.5 inline" /> then <span className="font-medium text-white">Add to Home Screen</span> <Plus className="w-3.5 h-3.5 inline" />
              </div>
            </div>
            <button onClick={snooze} className="p-1.5 text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
