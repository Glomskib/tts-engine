'use client';

import Link from 'next/link';

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
    label: 'Editing Queue',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    href: '/admin/pipeline?status=needs_edit',
  },
  {
    key: 'ready_to_post',
    label: 'Ready to Post',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    href: '/admin/pipeline?status=ready_to_post',
  },
  {
    key: 'posted_this_week',
    label: 'Posted This Week',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    href: '/admin/pipeline?status=posted',
  },
] as const;

export function PipelineOverview({ counts }: { counts: PipelineCounts }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3">Production Pipeline</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
    </div>
  );
}
