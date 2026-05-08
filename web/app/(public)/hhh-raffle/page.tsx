'use client';

/**
 * /hhh-raffle — Public shop-ride raffle submission page.
 *
 * Embeddable via iframe on hancockhorizontalhundred.com. Riders submit:
 * - email
 * - which shop ride
 * - ride date
 * - optional photo proof (uploaded as base64 → Supabase storage)
 * - optional referral email
 *
 * Returns total ticket count after submission.
 */

import { useState } from 'react';

const SHOP_RIDES = [
  'False Chord Saturday',
  'False Chord Tuesday',
  'Spoke Life Cycles',
  'Wheelers Bike & Hike',
  'Trek Bowling Green',
  'Other',
];

export default function HhhRafflePage() {
  const [email, setEmail] = useState('');
  const [shopName, setShopName] = useState(SHOP_RIDES[0]);
  const [rideDate, setRideDate] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [referralEmail, setReferralEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; total_entries?: number; message?: string; error?: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    let photoUrl: string | null = null;
    if (photoFile) {
      // For MVP: skip photo upload entirely or use a separate signed-URL flow later
      // The API accepts photo_url as optional; for now we just flag that they uploaded
      photoUrl = `pending:${photoFile.name}`;
    }

    try {
      const res = await fetch('/api/hhh-raffle/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          shop_name: shopName,
          ride_date: rideDate,
          photo_url: photoUrl,
          referral_email: referralEmail.trim() || undefined,
        }),
      });
      const data = await res.json();
      setResult({ ...data, ok: res.ok });
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function checkTickets() {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/hhh-raffle/submit?email=${encodeURIComponent(email.trim())}`);
      const data = await res.json();
      setResult({ ...data, ok: res.ok, message: `You have ${data.total_entries || 0} raffle tickets.` });
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold mb-2">HHH 2026 Raffle</h1>
          <p className="text-zinc-400 text-sm">
            Earn tickets for the $500+ grand prize drawing — 7 PM, Sept 12, at the finish-line party.
          </p>
          <p className="text-zinc-500 text-xs mt-2">Must be present to win the grand prize. Proceeds to St. Jude + Van Buren Trail.</p>
        </div>

        {!result?.ok ? (
          <form onSubmit={handleSubmit} className="space-y-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Your email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Which shop ride? *</label>
              <select
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                disabled={submitting}
              >
                {SHOP_RIDES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Ride date *</label>
              <input
                type="date"
                required
                value={rideDate}
                onChange={(e) => setRideDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Photo proof (optional but recommended)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-zinc-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-teal-500 file:text-zinc-900 file:font-semibold file:cursor-pointer"
                disabled={submitting}
              />
              <p className="text-xs text-zinc-500 mt-1">Selfie at the shop. Manual review within 24 hrs.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Friend who registered for HHH? (+2 entries each)</label>
              <input
                type="email"
                value={referralEmail}
                onChange={(e) => setReferralEmail(e.target.value)}
                placeholder="optional — their email"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                disabled={submitting}
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !email.trim() || !rideDate}
              className="w-full px-4 py-3 rounded-lg bg-teal-500 text-zinc-900 font-bold hover:bg-teal-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit shop-ride entry'}
            </button>

            <button
              type="button"
              onClick={checkTickets}
              disabled={submitting || !email.trim()}
              className="w-full px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 underline"
            >
              Or just check how many tickets I have →
            </button>
          </form>
        ) : (
          <div className="text-center bg-teal-500/10 border border-teal-500/30 rounded-2xl p-8">
            <div className="text-5xl font-bold text-teal-300 mb-2">{result.total_entries ?? 0}</div>
            <div className="text-zinc-300 text-sm mb-4">total raffle tickets</div>
            <p className="text-zinc-400 text-sm mb-4">{result.message}</p>
            <button
              type="button"
              onClick={() => { setResult(null); setRideDate(''); setPhotoFile(null); setReferralEmail(''); }}
              className="text-teal-400 hover:text-teal-300 text-sm underline"
            >
              Submit another ride →
            </button>
          </div>
        )}

        {result?.error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
            {result.error}
          </div>
        )}

        <div className="mt-6 text-center text-xs text-zinc-500">
          Questions? <a href="mailto:miles@makingmilesmatter.com" className="text-teal-400 hover:text-teal-300">miles@makingmilesmatter.com</a>
        </div>
      </div>
    </div>
  );
}
