'use client';

export type ProgressInlineIntent = 'teal' | 'amber' | 'red' | 'neutral';

export interface ProgressInlineProps {
  /** 0–100 */
  value: number;
  label?: string;
  sublabel?: string;
  intent?: ProgressInlineIntent;
  className?: string;
}

const FILL: Record<ProgressInlineIntent, string> = {
  teal: 'bg-teal-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  neutral: 'bg-zinc-500',
};

export function ProgressInline({
  value,
  label,
  sublabel,
  intent = 'teal',
  className = '',
}: ProgressInlineProps) {
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div className={`w-full ${className}`}>
      {(label || sublabel) && (
        <div className="flex items-center justify-between gap-2 text-xs text-zinc-400 mb-1">
          {label && <span className="truncate">{label}</span>}
          {sublabel && <span className="shrink-0 tabular-nums">{sublabel}</span>}
        </div>
      )}
      <div
        className="h-2 rounded-full overflow-hidden bg-zinc-800"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${FILL[intent]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
