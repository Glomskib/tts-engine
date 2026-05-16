'use client';

// ============================================================
// /account/billing — self-serve subscription management.
//
// Single big button: "Open billing portal" → POSTs to
// /api/stripe/portal → redirects to Stripe's hosted customer
// portal. From there the user can:
//   - Cancel / pause / resume subscription
//   - Update payment method
//   - Download invoices
//   - View billing history
//
// No third-party JS, no card data on our side, no support
// ticket for routine cancellations.
//
// If the user is on the free tier (no Stripe customer yet),
// the portal route returns 404 — we route them to /pricing.
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { CreditCard, ArrowRight, AlertTriangle } from 'lucide-react';

export default function BillingPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPortal = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError('Sign in to manage billing.');
        return;
      }
      if (res.status === 404) {
        // No subscription yet — send to pricing.
        window.location.href = '/pricing';
        return;
      }
      if (!res.ok || !data?.url) {
        setError(data?.error?.message || 'Could not open the billing portal. Try again.');
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/create" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Back to Create
          </Link>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold mb-3 flex items-center gap-3">
          <CreditCard className="w-7 h-7 text-teal-400" />
          Billing
        </h1>
        <p className="text-zinc-400 mb-10">
          Manage your subscription, payment method, and invoices in the Stripe portal.
          Cancel anytime — no email required.
        </p>

        <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6 sm:p-8 mb-6">
          <h2 className="text-lg font-semibold mb-3">Open the billing portal</h2>
          <ul className="space-y-2 text-sm text-zinc-400 mb-6">
            <li>• Update card, billing email, or address</li>
            <li>• Cancel or pause subscription (effective at next billing cycle)</li>
            <li>• Download invoices &amp; receipts</li>
            <li>• See full billing history</li>
          </ul>
          <button
            type="button"
            onClick={openPortal}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white font-semibold transition-all shadow-lg shadow-teal-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Opening…' : 'Open billing portal'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-xs text-zinc-600 mt-10">
          Need help? Email{' '}
          <a href="mailto:miles@makingmilesmatter.com" className="underline hover:text-zinc-400">
            miles@makingmilesmatter.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
