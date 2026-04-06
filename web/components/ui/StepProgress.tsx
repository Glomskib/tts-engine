'use client';

import { getUIStage, STAGE_ORDER, STAGE_CONFIGS, type UIStage } from '@/lib/ui/stages';
import { Check } from 'lucide-react';

interface StepProgressProps {
  recordingStatus: string | null;
  contentStatus?: string | null;
  /** Override stage directly */
  stage?: UIStage;
}

/**
 * Horizontal step progress showing: Script -> Recorded -> Edited -> Ready -> Posted
 * Highlights completed and current stage.
 */
export function StepProgress({ recordingStatus, contentStatus, stage: overrideStage }: StepProgressProps) {
  const currentStage = overrideStage ?? getUIStage(recordingStatus, contentStatus);
  const currentIndex = STAGE_ORDER.indexOf(currentStage);

  const steps = STAGE_ORDER.map((stage, i) => ({
    stage,
    label: STAGE_CONFIGS[stage].label,
    config: STAGE_CONFIGS[stage],
    isCompleted: i < currentIndex,
    isCurrent: i === currentIndex,
  }));

  return (
    <div className="flex items-center w-full gap-0" role="list" aria-label="Video progress">
      {steps.map((step, i) => (
        <div key={step.stage} className="flex items-center flex-1 min-w-0" role="listitem">
          {/* Step indicator */}
          <div className="flex flex-col items-center gap-1.5 min-w-0">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors ${
                step.isCompleted
                  ? 'bg-green-500/20 text-green-400'
                  : step.isCurrent
                  ? `${step.config.bg} ${step.config.color} ring-2 ring-current/30`
                  : 'bg-zinc-800 text-zinc-600'
              }`}
            >
              {step.isCompleted ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span
              className={`text-[10px] leading-tight text-center truncate max-w-[60px] ${
                step.isCurrent ? step.config.color + ' font-medium' : step.isCompleted ? 'text-zinc-400' : 'text-zinc-600'
              }`}
            >
              {step.label}
            </span>
          </div>

          {/* Connector line */}
          {i < steps.length - 1 && (
            <div
              className={`flex-1 h-0.5 mx-1 mt-[-18px] ${
                step.isCompleted ? 'bg-green-500/30' : 'bg-zinc-800'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
