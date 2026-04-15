'use client';

import Link from 'next/link';
import { TrendingUp } from 'lucide-react';

interface PipelineCounts {
  draft: number;
  needs_edit: number;
  ready_to_post: number;
  posted: number;
  failed: number;
  total: number;
  recording: {
    not_recorded: number;
    recorded: number;
    ai_rendering: number;
    edited: number;
  };
  posted_this_week: number;
}

const STAGES = [
  {
    key: 'draft',
    label: 'Drafts',
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-500/10',
    borderColor: 'border-zinc-500/20',
    href: '/admin/pipeline?status=draft',
    subKey: 'not_recorded',
    subLabel: 'ready to record',
  },
  {
    key: 'needs_edit',
    label: 'In editing',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    href: '/admin/pipeline?status=needs_edit',
  },
  {
    key: 'ready_to_post',
    label: 'Ready to post',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    href: '/admin/pipeline?status=ready_to_post',
  },
  {
    key: 'posted_this_week',
    label: 'Posted this week',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    href: '/admin/pipeline?status=posted',
  },
] as const;

// Weekly posting goal: 5 videos/week is a healthy affiliate cadence
const WEEKLY_GOAL = 5;

function WeeklyVelocityBar({ posted }: { posted: number }) {
  const pct = Math.min(100, Math.round((posted / WEEKLY_GOAL) * 100));
  const isOnTrack = posted >= WEEKLY_GOAL;
  const isBehind = posted < Math.floor(WEEKLY_GOAL / 2);

  const barColor = isOnTrack ? 'bg-emerald-500' : isBehind ? 'bg-amber-500' : 'bg-teal-500';
  const label = isOnTrack
    ? `On pace 🔥 — ${posted} of ${WEEKLY_GOAL} posted this week`
    : isBehind
    ? `${WEEKLY_GOAL - posted} more to hit your weekly goal`
    : `${posted} of ${WEEKLY_GOAL} posted — keep going`;

  return (
    <Link href="/admin/pipeline?status=posted" className="group block p-4 rounded-xl bg-zinc-900/50 border border-white/8 hover:border-white/15 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-400">This week</span>
        </div>
        <span className={`text-xs font-semibold ${isOnTrack ? 'text-emerald-400' : isBehind ? 'text-amber-400' : 'text-teal-400'}`}>
          {posted}/{WEEKLY_GOAL}
        </span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1.5">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-zinc-600">{label}</p>
    </Link>
  );
}

export function PipelineOverview({ counts }: { counts: PipelineCounts }) {
  return (
    <div>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-white">Where your videos are</h2>
        <p className="text-zinc-500 text-xs mt-0.5">Tap a stage to jump in.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {STAGES.map((stage) => {
          const count = stage.key === 'posted_this_week'
            ? counts.posted_this_week
            : counts[stage.key as keyof PipelineCounts] as number;

          return (
            <Link
              key={stage.key}
              href={stage.href}
              className={`${stage.bgColor} border ${stage.borderColor} rounded-xl p-4 hover:scale-[1.02] transition-all active:scale-[0.98] min-h-[80px]`}
            >
              <p className={`text-3xl font-bold ${stage.color}`}>{count}</p>
              <p className="text-zinc-400 text-xs mt-1 font-medium">{stage.label}</p>
              {'subKey' in stage && stage.key === 'draft' && counts.recording && (
                <p className="text-zinc-500 text-[10px] mt-0.5">
                  {counts.recording.not_recorded} ready to record
                </p>
              )}
            </Link>
          );
        })}
      </div>
      <WeeklyVelocityBar posted={counts.posted_this_week} />
    </div>
  );
}
