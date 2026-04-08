'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, ArrowRight, CheckCircle, TrendingUp, Star } from 'lucide-react';
import { useUpgradeModal } from '@/contexts/UpgradeModalContext';
import { PLANS, type PlanKey } from '@/lib/billing/plans';

const PLAN_ORDER: PlanKey[] = ['free', 'creator', 'pro'];

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

      <div className="relative w-full max-w-3xl bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Gradient top bar */}
        <div className="h-1 w-full bg-gradient-to-r from-teal-500 via-violet-500 to-teal-500" />

        {/* Close — subtle so users read the modal first */}
        <button
          onClick={hideUpgrade}
          className="absolute top-4 right-4 p-1.5 text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 rounded-lg transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8">
          {/* Urgency badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 font-medium mb-4">
            <TrendingUp className="w-3 h-3" />
            Keep the momentum going
          </div>

          {/* Headline + subtext straight from the trigger payload */}
          <h2 className="text-2xl font-bold text-white leading-tight mb-2">
            {state.headline}
          </h2>
          <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
            {state.subtext}
          </p>

          {/* 3-tier pricing grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {PLAN_ORDER.map((key) => {
              const plan = PLANS[key];
              const highlighted = key === 'creator';
              return (
                <div
                  key={key}
                  className={`relative rounded-xl p-4 border ${
                    highlighted
                      ? 'border-teal-500/60 bg-teal-500/5 shadow-lg shadow-teal-500/10'
                      : 'border-zinc-800 bg-zinc-950/60'
                  }`}
                >
                  {highlighted && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500 text-[10px] font-bold text-white uppercase tracking-wide">
                      <Star className="w-2.5 h-2.5" /> Most popular
                    </div>
                  )}
                  <div className="text-sm font-semibold text-white mb-1">{plan.name}</div>
                  <div className="flex items-baseline gap-1 mb-3">
                    <span className="text-2xl font-bold text-white">
                      ${plan.price}
                    </span>
                    <span className="text-xs text-zinc-500">/mo</span>
                  </div>
                  <ul className="space-y-1.5">
                    {plan.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-1.5 text-xs text-zinc-300 leading-snug">
                        <CheckCircle className={`w-3 h-3 shrink-0 mt-0.5 ${highlighted ? 'text-teal-400' : 'text-zinc-500'}`} />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Primary CTA */}
          <button
            onClick={handleUpgrade}
            className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white font-semibold rounded-xl transition-all text-sm shadow-lg shadow-teal-500/20"
          >
            Upgrade to Creator — $29/mo
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Secondary — weak, text-only */}
          <button
            onClick={hideUpgrade}
            className="w-full mt-2 py-2 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            Keep Free Plan
          </button>
        </div>
      </div>
    </div>
  );
}
