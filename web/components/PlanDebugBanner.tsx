'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCredits } from '@/hooks/useCredits';

const PLANS = [
  { id: 'free', label: 'Free', color: 'bg-zinc-600' },
  { id: 'creator_lite', label: 'Lite', color: 'bg-teal-600' },
  { id: 'creator_pro', label: 'Pro', color: 'bg-violet-600' },
  { id: 'brand', label: 'Brand', color: 'bg-amber-600' },
  { id: 'agency', label: 'Agency', color: 'bg-emerald-600' },
];

export function PlanDebugBanner() {
  const { user, role } = useAuth();
  const { subscription, credits, refetch } = useCredits();
  const [switching, setSwitching] = useState<string | null>(null);

  // Only show for test-* emails
  const email = user?.email || '';
  if (!email.startsWith('test-')) return null;

  const currentPlan = subscription?.planId || 'free';

  async function switchPlan(planId: string) {
    if (planId === currentPlan || switching) return;
    setSwitching(planId);
    try {
      const res = await fetch('/api/admin/test-accounts/switch-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      if (res.ok) {
        await refetch();
      }
    } catch {
      // ignore
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-zinc-900/95 backdrop-blur border-t border-yellow-500/30 px-4 py-2 flex items-center gap-3 text-xs font-mono">
      <span className="text-yellow-400 font-bold shrink-0">TEST</span>
      <span className="text-zinc-400 truncate">
        {currentPlan} | Credits: {credits?.remaining ?? '?'} | Role: {role || 'creator'}
      </span>
      <div className="flex items-center gap-1 ml-auto shrink-0">
        {PLANS.map((plan) => (
          <button
            key={plan.id}
            onClick={() => switchPlan(plan.id)}
            disabled={plan.id === currentPlan || switching !== null}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition-all
              ${plan.id === currentPlan
                ? `${plan.color} text-white ring-2 ring-white/40`
                : `${plan.color}/30 text-zinc-400 hover:text-white hover:${plan.color}/60`
              }
              ${switching === plan.id ? 'animate-pulse' : ''}
              disabled:opacity-40 disabled:cursor-default
            `}
          >
            {plan.label}
          </button>
        ))}
      </div>
    </div>
  );
}
