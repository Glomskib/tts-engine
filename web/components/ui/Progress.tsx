import type React from 'react';

/**
 * Progress — unified progress bar component for FlashFlow.
 *
 * Accepts value (0..1) OR current/total. Handles labels, size variants,
 * intent variants, and an animated indeterminate loading state.
 *
 * Usage:
 *   <Progress value={0.6} label="3 of 5 videos" />
 *   <Progress current={3} total={5} label="Videos" size="lg" intent="success" />
 *   <Progress indeterminate intent="gradient-violet-teal" />
 */

export type ProgressSize   = 'xs' | 'sm' | 'md' | 'lg';
export type ProgressIntent =
  | 'default'          // teal-500
  | 'success'          // emerald-500
  | 'warn'             // amber-500
  | 'danger'           // red-500
  | 'violet'           // violet-500/600
  | 'gradient'         // violet→purple
  | 'gradient-teal';   // teal→purple

export interface ProgressProps {
  /** 0..1 — the proportion filled. Mutually exclusive with current/total. */
  value?: number;
  /** Numerator when using current/total convenience props. */
  current?: number;
  /** Denominator when using current/total convenience props. */
  total?: number;
  /** Left-side label. When provided, label row is shown by default. Accepts ReactNode for rich markup. */
  label?: React.ReactNode;
  /**
   * Right-side label.
   * • Pass a string to override.
   * • Omit to default to "XX%".
   * • Pass false to hide the right label while keeping the left one.
   */
  sublabel?: string | false;
  /** Explicitly show/hide the label row. Defaults to true when label is provided. */
  showLabels?: boolean;
  /** Bar height. xs=h-1, sm=h-1.5, md=h-2 (default), lg=h-3 */
  size?: ProgressSize;
  /** Fill color / gradient. */
  intent?: ProgressIntent;
  /** Animated shimmer for indeterminate loading states. */
  indeterminate?: boolean;
  /** Extra classes on the outer wrapper. */
  className?: string;
  /** Accessible label (falls back to label prop). */
  'aria-label'?: string;
}

const SIZE_CLASS: Record<ProgressSize, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
};

const INTENT_CLASS: Record<ProgressIntent, string> = {
  default:          'bg-teal-500',
  success:          'bg-emerald-500',
  warn:             'bg-amber-500',
  danger:           'bg-red-500',
  violet:           'bg-violet-600',
  gradient:         'bg-gradient-to-r from-violet-500 to-purple-500',
  'gradient-teal':  'bg-gradient-to-r from-teal-500 to-purple-500',
};

export function Progress({
  value,
  current,
  total,
  label,
  sublabel,
  showLabels,
  size = 'md',
  intent = 'default',
  indeterminate = false,
  className = '',
  'aria-label': ariaLabel,
}: ProgressProps) {
  // Compute fill percentage (0..100), clamped
  let pct = 0;
  if (!indeterminate) {
    if (value !== undefined) {
      pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
    } else if (current !== undefined && total !== undefined && total > 0) {
      pct = Math.round(Math.min(1, Math.max(0, current / total)) * 100);
    }
  }

  const doShowLabels = showLabels ?? label !== undefined;
  const rightLabel   = sublabel !== undefined ? sublabel : (doShowLabels ? `${pct}%` : undefined);

  const h    = SIZE_CLASS[size];
  const fill = INTENT_CLASS[intent];

  return (
    <div className={`w-full${className ? ` ${className}` : ''}`}>
      {doShowLabels && (label || rightLabel) && (
        <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
          {label     && <span>{label}</span>}
          {rightLabel && <span>{rightLabel}</span>}
        </div>
      )}
      <div
        className={`rounded-full overflow-hidden bg-zinc-800 ${h}`}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${fill}${indeterminate ? ' animate-indeterminate' : ''}`}
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
