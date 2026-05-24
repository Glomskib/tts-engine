'use client';

/**
 * PricingCanonicalPill — small badge that signals to humans and crawlers
 * that THIS page (/pricing) is the source of truth for the FlashFlow
 * pricing ladder. Other surfaces (homepage features grid, /lp/*, referral
 * blocks) reference numbers; this is where the canonical $9 / $19 / $29 /
 * $59 / $149 ladder lives.
 *
 * Rendered as a quiet pill at the top of /pricing so first-time visitors
 * who landed via a stale screenshot or out-of-date marketing know they
 * have the current prices.
 */
import { CheckCircle2 } from 'lucide-react';

export function PricingCanonicalPill() {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium mb-4">
      <CheckCircle2 className="w-3 h-3" />
      Source of truth — latest pricing
    </div>
  );
}

export default PricingCanonicalPill;
