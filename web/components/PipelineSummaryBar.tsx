'use client';

import { useMemo } from 'react';
import { Mic, Scissors, Send, CheckCircle2 } from 'lucide-react';
import { getUIStage, STAGE_CONFIGS, STAGE_ORDER } from '@/lib/ui/stages';

interface PipelineVideo {
  recording_status: string | null;
  status?: string;
  sla_status: string;
}

interface PipelineSummaryBarProps {
  videos: PipelineVideo[];
}

const STAGE_ICONS = {
  needs_recording: Mic,
  needs_editing: Scissors,
  ready_to_post: Send,
  posted: CheckCircle2,
};

export function PipelineSummaryBar({ videos }: PipelineSummaryBarProps) {
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const stage of STAGE_ORDER) counts[stage] = 0;
    for (const v of videos) {
      const stage = getUIStage(v.recording_status, null);
      counts[stage] = (counts[stage] || 0) + 1;
    }
    return counts;
  }, [videos]);

  if (videos.length === 0) return null;

  return (
    <div className="grid grid-cols-4 gap-2 mb-4">
      {STAGE_ORDER.map((stage) => {
        const config = STAGE_CONFIGS[stage];
        const count = stageCounts[stage] || 0;
        const Icon = STAGE_ICONS[stage];
        return (
          <div
            key={stage}
            className={`${config.bg} border ${config.border} rounded-xl px-3 py-3 text-center`}
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Icon className={`w-3.5 h-3.5 ${config.color} opacity-70`} />
              <span className={`text-xl font-bold ${count > 0 ? config.color : 'text-zinc-600'}`}>
                {count}
              </span>
            </div>
            <span className="text-[10px] text-zinc-400 leading-tight">{config.label}</span>
          </div>
        );
      })}
    </div>
  );
}
