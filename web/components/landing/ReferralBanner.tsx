'use client';

// ============================================================
// ReferralBanner — captures ?ref= and ?promo= URL params,
// persists them, fires the referral signal to the API, and
// shows a confirmation banner. Pure client behavior — runs
// only after hydration.
// ============================================================

import { useEffect, useState } from 'react';

export default function ReferralBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const promo = params.get('promo');

    if (ref) {
      localStorage.setItem('ff_ref', ref);
      document.cookie = `ff_ref=${ref}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
      setShow(true);
      fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referral_code: ref }),
      }).catch(() => {});
    }

    if (promo) {
      localStorage.setItem('ff_promo', promo);
      document.cookie = `ff_promo=${promo}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
    }
  }, []);

  if (!show) return null;

  return (
    <div className="bg-emerald-500/10 border-b border-emerald-500/20 text-center py-2 px-4 text-sm text-emerald-400">
      Referral link applied! Your friend will earn rewards when you subscribe.
    </div>
  );
}
