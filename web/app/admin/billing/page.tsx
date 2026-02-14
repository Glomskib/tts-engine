'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCredits } from '@/hooks/useCredits';
import {
  Check, Minus, Zap, CreditCard, ExternalLink, Loader2, CheckCircle2, XCircle,
  Plus, Coins, TrendingUp, Package, Clock, PieChart, Sparkles, Infinity,
} from 'lucide-react';
import { PLANS_LIST } from '@/lib/plans';
import type { PlanLimitKey } from '@/lib/plans';
import UpsellBanner from '@/components/UpsellBanner';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

interface UsageItem {
  action: string;
  total: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CREDIT_ADDONS = [
  { id: 'credits_25', name: '25 Credits', price: 499, credits: 25 },
  { id: 'credits_100', name: '100 Credits', price: 1499, credits: 100, popular: true },
  { id: 'credits_500', name: '500 Credits', price: 4999, credits: 500 },
];

const PLAN_ORDER = ['free', 'creator_lite', 'creator_pro', 'brand', 'agency'] as const;

const PIE_COLORS: Record<string, string> = {
  generation: '#14b8a6',
  purchase: '#10b981',
  bonus: '#a855f7',
  subscription_renewal: '#3b82f6',
  refund: '#f59e0b',
  other: '#71717a',
};

const PIE_LABELS: Record<string, string> = {
  generation: 'Scripts & Content',
  purchase: 'Purchases',
  bonus: 'Bonuses',
  subscription_renewal: 'Renewals',
  refund: 'Refunds',
  other: 'Other',
};

const CREDIT_COSTS = [
  { name: 'B-Roll Image', cost: 2, icon: '🖼️' },
  { name: 'Script Generation', cost: 3, icon: '📝' },
  { name: 'Script Refinement', cost: 1, icon: '✨' },
  { name: 'Winner Analysis', cost: 2, icon: '🏆' },
];

// Feature comparison rows for plan cards
interface FeatureRow {
  label: string;
  key: PlanLimitKey;
  /** For numeric limits, format the value (e.g. "3", "20", "Unlimited") */
  numeric?: boolean;
}

const COMPARISON_FEATURES: FeatureRow[] = [
  { label: 'Products', key: 'products', numeric: true },
  { label: 'Script Library', key: 'scriptLibrary' },
  { label: 'Script of the Day', key: 'scriptOfTheDay' },
  { label: 'Winners Bank', key: 'winnersBank' },
  { label: 'Winner Patterns', key: 'winnerPatterns' },
  { label: 'Custom Personas', key: 'customPersonas' },
  { label: 'Production Board', key: 'productionBoard' },
  { label: 'Content Calendar', key: 'contentCalendar' },
  { label: 'Analytics', key: 'analytics' },
  { label: 'Templates', key: 'templates' },
  { label: 'Content Packages', key: 'contentPackages' },
  { label: 'Referrals', key: 'referrals' },
  { label: 'API Access', key: 'apiAccess' },
];

function formatLimitValue(value: number | boolean): string {
  if (typeof value === 'boolean') return '';
  if (value === -1) return 'Unlimited';
  if (value === 0) return '—';
  return String(value);
}

// ─── Usage Pie Chart ────────────────────────────────────────────────────────

function UsagePieChart({ data }: { data: UsageItem[] }) {
  const total = data.reduce((s, d) => s + d.total, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
        No usage data yet
      </div>
    );
  }

  let cumulative = 0;
  const slices = data.map((item) => {
    const pct = item.total / total;
    const startAngle = cumulative * 2 * Math.PI;
    cumulative += pct;
    const endAngle = cumulative * 2 * Math.PI;
    const largeArc = pct > 0.5 ? 1 : 0;
    const x1 = 50 + 40 * Math.sin(startAngle);
    const y1 = 50 - 40 * Math.cos(startAngle);
    const x2 = 50 + 40 * Math.sin(endAngle);
    const y2 = 50 - 40 * Math.cos(endAngle);
    const color = PIE_COLORS[item.action] || PIE_COLORS.other;

    if (data.length === 1) {
      return <circle key={item.action} cx="50" cy="50" r="40" fill={color} />;
    }

    return (
      <path
        key={item.action}
        d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
        fill={color}
      />
    );
  });

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-32 h-32 shrink-0">
        {slices}
        <circle cx="50" cy="50" r="22" fill="#09090b" />
        <text x="50" y="48" textAnchor="middle" className="fill-white text-[10px] font-bold">
          {total}
        </text>
        <text x="50" y="58" textAnchor="middle" className="fill-zinc-500 text-[6px]">
          credits
        </text>
      </svg>
      <div className="space-y-2 flex-1">
        {data.map((item) => {
          const color = PIE_COLORS[item.action] || PIE_COLORS.other;
          const label = PIE_LABELS[item.action] || item.action;
          const pct = Math.round((item.total / total) * 100);
          return (
            <div key={item.action} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-sm text-zinc-300 flex-1">{label}</span>
              <span className="text-sm font-medium text-zinc-400">{item.total}</span>
              <span className="text-xs text-zinc-600 w-10 text-right">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function BillingPage() {
  const searchParams = useSearchParams();
  const { credits, subscription, isLoading, refetch } = useCredits();
  // Checkout / portal state
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [buyCreditsLoading, setBuyCreditsLoading] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    type: 'success' | 'canceled' | 'credits';
    plan?: string;
    credits?: string;
  } | null>(null);

  // Transaction + usage state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [usageBreakdown, setUsageBreakdown] = useState<UsageItem[]>([]);
  const [loadingBreakdown, setLoadingBreakdown] = useState(true);

  // ── Stripe redirect banners ───────────────────────────────────────────────
  useEffect(() => {
    if (searchParams.get('upgraded') === 'true') {
      setBanner({ type: 'success', plan: searchParams.get('plan') || undefined });
      refetch();
    } else if (searchParams.get('credits_purchased')) {
      setBanner({ type: 'credits', credits: searchParams.get('credits_purchased') || undefined });
      refetch();
    } else if (searchParams.get('canceled') === 'true') {
      setBanner({ type: 'canceled' });
    }
  }, [searchParams, refetch]);

  // ── Fetch transactions ────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchTransactions() {
      try {
        const res = await fetch('/api/credits/transactions');
        const data = await res.json();
        if (data.ok) setTransactions(data.transactions);
      } catch (err) {
        console.error('Failed to fetch transactions:', err);
      } finally {
        setLoadingTransactions(false);
      }
    }
    fetchTransactions();
  }, []);

  // ── Fetch usage breakdown ─────────────────────────────────────────────────
  useEffect(() => {
    async function fetchBreakdown() {
      try {
        const res = await fetch('/api/credits/usage-breakdown');
        const data = await res.json();
        if (data.ok) setUsageBreakdown(data.breakdown);
      } catch (err) {
        console.error('Failed to fetch usage breakdown:', err);
      } finally {
        setLoadingBreakdown(false);
      }
    }
    fetchBreakdown();
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSubscribe = async (planId: string) => {
    if (planId === 'free' || planId === currentPlanId) return;
    setCheckoutLoading(planId);
    setCheckoutError(null);
    try {
      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Checkout failed');
      if (!data.url) throw new Error('No checkout URL received');
      window.location.href = data.url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Failed to start checkout');
      setCheckoutLoading(null);
    }
  };

  const handleBuyCredits = async (addonId: string) => {
    setBuyCreditsLoading(addonId);
    setCheckoutError(null);
    try {
      const res = await fetch('/api/billing/buy-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addonId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Checkout failed');
      if (!data.url) throw new Error('No checkout URL');
      window.location.href = data.url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Failed to start checkout');
      setBuyCreditsLoading(null);
    }
  };

  const handleOpenPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/subscriptions/portal', { method: 'POST' });
      const data = await res.json();
      if (data.ok && data.url) {
        window.open(data.url, '_blank');
      } else {
        setCheckoutError(data.error || 'Failed to open billing portal');
      }
    } catch {
      setCheckoutError('Failed to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  };

  // ── Computed values ───────────────────────────────────────────────────────

  const currentPlanId = subscription?.planId || 'free';
  const currentPlanIndex = PLAN_ORDER.indexOf(currentPlanId as typeof PLAN_ORDER[number]);
  const isUnlimited = credits?.remaining === -1 || credits?.isUnlimited;

  const daysUntilReset = useMemo(() => {
    const periodEnd = credits?.periodEnd || subscription?.periodEnd;
    if (!periodEnd) return null;
    const end = new Date(periodEnd);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : null;
  }, [credits?.periodEnd, subscription?.periodEnd]);

  // ── Helper functions ──────────────────────────────────────────────────────

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'generation':
        return <Zap className="w-4 h-4 text-amber-400" />;
      case 'purchase':
        return <Package className="w-4 h-4 text-emerald-400" />;
      case 'bonus':
        return <Sparkles className="w-4 h-4 text-teal-400" />;
      case 'subscription_renewal':
        return <TrendingUp className="w-4 h-4 text-teal-400" />;
      default:
        return <Coins className="w-4 h-4 text-zinc-400" />;
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto pb-24 lg:pb-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Billing & Credits</h1>
        <p className="text-zinc-500 mt-1">Manage your plan, credits, and usage</p>
      </div>

      {/* Upsell Banner */}
      {!isUnlimited && (
        <div className="mb-6">
          <UpsellBanner creditsRemaining={credits?.remaining} />
        </div>
      )}

      {/* ── Banners (Stripe redirects) ───────────────────────────────────── */}
      {banner?.type === 'success' && (
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-teal-300">Welcome to your new plan!</p>
            <p className="text-xs text-teal-400/70 mt-0.5">Your credits have been updated. It may take a moment to reflect.</p>
          </div>
          <button type="button" onClick={() => setBanner(null)} className="ml-auto text-teal-500/50 hover:text-teal-400">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}
      {banner?.type === 'credits' && (
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-teal-300">{banner.credits} credits added!</p>
            <p className="text-xs text-teal-400/70 mt-0.5">Your credits have been topped up.</p>
          </div>
          <button type="button" onClick={() => setBanner(null)} className="ml-auto text-teal-500/50 hover:text-teal-400">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}
      {banner?.type === 'canceled' && (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 mb-6 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-zinc-500 shrink-0" />
          <p className="text-sm text-zinc-400">Checkout was canceled. No changes were made.</p>
          <button type="button" onClick={() => setBanner(null)} className="ml-auto text-zinc-600 hover:text-zinc-400">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}
      {checkoutError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-400">{checkoutError}</p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1 — CURRENT PLAN
          ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-teal-400" />
              <span className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Current Plan</span>
            </div>
            <h2 className="text-xl font-bold text-white">
              {subscription?.planName || 'Free'}
            </h2>
            {subscription?.status && subscription.status !== 'active' && (
              <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400 font-medium">
                {subscription.status.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          <div className="text-right">
            <div className="text-sm text-zinc-500">Credits remaining</div>
            <div className="text-2xl font-bold text-white">
              {isUnlimited ? 'Unlimited' : (credits?.remaining ?? 0)}
            </div>
            {!isUnlimited && subscription?.creditsPerMonth && subscription.creditsPerMonth > 0 && (
              <div className="text-xs text-zinc-600 mt-0.5">
                of {subscription.creditsPerMonth}/month
              </div>
            )}
          </div>
        </div>

        {/* Usage bar */}
        {!isUnlimited && subscription?.creditsPerMonth && subscription.creditsPerMonth > 0 && (
          <div className="mt-4">
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, ((credits?.usedThisPeriod ?? 0) / subscription.creditsPerMonth) * 100)}%`,
                }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-zinc-600">{credits?.usedThisPeriod ?? 0} used</span>
              <span className="text-xs text-zinc-600">{subscription.creditsPerMonth} total</span>
            </div>
          </div>
        )}

        {subscription?.currentPeriodEnd && (
          <p className="text-xs text-zinc-600 mt-3">
            Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
              month: 'long', day: 'numeric', year: 'numeric',
            })}
          </p>
        )}

        {subscription?.stripeCustomerId && (
          <button
            type="button"
            onClick={handleOpenPortal}
            disabled={portalLoading}
            className="inline-flex items-center gap-1.5 mt-3 text-xs text-teal-400 hover:text-teal-300 transition-colors disabled:opacity-50"
          >
            {portalLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
            Manage subscription
          </button>
        )}
      </div>

      {/* Plan comparison cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {PLANS_LIST.filter(p => p.id !== 'free').map((plan) => {
          const limits = plan.limits as Record<PlanLimitKey, number | boolean>;
          const planIndex = PLAN_ORDER.indexOf(plan.id as typeof PLAN_ORDER[number]);
          const isCurrent = plan.id === currentPlanId;
          const isDowngrade = planIndex < currentPlanIndex;
          const isPopular = 'popular' in plan && plan.popular;

          return (
            <div
              key={plan.id}
              className={`relative bg-zinc-900 border rounded-xl p-5 flex flex-col ${
                isCurrent
                  ? 'border-teal-500/50 ring-1 ring-teal-500/20'
                  : isPopular
                  ? 'border-violet-500/50'
                  : 'border-zinc-800'
              }`}
            >
              {isPopular && !isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-violet-500 text-white text-xs font-semibold rounded-full">
                  Most Popular
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-teal-500 text-white text-xs font-semibold rounded-full">
                  Current Plan
                </div>
              )}

              <h3 className="text-lg font-bold text-white mt-1">{plan.name}</h3>
              <div className="mt-2 mb-1">
                <span className="text-3xl font-bold text-white">${plan.price}</span>
                <span className="text-zinc-500 text-sm">/mo</span>
              </div>

              {/* Credits + Scripts headline */}
              <div className="flex items-center gap-1.5 mb-4 text-sm">
                {plan.credits === -1 ? (
                  <span className="text-teal-400 font-medium flex items-center gap-1">
                    <Infinity className="w-3.5 h-3.5" /> Unlimited credits
                  </span>
                ) : (
                  <span className="text-zinc-400">{plan.credits} credits/mo</span>
                )}
              </div>

              {/* Feature comparison list */}
              <ul className="space-y-1.5 mb-6 flex-1">
                {/* Scripts line */}
                <li className="flex items-center gap-2 text-sm">
                  <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span className="text-zinc-300">
                    {limits.scriptsPerMonth === -1 ? 'Unlimited' : String(limits.scriptsPerMonth)} scripts/mo
                  </span>
                </li>
                {/* Personas line */}
                <li className="flex items-center gap-2 text-sm">
                  <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span className="text-zinc-300">
                    {limits.personas === -1
                      ? 'All personas + custom'
                      : limits.personas === 0
                      ? 'Built-in personas'
                      : `${limits.personas} personas`}
                  </span>
                </li>
                {/* Dynamic features from comparison list */}
                {COMPARISON_FEATURES.map((feat) => {
                  const value = limits[feat.key];
                  const included = typeof value === 'boolean' ? value : value !== 0;
                  return (
                    <li key={feat.key} className="flex items-center gap-2 text-sm">
                      {included ? (
                        <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      ) : (
                        <Minus className="w-3.5 h-3.5 text-zinc-700 shrink-0" />
                      )}
                      <span className={included ? 'text-zinc-300' : 'text-zinc-600'}>
                        {feat.numeric && typeof value === 'number'
                          ? `${formatLimitValue(value)} ${feat.label.toLowerCase()}`
                          : feat.label}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <button
                type="button"
                onClick={() => handleSubscribe(plan.id)}
                disabled={isCurrent || checkoutLoading !== null}
                className={`w-full py-3 px-4 rounded-lg text-sm font-semibold transition-colors min-h-[44px] ${
                  isCurrent
                    ? 'bg-zinc-800 text-zinc-500 cursor-default'
                    : isDowngrade
                    ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
                    : isPopular
                    ? 'bg-violet-600 text-white hover:bg-violet-500'
                    : 'bg-teal-600 text-white hover:bg-teal-500'
                }`}
              >
                {checkoutLoading === plan.id ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : isCurrent ? (
                  'Current Plan'
                ) : isDowngrade ? (
                  'Downgrade'
                ) : (
                  <>
                    <Zap className="w-4 h-4 inline mr-1" />
                    Upgrade
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 — CREDITS
          ════════════════════════════════════════════════════════════════════ */}
      <div className="mb-10">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Coins className="w-5 h-5 text-teal-400" />
          Credits
        </h2>

        {/* Balance + Billing Cycle + Credit Costs */}
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          {/* Available Credits */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="text-sm text-zinc-400 mb-2">Available</div>
            <div className={`text-3xl font-bold ${isUnlimited ? 'text-teal-400' : 'text-white'}`}>
              {isUnlimited ? 'Unlimited' : credits?.remaining ?? 0}
            </div>
            {!isUnlimited && subscription?.creditsPerMonth && (
              <div className="text-xs text-zinc-600 mt-1">{subscription.creditsPerMonth} credits/month</div>
            )}
          </div>

          {/* Billing Cycle */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-teal-400" />
              <div className="text-sm text-zinc-400">Billing Cycle</div>
            </div>
            {daysUntilReset !== null ? (
              <>
                <div className="text-3xl font-bold text-teal-400">{daysUntilReset}</div>
                <div className="text-xs text-zinc-500 mt-1">days until credits reset</div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all"
                    style={{ width: `${Math.max(100 - (daysUntilReset / 30) * 100, 5)}%` }}
                  />
                </div>
              </>
            ) : (
              <div className="text-sm text-zinc-500 mt-1">
                {subscription?.planId === 'free'
                  ? 'Free plan credits do not auto-renew.'
                  : 'Credits reset at the start of each billing cycle.'}
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="text-sm text-zinc-400 mb-3">Usage Stats</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xl font-bold text-white">{credits?.usedThisPeriod ?? 0}</div>
                <div className="text-xs text-zinc-500">This Period</div>
              </div>
              <div>
                <div className="text-xl font-bold text-white">{credits?.lifetimeUsed ?? 0}</div>
                <div className="text-xs text-zinc-500">Lifetime</div>
              </div>
            </div>
          </div>
        </div>

        {/* Credit Costs + Pie Chart */}
        {!isUnlimited && (
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {/* Credit Costs */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">Credit Costs</h3>
              <div className="grid grid-cols-2 gap-3">
                {CREDIT_COSTS.map((item) => (
                  <div key={item.name} className="bg-zinc-800/50 rounded-lg p-3">
                    <div className="text-lg mb-1">{item.icon}</div>
                    <div className="text-xs text-zinc-400">{item.name}</div>
                    <div className="text-sm font-semibold text-white">{item.cost} credit{item.cost > 1 ? 's' : ''}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Usage Breakdown Pie Chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <PieChart className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-semibold text-zinc-400">Usage Breakdown</h3>
                <span className="text-xs text-zinc-600 ml-auto">Last 30 days</span>
              </div>
              {loadingBreakdown ? (
                <div className="text-zinc-500 text-sm py-8 text-center">Loading...</div>
              ) : (
                <UsagePieChart data={usageBreakdown} />
              )}
            </div>
          </div>
        )}

        {/* Credit Add-ons (hidden for unlimited/agency) */}
        {!isUnlimited && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Plus className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-zinc-400">Need More Credits?</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {CREDIT_ADDONS.map((addon) => {
                const perCredit = (addon.price / addon.credits / 100).toFixed(2);
                return (
                  <div
                    key={addon.id}
                    className={`relative bg-zinc-900 border rounded-xl p-5 flex flex-col items-center text-center ${
                      addon.popular ? 'border-violet-500/50 ring-1 ring-violet-500/20' : 'border-zinc-800'
                    }`}
                  >
                    {addon.popular && (
                      <div className="absolute -top-3 px-3 py-0.5 bg-violet-500 text-white text-xs font-semibold rounded-full">
                        Best Value
                      </div>
                    )}
                    <div className="text-3xl font-bold text-white mt-1">{addon.credits}</div>
                    <div className="text-sm text-zinc-400 mb-2">credits</div>
                    <div className="text-xl font-bold text-white">${(addon.price / 100).toFixed(2)}</div>
                    <div className="text-xs text-zinc-500 mb-4">${perCredit}/credit</div>
                    <button
                      type="button"
                      onClick={() => handleBuyCredits(addon.id)}
                      disabled={buyCreditsLoading !== null}
                      className={`w-full py-3 px-4 rounded-lg text-sm font-semibold transition-colors min-h-[44px] ${
                        addon.popular
                          ? 'bg-violet-600 text-white hover:bg-violet-500'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      } disabled:opacity-50`}
                    >
                      {buyCreditsLoading === addon.id ? (
                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                      ) : (
                        'Buy Now'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 3 — TRANSACTION HISTORY
          ════════════════════════════════════════════════════════════════════ */}
      <div className="mb-10">
        <h2 className="text-lg font-bold text-white mb-4">Transaction History</h2>
        {loadingTransactions ? (
          <div className="text-zinc-500 bg-zinc-900/50 rounded-xl p-8 text-center">Loading history...</div>
        ) : transactions.length === 0 ? (
          <div className="text-zinc-500 bg-zinc-900/50 rounded-xl p-8 text-center">
            No transactions yet. Start generating content to see your history.
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="divide-y divide-zinc-800">
              {transactions.slice(0, 20).map((tx) => (
                <div key={tx.id} className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                      {getTransactionIcon(tx.type)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-zinc-200 text-sm truncate">{tx.description}</div>
                      <div className="text-xs sm:text-sm text-zinc-500">{formatDate(tx.created_at)}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-medium ${tx.amount > 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount}
                    </div>
                    <div className="text-xs sm:text-sm text-zinc-500">
                      Bal: {tx.balance_after}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Promo Code Hint */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-center">
        <p className="text-sm text-zinc-400">
          Have a promo code? Enter it during checkout — Stripe will apply the discount automatically.
        </p>
      </div>
    </div>
  );
}
