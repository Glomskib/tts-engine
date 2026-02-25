'use client';

import type { StageAnalytics } from '@/lib/command-center/crm-types';

interface Props {
  stages: StageAnalytics[];
  conversionRates: { from: string; to: string; rate: number }[];
}

export default function PipelineProgressBar({ stages, conversionRates }: Props) {
  const totalDeals = stages.reduce((sum, s) => sum + s.deal_count, 0);
  if (totalDeals === 0) {
    return (
      <div className="text-sm text-zinc-500 py-3 text-center">No deals in pipeline yet</div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 overflow-hidden">
      {stages.map((stage, i) => {
        const pct = Math.max((stage.deal_count / totalDeals) * 100, 8);
        const convRate = conversionRates.find((c) => c.from === stage.key);

        return (
          <div key={stage.key} className="flex items-center min-w-0" style={{ flex: pct }}>
            {/* Stage segment */}
            <div
              className="relative h-8 rounded-sm flex items-center justify-center px-1 sm:px-2 min-w-0 w-full overflow-hidden"
              style={{ backgroundColor: `${stage.color}30` }}
              title={`${stage.label}: ${stage.deal_count} deals`}
            >
              <span className="text-[10px] font-medium truncate" style={{ color: stage.color }}>
                {stage.label}
              </span>
              <span
                className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-bold whitespace-nowrap"
                style={{ color: stage.color }}
              >
                {stage.deal_count}
              </span>
            </div>

            {/* Conversion arrow between segments */}
            {i < stages.length - 1 && convRate && (
              <span className="text-[9px] text-zinc-500 px-0.5 shrink-0">
                {convRate.rate}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
