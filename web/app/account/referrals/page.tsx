'use client';

// ============================================================
// /account/referrals — user-facing referral dashboard.
//
// Pulls stats + recent referrals from GET /api/referrals (which
// returns: { ok, data: { stats, recent } }). Renders the
// shareable link (with the user's code), copy button, simple
// stats grid, and the most recent referrals.
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Check, Share2, Sparkles } from 'lucide-react';

interface ReferralStats {
  code: string | null;
  total_clicks?: number;
  total_signups?: number;
  total_paid?: number;
  pending_earnings_cents?: number;
  paid_earnings_cents?: number;
}

interface RecentReferral {
  id: string;
  status: string;
  created_at: string;
  email?: string | null;
  plan?: string | null;
}

function dollars(cents?: number) {
  const c = cents ?? 0;
  return `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ReferralsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [recent, setRecent] = useState<RecentReferral[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/referrals', { cache: 'no-store' });
        if (res.status === 401) {
          setError('Sign in to see your referral link.');
          return;
        }
        if (!res.ok) {
          setError('Could not load your referrals. Try refreshing.');
          return;
        }
        const data = await res.json();
        if (!data?.ok) {
          setError(data?.error?.message || 'Unexpected error.');
          return;
        }
        setStats(data?.data?.stats ?? null);
        setRecent(data?.data?.recent ?? []);
      } catch {
        setError('Network error.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const code = stats?.code;
  const link = code ? `https://flashflowai.com/?ref=${code}` : '';

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const share = async () => {
    if (!link) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'FlashFlow AI — TikTok scripts that work',
          text: 'I use FlashFlow to ship TikTok content. Try it free with my link:',
          url: link,
        });
      } catch {
        /* user cancelled */
      }
    } else {
      void copy();
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/create" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Back to Create
          </Link>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold mb-2 flex items-center gap-3">
          <Sparkles className="w-7 h-7 text-teal-400" />
          Refer & earn
        </h1>
        <p className="text-zinc-400 mb-10 max-w-xl">
          Share your link. Every paid signup earns you <span className="text-emerald-400 font-semibold">30% recurring</span> for as long as they stay on FlashFlow. Pays out monthly via Stripe.
        </p>

        {loading && (
          <div className="text-zinc-500 text-sm">Loading…</div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200 mb-6">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Shareable link */}
            <div className="rounded-2xl bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-transparent border border-teal-500/20 p-6 mb-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-300 mb-3">Your link</p>
              {code ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    readOnly
                    value={link}
                    className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-sm font-mono text-zinc-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" /> Copy
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={share}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/10 text-zinc-200 hover:bg-white/5 transition-colors"
                    title="Share via system share sheet"
                  >
                    <Share2 className="w-4 h-4" /> Share
                  </button>
                </div>
              ) : (
                <p className="text-sm text-zinc-400">
                  Your code is being generated. Refresh in a moment.
                </p>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
              <Stat label="Clicks" value={stats?.total_clicks ?? 0} />
              <Stat label="Signups" value={stats?.total_signups ?? 0} />
              <Stat label="Paid" value={stats?.total_paid ?? 0} />
              <Stat label="Earned" value={dollars((stats?.pending_earnings_cents ?? 0) + (stats?.paid_earnings_cents ?? 0))} />
            </div>

            {/* Recent */}
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-3">
                Recent referrals
              </h2>
              {recent.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-6 text-sm text-zinc-500 text-center">
                  No referrals yet. Share your link to start earning.
                </div>
              ) : (
                <ul className="space-y-2">
                  {recent.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between px-4 py-3 rounded-xl border border-white/5 bg-zinc-900/40 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="text-zinc-200 truncate">{r.email || 'A creator'}</div>
                        <div className="text-xs text-zinc-500">
                          {new Date(r.created_at).toLocaleDateString()}
                          {r.plan ? ` · ${r.plan}` : ''}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          r.status === 'paid'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : r.status === 'signup'
                              ? 'bg-teal-500/15 text-teal-300'
                              : 'bg-zinc-700/40 text-zinc-300'
                        }`}
                      >
                        {r.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-xs text-zinc-600 mt-10">
              Payouts process monthly via Stripe Connect. See{' '}
              <Link href="/terms" className="underline hover:text-zinc-400">
                terms
              </Link>{' '}
              for full details.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-4">
      <div className="text-2xl font-bold text-zinc-100">{value}</div>
      <div className="text-xs text-zinc-500 uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}
