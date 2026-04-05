'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, Zap, ArrowRight, CheckCircle, TrendingUp } from 'lucide-react';
import { useUpgradeModal } from '@/contexts/UpgradeModalContext';

const UPGRADE_BULLETS = [
  'Unlimited scripts — no monthly cap',
  'Winners Bank: see what hooks are converting',
  'Production board + content calendar',
  'Multi-brand management (up to 10 brands)',
];

export function UpgradeModal() {
  const router = useRouter();
  const { state, hideUpgrade } = useUpgradeModal();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state.open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') hideUpgrade(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.open, hideUpgrade]);

  useEffect(() => {
    document.body.style.overflow = state.open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [state.open]);

  if (!state.open) return null;

  const handleUpgrade = () => {
    hideUpgrade();
    router.push('/admin/billing');
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === overlayRef.current) hideUpgrade(); }}
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      <div className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Gradient top bar */}
        <div className="h-1 w-full bg-gradient-to-r from-teal-500 via-violet-500 to-teal-500" />

        {/* Close — subtle so users read the modal first */}
        <button
          onClick={hideUpgrade}
          className="absolute top-4 right-4 p-1.5 text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 rounded-lg transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8">
          {/* Urgency badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 font-medium mb-5">
            <TrendingUp className="w-3 h-3" />
            Free tier limit reached
          </div>

          {/* Icon + headline */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-teal-400" />
            </div>
            <h2 className="text-xl font-bold text-white leading-tight">
              {state.headline}
            </h2>
          </div>

          <p className="text-zinc-400 text-sm mb-6 leading-relaxed pl-[52px]">
            {state.subtext}
          </p>

          {/* Bullets */}
          <ul className="space-y-2.5 mb-7">
            {UPGRADE_BULLETS.map(b => (
              <li key={b} className="flex items-start gap-2.5 text-sm text-zinc-300">
                <CheckCircle className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                {b}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <button
            onClick={handleUpgrade}
            className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white font-semibold rounded-xl transition-all text-sm shadow-lg shadow-teal-500/20"
          >
            Upgrade Now
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Price anchor */}
          <p className="text-center text-xs text-zinc-600 mt-3">
            Creator Lite starts at <span className="text-zinc-400">$9/month</span> · Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}
