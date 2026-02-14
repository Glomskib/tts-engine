'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DollarSign, Calendar, Target, TrendingUp, CheckCircle, Circle, Loader2 } from 'lucide-react';

interface BonusTier {
  videos?: number;
  payout?: number;
  gmv?: number;
  bonus?: number;
  label: string;
}

interface RetainerBrand {
  id: string;
  name: string;
  logo_url?: string | null;
  brand_image_url?: string | null;
  retainer_type: string;
  retainer_video_goal: number;
  retainer_period_start: string;
  retainer_period_end: string;
  retainer_payout_amount: number;
  retainer_bonus_tiers: BonusTier[];
  retainer_notes: string | null;
  video_count: number;
}

export default function RetainerTracker() {
  const [retainers, setRetainers] = useState<RetainerBrand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/retainers')
      .then(res => res.json())
      .then(json => {
        if (json.ok) setRetainers(json.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-4 h-4 text-green-400" />
          <h2 className="text-sm font-semibold text-white">Brand Retainers</h2>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
        </div>
      </div>
    );
  }

  if (retainers.length === 0) return null;

  return (
    <div className="space-y-4">
      {retainers.map(brand => (
        <RetainerCard key={brand.id} brand={brand} />
      ))}
    </div>
  );
}

function RetainerCard({ brand }: { brand: RetainerBrand }) {
  const today = new Date();
  const periodStart = new Date(brand.retainer_period_start + 'T00:00:00');
  const periodEnd = new Date(brand.retainer_period_end + 'T23:59:59');

  const totalDays = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86400000));
  const daysElapsed = Math.max(1, Math.ceil((today.getTime() - periodStart.getTime()) / 86400000));
  const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - today.getTime()) / 86400000));

  const videosRemaining = Math.max(0, brand.retainer_video_goal - brand.video_count);
  const pctComplete = brand.retainer_video_goal > 0
    ? Math.min(100, Math.round((brand.video_count / brand.retainer_video_goal) * 100))
    : 0;

  const currentPace = brand.video_count / daysElapsed;
  const neededPace = daysRemaining > 0 ? videosRemaining / daysRemaining : 0;

  // Pace status: green if ahead, amber if close, red if behind
  const paceStatus = brand.video_count >= brand.retainer_video_goal
    ? 'complete'
    : currentPace >= neededPace * 1.1
      ? 'ahead'
      : currentPace >= neededPace * 0.8
        ? 'close'
        : 'behind';

  const paceColors = {
    complete: 'text-green-400',
    ahead: 'text-green-400',
    close: 'text-amber-400',
    behind: 'text-red-400',
  };

  const barColor = paceStatus === 'behind' ? 'bg-red-500' :
    paceStatus === 'close' ? 'bg-amber-500' : 'bg-green-500';

  const typeLabel = brand.retainer_type.charAt(0).toUpperCase() + brand.retainer_type.slice(1);
  const endDate = periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="bg-gradient-to-r from-green-500/5 via-zinc-900 to-zinc-900 border border-green-500/20 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {(brand.brand_image_url || brand.logo_url) ? (
            <img
              src={(brand.brand_image_url || brand.logo_url)!}
              alt={brand.name}
              className="w-8 h-8 rounded-lg object-cover border border-white/10"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-green-400" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-bold text-white">{brand.name}</h3>
            {brand.retainer_notes ? (
              <p className="text-xs text-zinc-400">{brand.retainer_notes}</p>
            ) : (
              <p className="text-xs text-zinc-500">{typeLabel}</p>
            )}
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          paceStatus === 'complete' ? 'bg-green-500/20 text-green-400' :
          paceStatus === 'ahead' ? 'bg-green-500/15 text-green-400' :
          paceStatus === 'close' ? 'bg-amber-500/15 text-amber-400' :
          'bg-red-500/15 text-red-400'
        }`}>
          {paceStatus === 'complete' ? 'Goal met!' :
           paceStatus === 'ahead' ? 'On track' :
           paceStatus === 'close' ? 'Close' : 'Behind pace'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-white">{brand.video_count}</span>
            <span className="text-sm text-zinc-500">/ {brand.retainer_video_goal} videos</span>
          </div>
          <span className="text-sm font-medium text-zinc-400">{pctComplete}%</span>
        </div>
        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} rounded-full transition-all duration-500`}
            style={{ width: `${pctComplete}%` }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
        <div className="flex items-center gap-1.5 text-zinc-400">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span>{daysRemaining}d remaining (ends {endDate})</span>
        </div>
        <div className="flex items-center gap-1.5 text-zinc-400">
          <DollarSign className="w-3.5 h-3.5 shrink-0" />
          <span>Base: ${brand.retainer_payout_amount} at {brand.retainer_video_goal} videos</span>
        </div>
        <div className={`flex items-center gap-1.5 ${paceColors[paceStatus]}`}>
          <Target className="w-3.5 h-3.5 shrink-0" />
          <span>
            {neededPace > 0
              ? `${neededPace.toFixed(1)}/day needed (at ${currentPace.toFixed(1)}/day)`
              : `Pace: ${currentPace.toFixed(1)}/day`
            }
          </span>
        </div>
      </div>

      {/* Bonus Tiers */}
      {brand.retainer_bonus_tiers.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-zinc-400 mb-2">Bonus Tiers</p>
          <div className="space-y-1.5">
            {brand.retainer_bonus_tiers.map((tier, i) => {
              // For video-based tiers, check if met
              const isMet = tier.videos !== undefined && brand.video_count >= tier.videos;
              const payoutAmount = tier.payout ?? tier.bonus ?? 0;
              const threshold = tier.videos !== undefined
                ? `${tier.videos} videos`
                : tier.gmv !== undefined
                  ? `$${tier.gmv.toLocaleString()} GMV`
                  : '';

              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {isMet ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                  )}
                  <span className={isMet ? 'text-green-400 line-through' : 'text-zinc-300'}>
                    ${payoutAmount.toLocaleString()}
                  </span>
                  <span className="text-zinc-500">
                    {tier.label || threshold}
                  </span>
                  {isMet && (
                    <span className="text-[10px] text-green-500 font-medium ml-auto">EARNED</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-white/5">
        <Link
          href={`/admin/pipeline?brand=${encodeURIComponent(brand.name)}`}
          className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1"
        >
          <TrendingUp className="w-3 h-3" /> View Videos
        </Link>
        <Link
          href="/admin/content-studio"
          className="text-xs text-zinc-400 hover:text-zinc-300 flex items-center gap-1 ml-3"
        >
          + Add Video
        </Link>
      </div>
    </div>
  );
}
