'use client';

import type { ReactNode } from 'react';

export interface SegmentedControlOption {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
}

const SIZE = {
  sm: { outer: 'h-9', text: 'text-xs', px: 'px-3 py-1', iconGap: 'gap-1' },
  md: { outer: 'h-10', text: 'text-sm', px: 'px-3.5 py-1', iconGap: 'gap-1.5' },
} as const;

export function SegmentedControl({
  options,
  value,
  onChange,
  size = 'sm',
  fullWidth = true,
}: SegmentedControlProps) {
  const s = SIZE[size];

  return (
    <div
      role="radiogroup"
      className={`inline-flex items-center bg-zinc-800 rounded-lg border border-zinc-700 p-0.5 min-h-[44px] ${
        fullWidth ? 'w-full' : ''
      }`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={`flex items-center justify-center ${s.iconGap} ${s.px} ${s.outer} ${s.text} font-medium rounded-md transition-colors flex-1 min-w-0 ${
              active
                ? 'bg-teal-500/15 text-teal-400 ring-1 ring-teal-500/40'
                : 'text-zinc-400 hover:text-white active:text-white'
            } ${opt.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {opt.icon}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
