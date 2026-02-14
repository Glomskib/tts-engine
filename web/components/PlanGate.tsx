'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { Lock, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  creator_lite: 'Creator Lite',
  creator_pro: 'Creator Pro',
  pro: 'Creator Pro', // legacy alias
  brand: 'Brand',
  agency: 'Agency',
};

const PLAN_PRICES: Record<string, number> = {
  free: 0,
  creator_lite: 9,
  creator_pro: 29,
  brand: 49,
  agency: 149,
};

const PLAN_RANK: Record<string, number> = {
  free: 0,
  creator_lite: 1,
  creator_pro: 2,
  pro: 2, // legacy alias — maps to creator_pro level
  brand: 3,
  agency: 4,
};

interface PlanGateProps {
  minPlan: string;
  feature: string;
  children: ReactNode;
  adminOnly?: boolean;
}

export default function PlanGate({ minPlan, feature, children, adminOnly }: PlanGateProps) {
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/plan-status')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setUserPlan(data.data.plan);
          setIsAdmin(data.data.isAdmin);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  // Admins always pass
  if (isAdmin) return <>{children}</>;

  // Admin-only gate
  if (adminOnly) {
    return <UpgradeCard feature={feature} requiredPlan="admin" currentPlan={userPlan || 'free'} />;
  }

  // Plan-level gate
  const userRank = PLAN_RANK[userPlan || 'free'] ?? 0;
  const requiredRank = PLAN_RANK[minPlan] ?? 0;

  if (userRank >= requiredRank) {
    return <>{children}</>;
  }

  return <UpgradeCard feature={feature} requiredPlan={minPlan} currentPlan={userPlan || 'free'} />;
}

function UpgradeCard({ feature, requiredPlan, currentPlan }: { feature: string; requiredPlan: string; currentPlan: string }) {
  const planName = requiredPlan === 'admin' ? 'Admin' : (PLAN_LABELS[requiredPlan] || requiredPlan);
  const currentName = PLAN_LABELS[currentPlan] || currentPlan;
  const price = PLAN_PRICES[requiredPlan];
  const priceLabel = price ? `$${price}/mo` : '';

  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
        <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6 text-amber-400" />
        </div>

        <h2 className="text-xl font-bold text-white">
          {feature}
        </h2>

        <p className="text-sm text-zinc-400">
          This feature requires the <span className="text-white font-medium">{planName}</span> plan
          {requiredPlan !== 'admin' && ' or higher'}.
          {priceLabel && (
            <span className="text-zinc-500"> ({priceLabel})</span>
          )}
        </p>

        <div className="flex items-center justify-center gap-3 text-sm">
          <span className="px-3 py-1 bg-zinc-800 rounded-full text-zinc-400">
            Current: {currentName}
          </span>
          <ArrowRight className="w-4 h-4 text-zinc-600" />
          <span className="px-3 py-1 bg-purple-500/20 rounded-full text-purple-400">
            {planName}{priceLabel && ` — ${priceLabel}`}
          </span>
        </div>

        {requiredPlan !== 'admin' && (
          <Link
            href="/admin/billing"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-500 transition-colors mt-2"
          >
            Upgrade to {planName}{priceLabel && ` (${priceLabel})`}
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
