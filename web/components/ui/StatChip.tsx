'use client';

import type { ReactNode } from 'react';

export interface StatChipProps {
  label: string;
  value: number | string;
  icon?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE = {
  sm: { text: 'text-lg', label: 'text-[10px] md:text-xs', pad: 'px-3 py-2' },
  md: { text: 'text-xl md:text-2xl', label: 'text-xs', pad: 'px-3 py-2.5 md:px-4 md:py-3' },
} as const;

export function StatChip({
  label,
  value,
  icon,
  size = 'sm',
  className = '',
}: StatChipProps) {
  const s = SIZE[size];

  return (
    <div
      className={`bg-zinc-900 border border-zinc-800 rounded-lg ${s.pad} min-h-[44px] flex items-center gap-2.5 ${className}`}
    >
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1 ${s.label} text-zinc-400 mb-0.5`}>
          {icon}
          <span className="truncate">{label}</span>
        </div>
        <div className={`${s.text} font-bold text-white tabular-nums`}>{value}</div>
      </div>
    </div>
  );
}
