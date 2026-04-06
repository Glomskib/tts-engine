'use client';

import { getUIStage, STAGE_CONFIGS, type UIStage } from '@/lib/ui/stages';

interface StageChipProps {
  recordingStatus: string | null;
  contentStatus?: string | null;
  /** Override: pass a stage directly instead of computing from statuses */
  stage?: UIStage;
  size?: 'sm' | 'md';
}

/**
 * Simplified stage chip showing one of 4 user-facing stages.
 * Single source of truth via getUIStage().
 */
export function StageChip({ recordingStatus, contentStatus, stage: overrideStage, size = 'sm' }: StageChipProps) {
  const stage = overrideStage ?? getUIStage(recordingStatus, contentStatus);
  const config = STAGE_CONFIGS[stage];

  const sizeClass = size === 'sm'
    ? 'px-2.5 py-1 text-[11px]'
    : 'px-3 py-1.5 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClass} ${config.bg} ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} shrink-0`} />
      {config.label}
    </span>
  );
}
