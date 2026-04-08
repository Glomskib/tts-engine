'use client';

/**
 * FirstWinBanner — FlashFlow Phase 3 onboarding.
 *
 * Dismissible top banner shown when a user has 0 pipeline items.
 * Walks them through the "first 30 minutes" win in 3 live-state steps:
 *   1. Generate your first script
 *   2. Approve & send to pipeline
 *   3. View it on the production board
 *
 * Auto-hides once all 3 are done and shows a one-time celebration toast.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Circle, X, Sparkles } from 'lucide-react';

const DISMISS_KEY = 'flashflow_first_win_dismissed';
const SHIPPED_KEY = 'flashflow_first_win_shipped';

interface Step {
  id: 1 | 2 | 3;
  label: string;
  href: string;
  done: boolean;
}

export function FirstWinBanner() {
  const [dismissed, setDismissed] = useState(true); // default hide until we read LS
  const [scriptsCount, setScriptsCount] = useState<number | null>(null);
  const [videosCount, setVideosCount] = useState<number | null>(null);
  const [shipped, setShipped] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    async function load() {
      try {
        const [sRes, vRes] = await Promise.all([
          fetch('/api/skits?limit=1', { credentials: 'include' }),
          fetch('/api/videos?limit=1', { credentials: 'include' }),
        ]);
        const sJson = sRes.ok ? await sRes.json().catch(() => null) : null;
        const vJson = vRes.ok ? await vRes.json().catch(() => null) : null;
        if (cancelled) return;
        setScriptsCount(sJson?.pagination?.total ?? (Array.isArray(sJson?.data) ? sJson.data.length : 0));
        setVideosCount(vJson?.pagination?.total ?? (Array.isArray(vJson?.data) ? vJson.data.length : 0));
      } catch {
        if (!cancelled) {
          setScriptsCount(0);
          setVideosCount(0);
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [dismissed]);

  const step1 = (scriptsCount ?? 0) > 0;
  const step2 = (videosCount ?? 0) > 0;
  const step3 = (videosCount ?? 0) > 0; // view is implicit once on board
  const allDone = step1 && step2 && step3;

  useEffect(() => {
    if (allDone && !shipped) {
      try {
        if (localStorage.getItem(SHIPPED_KEY) !== '1') {
          localStorage.setItem(SHIPPED_KEY, '1');
          localStorage.setItem(DISMISS_KEY, '1');
          setShipped(true);
          // Lightweight toast (no dep): rendered inline below briefly
        }
      } catch { /* ignore */ }
    }
  }, [allDone, shipped]);

  if (dismissed) return null;
  if (scriptsCount === null || videosCount === null) return null; // loading
  if (allDone && shipped) {
    return (
      <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300 flex items-center gap-2">
        <Sparkles className="w-4 h-4" />
        You shipped your first script! Welcome to FlashFlow.
        <button
          onClick={() => setDismissed(true)}
          className="ml-auto text-emerald-300/70 hover:text-emerald-200"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }
  if (videosCount > 0) return null; // user already has pipeline items — hide banner

  const steps: Step[] = [
    { id: 1, label: 'Generate your first script', href: '/admin/content-studio', done: step1 },
    { id: 2, label: 'Approve & send to pipeline', href: '/admin/content-studio', done: step2 },
    { id: 3, label: 'View it on the production board', href: '/admin/pipeline',   done: step3 },
  ];

  const onDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="mb-4 rounded-xl border border-teal-500/30 bg-gradient-to-r from-teal-500/10 to-violet-500/10 p-4 relative">
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 p-1 text-zinc-500 hover:text-zinc-300"
        aria-label="Dismiss onboarding banner"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-teal-400" />
        <h3 className="text-sm font-semibold text-white">Your first 30-minute win</h3>
      </div>
      <ol className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-2 flex-1">
            {s.done
              ? <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              : <Circle className="w-4 h-4 text-zinc-500 shrink-0" />}
            <Link
              href={s.href}
              className={`text-sm ${s.done ? 'text-zinc-400 line-through' : 'text-zinc-200 hover:text-white'}`}
            >
              {s.id}. {s.label}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
