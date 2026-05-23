'use client';

import { Check } from 'lucide-react';

export function PricingCanonicalPill() {
  return (
    <div className="mx-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs mb-4">
      <Check className="w-3 h-3" /> Always-current pricing — this page is the source of truth
    </div>
  );
}