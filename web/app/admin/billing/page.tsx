'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCredits } from '@/hooks/useCredits';
import { Check, Zap, CreditCard, ExternalLink, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { PLANS_LIST } from '@/lib/plans';

const PLAN_ORDER = ['free', 'creator_lite', 'creator_pro', 'brand', 'agency'] as const;

export default function BillingPage() {
  const searchParams = useSearchParams();
  const { credits, subscription, isLoading, refetch } = useCredits();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'canceled'; plan?: string } | null>(null);

  // Show banners for redirect from Stripe checkout
  useEffect(() => {
    if (searchParams.get('upgraded') === 'true') {
      setBanner({ type: 'success', plan: searchParams.get('plan') || undefined });
      refetch();
    } else if (searchParams.get('canceled') === 'true') {
      setBanner({ type: 'canceled' });
    }
  }, [searchParams, refetch]);

  const currentPlanId = subscription?.planId || 'free';

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

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Checkout failed');
      }

      if (!data.url) {
        throw new Error('No checkout URL received');
      }

      window.location.href = data.url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Failed to start checkout');
      setCheckoutLoading(null);
    }
  };

  // Find current plan index for comparison
  const currentPlanIndex = PLAN_ORDER.indexOf(currentPlanId as typeof PLAN_ORDER[number]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  const isUnlimited = credits?.remaining === -1 || credits?.isUnlimited;

  return (
    <div className="max-w-5xl mx-auto pb-24 lg:pb-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="text-zinc-500 mt-1">Manage your plan and usage</p>
      </div>

      {/* Current Plan Card */}
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
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        )}

        {subscription?.stripeCustomerId && (
          <button
            onClick={async () => {
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
            }}
            disabled={portalLoading}
            className="inline-flex items-center gap-1.5 mt-3 text-xs text-teal-400 hover:text-teal-300 transition-colors disabled:opacity-50"
          >
            {portalLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
            Manage subscription
          </button>
        )}
      </div>

      {/* Success/Cancel Banners */}
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
      {banner?.type === 'canceled' && (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 mb-6 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-zinc-500 shrink-0" />
          <p className="text-sm text-zinc-400">Checkout was canceled. No changes were made.</p>
          <button type="button" onClick={() => setBanner(null)} className="ml-auto text-zinc-600 hover:text-zinc-400">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {checkoutError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-400">{checkoutError}</p>
        </div>
      )}

      {/* Plan Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {PLANS_LIST.filter(p => p.id !== 'free').map((plan) => {
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
              <div className="mt-2 mb-4">
                <span className="text-3xl font-bold text-white">${plan.price}</span>
                <span className="text-zinc-500 text-sm">/mo</span>
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                    <span className="text-zinc-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleSubscribe(plan.id)}
                disabled={isCurrent || checkoutLoading !== null}
                className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors ${
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

      {/* Promo Code Hint */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-center">
        <p className="text-sm text-zinc-400">
          Have a promo code? Enter it during checkout — Stripe will apply the discount automatically.
        </p>
      </div>
    </div>
  );
}
