'use client';

/**
 * Referral progress banner — drives the activation/growth loop.
 *
 * Shows "Invite N more friends → unlock X" with one-tap share.
 * Tiers:
 *   1 referral  → +10 generations
 *   3 referrals → unlock premium preview
 */

import { useEffect, useState } from 'react';
import { Gift, Share2, Check } from 'lucide-react';
import { handleShare } from '@/lib/share';

interface ReferralStats {
  totalReferrals: number;
  creditsEarned: number;
  referralLink: string;
  referralCode: string;
}

const TIER_1 = 1; // +10 generations
const TIER_2 = 3; // unlock premium preview

export function ReferralProgressBanner() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [shared, setShared] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('referral_banner_dismissed') === 'true';
  });

  useEffect(() => {
    if (dismissed) return;
    fetch('/api/referrals')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.data?.stats) setStats(d.data.stats);
      })
      .catch(() => {});
  }, [dismissed]);

  if (dismissed || !stats) return null;

  const referrals = stats.totalReferrals;
  const nextTier = referrals < TIER_1 ? TIER_1 : referrals < TIER_2 ? TIER_2 : null;
  if (nextTier === null) return null; // user is past all tiers — stop nagging

  const remaining = nextTier - referrals;
  const reward = nextTier === TIER_1 ? '+10 generations' : 'unlock premium preview';

  const handleInvite = async () => {
    await handleShare(
      {
        title: 'Join FlashFlow',
        text: 'I use FlashFlow to go from script to posted video in minutes. Join with my code and we both get free credits!',
        url: stats.referralLink,
      },
      { onSuccess: () => { setShared(true); setTimeout(() => setShared(false), 2500); } },
    );
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('referral_banner_dismissed', 'true');
    }
  };

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-teal-500/25 bg-gradient-to-r from-teal-500/10 via-teal-500/5 to-transparent">
      <div className="flex items-center gap-3 p-4 pr-10">
        <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center shrink-0">
          <Gift className="w-5 h-5 text-teal-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight">
            Invite {remaining} more friend{remaining === 1 ? '' : 's'} → {reward}
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">
            You and your friend each get free credits.
          </p>
        </div>
        <button
          type="button"
          onClick={handleInvite}
          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-500 active:bg-teal-700 transition-colors min-h-[40px]"
        >
          {shared ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
          {shared ? 'Shared' : 'Invite'}
        </button>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-zinc-400 text-sm"
      >
        ×
      </button>
    </div>
  );
}
