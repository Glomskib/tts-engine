'use client';

import { useState, useEffect, useMemo } from 'react';
import { useCredits } from '@/hooks/useCredits';
import { Coins, Zap, TrendingUp, Package, ArrowRight, Sparkles, Clock, PieChart } from 'lucide-react';
import Link from 'next/link';
import { SkeletonForm } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import UpsellBanner from '@/components/UpsellBanner';

interface CreditPackage {
  id: string;
  name: string;
  description: string;
  credits: number;
  price_cents: number;
  savings_percent: number;
  is_featured: boolean;
}

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

// Colors for the pie chart segments
const PIE_COLORS: Record<string, string> = {
  generation: '#14b8a6',     // teal-500
  purchase: '#10b981',       // emerald-500
  bonus: '#a855f7',          // purple-500
  subscription_renewal: '#3b82f6', // blue-500
  refund: '#f59e0b',         // amber-500
  other: '#71717a',          // zinc-500
};

const PIE_LABELS: Record<string, string> = {
  generation: 'Scripts & Content',
  purchase: 'Purchases',
  bonus: 'Bonuses',
  subscription_renewal: 'Renewals',
  refund: 'Refunds',
  other: 'Other',
};

function UsagePieChart({ data }: { data: UsageItem[] }) {
  const total = data.reduce((s, d) => s + d.total, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
        No usage data yet
      </div>
    );
  }

  // Build SVG pie chart arcs
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

    // For a single slice covering 100%, draw a circle instead
    if (data.length === 1) {
      return (
        <circle key={item.action} cx="50" cy="50" r="40" fill={color} />
      );
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
        {/* Center hole for donut effect */}
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

export default function CreditsPage() {
  const { credits, subscription, isLoading } = useCredits();
  const { showError } = useToast();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [usageBreakdown, setUsageBreakdown] = useState<UsageItem[]>([]);
  const [loadingBreakdown, setLoadingBreakdown] = useState(true);

  // Fetch usage breakdown
  useEffect(() => {
    async function fetchBreakdown() {
      try {
        const res = await fetch('/api/credits/usage-breakdown');
        const data = await res.json();
        if (data.ok) {
          setUsageBreakdown(data.breakdown);
        }
      } catch (err) {
        console.error('Failed to fetch usage breakdown:', err);
      } finally {
        setLoadingBreakdown(false);
      }
    }
    fetchBreakdown();
  }, []);

  // Fetch credit packages
  useEffect(() => {
    async function fetchPackages() {
      try {
        const res = await fetch('/api/credits/packages');
        const data = await res.json();
        if (data.ok) {
          setPackages(data.packages);
        }
      } catch (err) {
        console.error('Failed to fetch packages:', err);
      } finally {
        setLoadingPackages(false);
      }
    }
    fetchPackages();
  }, []);

  // Fetch transaction history
  useEffect(() => {
    async function fetchTransactions() {
      try {
        const res = await fetch('/api/credits/transactions');
        const data = await res.json();
        if (data.ok) {
          setTransactions(data.transactions);
        }
      } catch (err) {
        console.error('Failed to fetch transactions:', err);
      } finally {
        setLoadingTransactions(false);
      }
    }
    fetchTransactions();
  }, []);

  const handlePurchase = async (packageId: string) => {
    setPurchasing(packageId);
    try {
      const res = await fetch('/api/credits/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: packageId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        showError(data.error || 'Failed to start purchase');
      }
    } catch (err) {
      console.error('Purchase error:', err);
      showError('Failed to start purchase');
    } finally {
      setPurchasing(null);
    }
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'generation':
        return <Zap className="w-4 h-4 text-amber-400" />;
      case 'purchase':
        return <Package className="w-4 h-4 text-emerald-400" />;
      case 'bonus':
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      case 'subscription_renewal':
        return <TrendingUp className="w-4 h-4 text-blue-400" />;
      default:
        return <Coins className="w-4 h-4 text-zinc-400" />;
    }
  };

  const isUnlimited = credits?.remaining === -1 || credits?.isUnlimited;

  // Calculate days until credits reset
  const daysUntilReset = useMemo(() => {
    const periodEnd = credits?.periodEnd || subscription?.periodEnd;
    if (!periodEnd) return null;
    const end = new Date(periodEnd);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : null;
  }, [credits?.periodEnd, subscription?.periodEnd]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <SkeletonForm fields={3} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 py-8 px-4 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Credits</h1>
          <p className="text-zinc-400">Manage your AI generation credits</p>
        </div>

        {/* Upsell Banner */}
        <div className="mb-6">
          <UpsellBanner creditsRemaining={credits?.remaining} />
        </div>

        {/* Current Balance */}
        <div className="grid md:grid-cols-3 gap-6 mb-10">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
                <Coins className="w-5 h-5 text-teal-400" />
              </div>
              <div className="text-sm text-zinc-400">Available Credits</div>
            </div>
            <div className={`text-4xl font-bold ${isUnlimited ? 'text-teal-400' : ''}`}>
              {isUnlimited ? 'Unlimited' : credits?.remaining ?? 0}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </div>
              <div className="text-sm text-zinc-400">Used This Period</div>
            </div>
            <div className="text-4xl font-bold">
              {credits?.usedThisPeriod ?? 0}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Package className="w-5 h-5 text-purple-400" />
              </div>
              <div className="text-sm text-zinc-400">Current Plan</div>
            </div>
            <div className="text-2xl font-bold mb-2">
              {subscription?.planName || 'Free'}
            </div>
            <div className="text-sm text-zinc-500">
              {subscription?.creditsPerMonth ?? 10} credits/month
            </div>
          </div>
        </div>

        {/* Credit Costs */}
        <div className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Credit Costs</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'B-Roll Image', cost: 2, icon: '🖼️' },
              { name: 'Script Generation', cost: 3, icon: '📝' },
              { name: 'Script Refinement', cost: 1, icon: '✨' },
              { name: 'Winner Analysis', cost: 2, icon: '🏆' },
            ].map((item) => (
              <div key={item.name} className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="text-sm text-zinc-400 mb-1">{item.name}</div>
                <div className="text-lg font-semibold">{item.cost} credit{item.cost > 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Usage Breakdown + Reset Countdown */}
        {!isUnlimited && (
          <div className="mb-10 grid md:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <PieChart className="w-4 h-4 text-teal-400" />
                <h2 className="text-lg font-semibold">Usage Breakdown</h2>
                <span className="text-xs text-zinc-500 ml-auto">Last 30 days</span>
              </div>
              {loadingBreakdown ? (
                <div className="text-zinc-500 text-sm py-8 text-center">Loading...</div>
              ) : (
                <UsagePieChart data={usageBreakdown} />
              )}
            </div>

            {/* Reset Countdown + Quick Stats */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <h2 className="text-lg font-semibold">Billing Cycle</h2>
                </div>
                {daysUntilReset !== null ? (
                  <div className="mb-6">
                    <div className="text-4xl font-bold text-blue-400">{daysUntilReset}</div>
                    <div className="text-sm text-zinc-500 mt-1">days until credits reset</div>
                    <div className="w-full h-2 bg-zinc-800 rounded-full mt-3 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${Math.max(100 - (daysUntilReset / 30) * 100, 5)}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mb-6">
                    <div className="text-sm text-zinc-500">
                      {subscription?.planId === 'free'
                        ? 'Free plan credits do not auto-renew.'
                        : 'Credits reset at the start of each billing cycle.'}
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-800/50 rounded-xl p-3">
                  <div className="text-xs text-zinc-500 mb-1">This Period</div>
                  <div className="text-xl font-bold">{credits?.usedThisPeriod ?? 0}</div>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-3">
                  <div className="text-xs text-zinc-500 mb-1">Lifetime</div>
                  <div className="text-xl font-bold">{credits?.lifetimeUsed ?? 0}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Purchase Credits */}
        {!isUnlimited && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold mb-4">Buy Credits</h2>
            {loadingPackages ? (
              <div className="text-zinc-500">Loading packages...</div>
            ) : (
              <div className="grid md:grid-cols-4 gap-4">
                {packages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className={`relative bg-zinc-900 border rounded-2xl p-6 ${
                      pkg.is_featured
                        ? 'border-teal-500/50 bg-teal-500/5'
                        : 'border-zinc-800'
                    }`}
                  >
                    {pkg.is_featured && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-teal-500 text-xs font-medium text-white">
                        Best Value
                      </div>
                    )}
                    <div className="text-lg font-semibold mb-1">{pkg.name}</div>
                    <div className="text-sm text-zinc-500 mb-4">{pkg.description}</div>
                    <div className="text-3xl font-bold mb-1">
                      {pkg.credits}
                      <span className="text-base font-normal text-zinc-500 ml-1">credits</span>
                    </div>
                    <div className="flex items-baseline gap-2 mb-4">
                      <span className="text-xl font-semibold">{formatPrice(pkg.price_cents)}</span>
                      {pkg.savings_percent > 0 && (
                        <span className="text-sm text-emerald-400">
                          Save {pkg.savings_percent}%
                        </span>
                      )}
                    </div>
                    <button type="button"
                      onClick={() => handlePurchase(pkg.id)}
                      disabled={purchasing === pkg.id}
                      className={`w-full h-11 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${
                        pkg.is_featured
                          ? 'bg-teal-600 text-white hover:bg-teal-700'
                          : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                      } disabled:opacity-50`}
                    >
                      {purchasing === pkg.id ? (
                        'Processing...'
                      ) : (
                        <>
                          Buy Now
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Upgrade Plan CTA */}
        {!isUnlimited && subscription?.planId === 'free' && (
          <div className="mb-10 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-2xl p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-lg font-semibold mb-1">Need more credits?</h3>
                <p className="text-zinc-400">Upgrade your plan for more monthly credits and unlock premium features.</p>
              </div>
              <Link
                href="/upgrade"
                className="h-11 px-6 bg-white text-zinc-900 rounded-xl font-medium flex items-center gap-2 hover:bg-zinc-100"
              >
                View Plans
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Transaction History */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          {loadingTransactions ? (
            <div className="text-zinc-500">Loading history...</div>
          ) : transactions.length === 0 ? (
            <div className="text-zinc-500 bg-zinc-900/50 rounded-xl p-8 text-center">
              No transactions yet. Start generating content to see your history.
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="divide-y divide-zinc-800">
                {transactions.slice(0, 10).map((tx) => (
                  <div key={tx.id} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                        {getTransactionIcon(tx.type)}
                      </div>
                      <div>
                        <div className="font-medium">{tx.description}</div>
                        <div className="text-sm text-zinc-500">{formatDate(tx.created_at)}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${tx.amount > 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </div>
                      <div className="text-sm text-zinc-500">
                        Balance: {tx.balance_after}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
