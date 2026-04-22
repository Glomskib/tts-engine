'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function UpgradeProPage() {
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    setLoading(true);
    // Route to existing upgrade flow / Stripe checkout
    window.location.href = '/upgrade';
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Urgency banner */}
        <div className="mb-8 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm font-medium text-amber-300">
          ⚠ Most users underestimate their taxes
        </div>

        {/* Headline */}
        <h1 className="text-center text-5xl font-bold tracking-tight sm:text-6xl">
          Stop guessing what you owe
        </h1>
        <p className="mt-6 text-center text-xl text-slate-300">
          Know your tax bill before it hits. Every month.
        </p>

        {/* Pain */}
        <div className="mt-10 rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
          <p className="text-lg font-semibold text-red-300">
            You could owe thousands unexpectedly
          </p>
          <p className="mt-2 text-sm text-red-200/80">
            Creators who don&apos;t track quarterly get hit with penalties averaging $1,200+ per year.
          </p>
        </div>

        {/* Value */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <ValueCard
            icon="💰"
            title="Tax Tracking"
            body="Automatic income + expense tracking across every platform payout."
          />
          <ValueCard
            icon="🔔"
            title="Quarterly Alerts"
            body="Get notified before every IRS deadline with the exact amount to pay."
          />
          <ValueCard
            icon="🎬"
            title="Content Scripts"
            body="AI-generated hooks and scripts so you never run out of ideas."
          />
        </div>

        {/* Pricing + CTA */}
        <div className="mt-12 rounded-3xl border border-emerald-500/40 bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 p-8 text-center">
          <div className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
            Pro Plan
          </div>
          <div className="mt-3 flex items-baseline justify-center gap-1">
            <span className="text-6xl font-bold">$9</span>
            <span className="text-xl text-slate-400">/month</span>
          </div>
          <p className="mt-2 text-sm text-slate-400">Cancel anytime. No contracts.</p>

          <button
            type="button"
            onClick={handleUpgrade}
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-emerald-500 px-8 py-4 text-lg font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Upgrade Now'}
          </button>

          <p className="mt-3 text-xs text-slate-500">
            Instant access · Secure checkout · 30-day guarantee
          </p>
        </div>

        <div className="mt-8 text-center text-sm text-slate-500">
          <Link href="/admin" className="hover:text-slate-300">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ValueCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="text-3xl">{icon}</div>
      <div className="mt-3 font-semibold">{title}</div>
      <p className="mt-1 text-sm text-slate-400">{body}</p>
    </div>
  );
}
