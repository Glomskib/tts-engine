'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, Zap, ArrowRight, CheckCircle } from 'lucide-react';
import { useUpgradeModal } from '@/contexts/UpgradeModalContext';

const UPGRADE_BULLETS = [
  'Unlimited scripts every month',
  'Unlimited campaigns and launches',
  'Winners bank + pattern intelligence',
  'Priority support',
];

export function UpgradeModal() {
  const router = useRouter();
  const { state, hideUpgrade } = useUpgradeModal();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!state.open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') hideUpgrade(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.open, hideUpgrade]);

  // Prevent scroll lock issues
  useEffect(() => {
    if (state.open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
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
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Top accent */}
        <div className="h-1 w-full bg-gradient-to-r from-teal-500 via-violet-500 to-teal-500" />

        {/* Close */}
        <button
          onClick={hideUpgrade}
          className="absolute top-4 right-4 p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-5">
            <Zap className="w-6 h-6 text-teal-400" />
          </div>

          {/* Headline */}
          <h2 className="text-2xl font-bold text-white mb-2 leading-tight">
            {state.headline}
          </h2>
          <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
            {state.subtext}
          </p>

          {/* Bullets */}
          <ul className="space-y-2 mb-7">
            {UPGRADE_BULLETS.map(b => (
              <li key={b} className="flex items-center gap-2.5 text-sm text-zinc-300">
                <CheckCircle className="w-4 h-4 text-teal-400 shrink-0" />
                {b}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <button
            onClick={handleUpgrade}
            className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            Upgrade Now
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-center text-xs text-zinc-600 mt-3">
            Plans from $9/month · Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}
