'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCredits } from '@/hooks/useCredits';

/**
 * CreditMilestoneBanner
 *
 * Shows a subtle banner when the user is halfway through free credits.
 * Displays only once per session, only for free users.
 */
export function CreditMilestoneBanner() {
  const { credits, isFreeUser } = useCredits();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isFreeUser) return;

    const remaining = credits?.remaining ?? 5;
    const total = credits?.total ?? 5;
    const used = total - remaining;

    // Show when user has used 3 of 5 free credits (halfway milestone)
    if (used >= 3 && remaining > 0 && remaining <= 2) {
      const key = 'ff_milestone_shown';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        setVisible(true);
        // Auto-hide after 10 seconds
        setTimeout(() => setVisible(false), 10000);
      }
    }
  }, [credits, isFreeUser]);

  if (!visible) return null;

  const remaining = credits?.remaining ?? 0;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 animate-in slide-in-from-bottom-4">
      <div className="bg-zinc-900 border border-teal-500/20 rounded-xl p-4 shadow-xl flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 font-medium">
            You&apos;re on a roll!
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">
            {remaining} free script{remaining !== 1 ? 's' : ''} remaining. Upgrade for unlimited.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/upgrade"
            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Upgrade
          </Link>
          <button
            onClick={() => setVisible(false)}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Dismiss"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ReferralPromptBanner
 *
 * Shows a referral prompt for active paying users after 30 days.
 * Displays only once, tracked in localStorage.
 */
export function ReferralPromptBanner() {
  const { isFreeUser, subscription } = useCredits();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show for paying users
    if (isFreeUser) return;
    if (!subscription?.planId || subscription.planId === 'free') return;

    // Check if already dismissed
    const key = 'ff_referral_prompt_dismissed';
    if (localStorage.getItem(key)) return;

    // Show after 30 days since we can't easily check exact signup date,
    // use a simpler heuristic: show once per user after first load
    const shownKey = 'ff_referral_prompt_shown_at';
    const shownAt = localStorage.getItem(shownKey);

    if (!shownAt) {
      // First time seeing this component — record timestamp, show after 30 days
      localStorage.setItem(shownKey, new Date().toISOString());
      return;
    }

    const daysSince = (Date.now() - new Date(shownAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince >= 30) {
      setVisible(true);
    }
  }, [isFreeUser, subscription]);

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem('ff_referral_prompt_dismissed', '1');
  };

  if (!visible) return null;

  return (
    <div className="bg-gradient-to-r from-teal-500/10 to-emerald-500/10 border border-teal-500/20 rounded-xl p-4 mb-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 font-medium">
          Love FlashFlow?
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">
          Share your referral link and get a free month for every friend who subscribes!
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href="/admin/referrals"
          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          Get My Link
        </Link>
        <button
          onClick={handleDismiss}
          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Dismiss"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
