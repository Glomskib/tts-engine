'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Zap, AlertTriangle, ArrowRight } from 'lucide-react';

interface UsageData {
  scripts_used: number;
  scripts_limit: number;
  plan_id: string;
  plan_name: string;
  credits_remaining: number;
}

function pct(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function barColor(p: number): string {
  if (p >= 90) return 'bg-red-500';
  if (p >= 70) return 'bg-amber-500';
  return 'bg-teal-500';
}

export function UsageMeter() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/usage/summary', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.ok) setUsage(j.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !usage) return null;

  const isUnlimited = usage.scripts_limit === -1;
  const scriptsPct = isUnlimited ? 0 : pct(usage.scripts_used, usage.scripts_limit);
  const nearLimit = !isUnlimited && scriptsPct >= 70;
  const atLimit = !isUnlimited && scriptsPct >= 100;

  return (
    <div className={`rounded-xl border p-4 ${atLimit ? 'border-red-500/30 bg-red-500/5' : nearLimit ? 'border-amber-500/20 bg-amber-500/5' : 'border-white/5 bg-zinc-900/50'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${atLimit ? 'text-red-400' : nearLimit ? 'text-amber-400' : 'text-teal-400'}`} />
          <span className="text-sm font-medium text-zinc-300">
            {usage.plan_name} Plan
          </span>
        </div>
        <Link
          href="/admin/billing"
          className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1"
        >
          {atLimit ? 'Upgrade required' : nearLimit ? 'Upgrade' : 'Manage'}
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-2.5">
        {/* Scripts */}
        <div>
          <div className="flex justify-between text-xs text-zinc-500 mb-1">
            <span>Scripts this month</span>
            <span className={atLimit ? 'text-red-400 font-medium' : nearLimit ? 'text-amber-400' : 'text-zinc-400'}>
              {isUnlimited ? `${usage.scripts_used} / ∞` : `${usage.scripts_used} / ${usage.scripts_limit}`}
            </span>
          </div>
          {!isUnlimited && (
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor(scriptsPct)}`}
                style={{ width: `${scriptsPct}%` }}
              />
            </div>
          )}
        </div>

        {/* Credits */}
        <div className="flex justify-between text-xs text-zinc-500">
          <span>AI credits remaining</span>
          <span className={usage.credits_remaining <= 3 ? 'text-red-400 font-medium' : 'text-zinc-400'}>
            {usage.credits_remaining === -1 ? '∞' : usage.credits_remaining}
          </span>
        </div>
      </div>

      {(atLimit || nearLimit) && (
        <div className={`mt-3 flex items-start gap-2 text-xs rounded-lg p-2.5 ${atLimit ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'}`}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {atLimit
              ? "You've hit your limit. Upgrade to keep creating."
              : `You've used ${scriptsPct}% of your monthly quota.`}
          </span>
        </div>
      )}
    </div>
  );
}
