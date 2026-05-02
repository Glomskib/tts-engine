'use client';

/**
 * /admin/affiliate/[productId] — affiliate product detail + sample request.
 *
 * Stays graceful when the affiliate API is gated: lets the user record an
 * "intent to promote" locally so when FF is approved, those rows get
 * back-filled with TT-side data on first sync.
 */
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function AffiliateProductPage() {
  const params = useParams<{ productId: string }>();
  const router = useRouter();
  const productId = params.productId;
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleRequestSample() {
    setLoading(true); setResult(null);
    try {
      const res = await fetch('/api/affiliate/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.notice || data.error || `HTTP ${res.status}` });
      } else {
        setResult({ ok: true, message: 'Sample request submitted.' });
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'network error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-2xl font-bold text-zinc-100">Product {productId}</h1>
      <p className="text-zinc-500 text-sm mt-1">
        Detail view powered by the TT Shop affiliate API. Until FlashFlow is allowlisted,
        you can record intent here and sync once approval lands.
      </p>

      <div className="mt-6 p-4 rounded-xl bg-zinc-900/60 border border-white/5">
        <button
          type="button"
          disabled={loading}
          onClick={handleRequestSample}
          className="px-4 py-2 rounded-lg bg-teal-500 text-white font-medium hover:bg-teal-400 disabled:opacity-50"
        >
          {loading ? 'Submitting…' : 'Request a free sample'}
        </button>
        {result && (
          <p className={`mt-3 text-sm ${result.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
            {result.message}
          </p>
        )}
      </div>

      <div className="mt-4 text-sm text-zinc-500">
        <Link href="/admin/affiliate" className="hover:text-teal-400">← Back to Affiliate Hub</Link>
      </div>
    </div>
  );
}
