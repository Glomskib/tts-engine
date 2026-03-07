'use client';

import type { CreatorStageResult } from '@/lib/creator-profile/stage';

interface Props {
  stageResult: CreatorStageResult;
  compact?: boolean;
}

export function CreatorStageBadge({ stageResult, compact }: Props) {
  if (compact) {
    return (
      <span
        title={stageResult.description}
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${stageResult.bg} ${stageResult.color}`}
      >
        {stageResult.stage}
      </span>
    );
  }

  return (
    <span
      title={stageResult.description}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${stageResult.bg} ${stageResult.color}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {stageResult.stage}
    </span>
  );
}
