'use client';

import { useState } from 'react';
import { Zap, X, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface UpsellBannerProps {
  creditsRemaining: number | undefined | null;
  threshold?: number;
}

/**
 * Shows a contextual upsell banner when credits are low.
 * Renders nothing if credits are above threshold or unlimited (-1).
 */
export default function UpsellBanner({ creditsRemaining, threshold = 5 }: UpsellBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [buying, setBuying] = useState(false);

  // Don't show if unlimited, above threshold, or dismissed
  if (dismissed) return null;
  if (creditsRemaining === undefined || creditsRemaining === null) return null;
  if (creditsRemaining === -1) return null;
  if (creditsRemaining > threshold) return null;

  const handleQuickBuy = async () => {
    setBuying(true);
    try {
      const res = await fetch('/api/billing/buy-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addonId: 'credits_25' }),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Fallback to billing page
      window.location.href = '/admin/billing';
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center gap-3 text-sm">
      <Zap className="w-4 h-4 text-amber-400 shrink-0" />
      <span className="text-amber-200">
        {creditsRemaining === 0 ? "You're out of credits!" : `Only ${creditsRemaining} credit${creditsRemaining === 1 ? '' : 's'} left!`}
      </span>
      <button
        onClick={handleQuickBuy}
        disabled={buying}
        className="ml-auto px-3 py-1 bg-amber-500 text-black text-xs font-semibold rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50 shrink-0"
      >
        {buying ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add 25 for $4.99'}
      </button>
      <Link
        href="/admin/billing"
        className="text-xs text-amber-400/70 hover:text-amber-300 shrink-0"
      >
        More options
      </Link>
      <button onClick={() => setDismissed(true)} className="text-amber-500/40 hover:text-amber-400 shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
