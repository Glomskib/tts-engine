'use client';

/**
 * User-facing affiliate dashboard.
 *
 * Backend already complete (lib/affiliates.ts, /api/affiliates/*, Stripe Connect,
 * monthly payout cron, admin approval UI). This page is the creator-facing
 * surface that consumes /api/affiliates/status and exposes the apply flow,
 * share link, earnings, referrals, payouts, and Stripe Connect onboarding.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Check, DollarSign, Users, TrendingUp, Wallet, ExternalLink, Sparkles } from 'lucide-react';

interface AffiliateAccount {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  commission_rate: number;
  stripe_connect_onboarded: boolean;
  balance: number;
  total_earned: number;
  total_paid: number;
  min_payout: number;
}
interface Stats {
  totalReferred: number;
  activeSubscribers: number;
  totalEarned: number;
  totalPaid: number;
  pendingBalance: number;
  thisMonthEarned: number;
}
interface Commission {
  id: string;
  subscription_amount: number;
  commission_amount: number;
  status: string;
  created_at: string;
}
interface Payout {
  id: string;
  amount: number;
  status: string;
  period_start: string;
  period_end: string;
  paid_at: string | null;
}
interface Milestone {
  id: string;
  milestone_type: string;
  bonus_amount: number;
  achieved_at: string;
}
interface ReferralStats {
  totalReferrals: number;
  creditsEarned: number;
  referralLink: string;
  referralCode: string;
}
interface StatusPayload {
  account: AffiliateAccount | null;
  stats: Stats | null;
  recentCommissions: Commission[];
  payoutHistory: Payout[];
  milestones: Milestone[];
  referralStats: ReferralStats;
}

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function AffiliatePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatusPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [applyForm, setApplyForm] = useState({ platform: '', followerCount: '', note: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/affiliates/status', { cache: 'no-store' });
      if (res.status === 401) {
        setError('Please sign in to access the affiliate program.');
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to load');
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copyLink = async () => {
    if (!data?.referralStats?.referralLink) return;
    await navigator.clipboard.writeText(data.referralStats.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const submitApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/affiliates/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: applyForm.platform || null,
          followerCount: applyForm.followerCount ? Number(applyForm.followerCount) : null,
          note: applyForm.note || null,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed');
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to apply');
    } finally {
      setSubmitting(false);
    }
  };

  const openStripeConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/affiliates/stripe-connect', { method: 'POST' });
      const json = await res.json();
      if (!json.ok || !json.url) throw new Error(json.error || 'Failed');
      window.location.href = json.url;
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to open Stripe Connect');
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading affiliate dashboard…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-zinc-300 mb-4">{error}</p>
          <Link href="/login" className="inline-block px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const account = data?.account;
  const stats = data?.stats;
  const ref = data?.referralStats;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <section className="border-b border-zinc-900 bg-gradient-to-b from-emerald-500/5 to-transparent">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium mb-3">
            <Sparkles className="w-4 h-4" /> FlashFlow Affiliate Program
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Turn content into income.
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl">
            Share FlashFlow with your audience and earn{' '}
            <span className="text-emerald-400 font-semibold">
              {account ? `${Math.round((account.commission_rate || 0.2) * 100)}% recurring`  : '20% recurring'}
            </span>{' '}
            commission on every paid subscription — for as long as they stay.
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* ---------- NO ACCOUNT: apply form ---------- */}
        {!account && (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8">
            <h2 className="text-2xl font-semibold mb-2">Apply to become an affiliate</h2>
            <p className="text-zinc-400 mb-6">Tell us a bit about your audience. Approvals are usually within 48 hours.</p>
            <form onSubmit={submitApply} className="space-y-4 max-w-lg">
              <div>
                <label className="block text-sm text-zinc-300 mb-1.5">Primary platform</label>
                <input
                  type="text"
                  placeholder="TikTok, YouTube, Instagram…"
                  value={applyForm.platform}
                  onChange={(e) => setApplyForm({ ...applyForm, platform: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-300 mb-1.5">Approximate follower count</label>
                <input
                  type="number"
                  placeholder="10000"
                  value={applyForm.followerCount}
                  onChange={(e) => setApplyForm({ ...applyForm, followerCount: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-300 mb-1.5">How will you promote FlashFlow?</label>
                <textarea
                  rows={4}
                  placeholder="Tell us about your audience and how you'll share FlashFlow."
                  value={applyForm.note}
                  onChange={(e) => setApplyForm({ ...applyForm, note: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold"
              >
                {submitting ? 'Submitting…' : 'Submit application'}
              </button>
            </form>
          </section>
        )}

        {/* ---------- PENDING ---------- */}
        {account && account.status === 'pending' && (
          <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-8">
            <h2 className="text-2xl font-semibold mb-2">Application under review</h2>
            <p className="text-zinc-400">
              Thanks for applying! We review affiliate applications within 48 hours. You&apos;ll receive an
              email as soon as you&apos;re approved.
            </p>
          </section>
        )}

        {account && account.status === 'rejected' && (
          <section className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8">
            <h2 className="text-2xl font-semibold mb-2">Application not approved</h2>
            <p className="text-zinc-400">
              Your affiliate application wasn&apos;t approved at this time. If you think this is a mistake, reach out to support.
            </p>
          </section>
        )}

        {/* ---------- APPROVED: share link + stats ---------- */}
        {account && account.status === 'approved' && (
          <>
            {/* Share link */}
            <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 md:p-8">
              <h2 className="text-xl font-semibold mb-1">Your share link</h2>
              <p className="text-zinc-400 text-sm mb-4">
                Anyone who signs up and subscribes through this link earns you {Math.round((account.commission_rate || 0.2) * 100)}% every month.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 px-4 py-3 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-sm text-zinc-200 truncate">
                  {ref?.referralLink}
                </div>
                <button
                  onClick={copyLink}
                  className="px-5 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold flex items-center justify-center gap-2"
                >
                  {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy link</>}
                </button>
              </div>
              {ref?.referralCode && (
                <div className="mt-3 text-sm text-zinc-500">
                  Your code: <span className="text-zinc-300 font-mono">{ref.referralCode}</span>
                </div>
              )}
            </section>

            {/* Stats grid */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={<Users className="w-4 h-4" />} label="Total referred" value={String(stats?.totalReferred ?? 0)} />
              <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Paying subscribers" value={String(stats?.activeSubscribers ?? 0)} />
              <StatCard icon={<DollarSign className="w-4 h-4" />} label="This month" value={fmtUSD(stats?.thisMonthEarned ?? 0)} />
              <StatCard icon={<Wallet className="w-4 h-4" />} label="Pending balance" value={fmtUSD(stats?.pendingBalance ?? 0)} highlight />
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatCard label="Total earned (all-time)" value={fmtUSD(stats?.totalEarned ?? 0)} />
              <StatCard label="Total paid out" value={fmtUSD(stats?.totalPaid ?? 0)} />
            </section>

            {/* Stripe Connect */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold mb-1">Payouts</h2>
                  <p className="text-zinc-400 text-sm">
                    {account.stripe_connect_onboarded
                      ? 'Stripe Connect is set up. Payouts run monthly once your balance reaches ' + fmtUSD(account.min_payout || 50) + '.'
                      : 'Connect your Stripe account to start receiving monthly payouts.'}
                  </p>
                </div>
                <button
                  onClick={openStripeConnect}
                  disabled={connecting}
                  className="px-5 py-3 rounded-lg bg-zinc-100 hover:bg-white disabled:opacity-50 text-zinc-950 font-semibold flex items-center gap-2 justify-center whitespace-nowrap"
                >
                  {connecting ? 'Opening…' : account.stripe_connect_onboarded ? 'Open Stripe dashboard' : 'Connect Stripe'}
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </section>

            {/* Recent commissions */}
            <section>
              <h2 className="text-xl font-semibold mb-4">Recent commissions</h2>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                {data!.recentCommissions.length === 0 ? (
                  <div className="p-6 text-zinc-500 text-sm">No commissions yet. Share your link to get started.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-900/60 text-zinc-400">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">Date</th>
                        <th className="text-left px-4 py-3 font-medium">Subscription</th>
                        <th className="text-left px-4 py-3 font-medium">Commission</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {data!.recentCommissions.map((c) => (
                        <tr key={c.id}>
                          <td className="px-4 py-3 text-zinc-400">{fmtDate(c.created_at)}</td>
                          <td className="px-4 py-3 text-zinc-300">{fmtUSD(c.subscription_amount)}</td>
                          <td className="px-4 py-3 text-emerald-400 font-medium">{fmtUSD(c.commission_amount)}</td>
                          <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* Payout history */}
            <section>
              <h2 className="text-xl font-semibold mb-4">Payout history</h2>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                {data!.payoutHistory.length === 0 ? (
                  <div className="p-6 text-zinc-500 text-sm">No payouts yet.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-900/60 text-zinc-400">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">Period</th>
                        <th className="text-left px-4 py-3 font-medium">Amount</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">Paid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {data!.payoutHistory.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-3 text-zinc-400">{fmtDate(p.period_start)} – {fmtDate(p.period_end)}</td>
                          <td className="px-4 py-3 text-zinc-200 font-medium">{fmtUSD(p.amount)}</td>
                          <td className="px-4 py-3"><StatusPill status={p.status} /></td>
                          <td className="px-4 py-3 text-zinc-400">{p.paid_at ? fmtDate(p.paid_at) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* Milestones */}
            {data!.milestones.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4">Milestone bonuses earned</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {data!.milestones.map((m) => (
                    <div key={m.id} className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                      <div className="text-emerald-400 text-sm font-medium">{m.milestone_type.replace('_', ' ')}</div>
                      <div className="text-2xl font-bold mt-1">{fmtUSD(m.bonus_amount)}</div>
                      <div className="text-xs text-zinc-500 mt-1">{fmtDate(m.achieved_at)}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        highlight ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/40'
      }`}
    >
      <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-bold mt-2 ${highlight ? 'text-emerald-400' : 'text-zinc-100'}`}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'paid' || status === 'completed'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : status === 'pending'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      : status === 'approved' || status === 'processing'
      ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
      : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
  return <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${tone}`}>{status}</span>;
}
