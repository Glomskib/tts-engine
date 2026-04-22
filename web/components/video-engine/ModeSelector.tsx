'use client';

import type { Mode } from '@/lib/video-engine/types';

interface ModeOption {
  key: Mode;
  label: string;
  description: string;
  accent: string;
}

const OPTIONS: ModeOption[] = [
  {
    key: 'affiliate',
    label: 'Affiliate',
    description: 'Product hooks, demos, conversions. Optimized for TikTok Shop, UGC, and direct response.',
    accent: '#FF005C',
  },
  {
    key: 'nonprofit',
    label: 'Nonprofit',
    description: 'Mission, recap, recruitment. Optimized for emotion, group moments, testimonials, and donations.',
    accent: '#1AAE5B',
  },
];

interface Props {
  value: Mode;
  onChange: (mode: Mode) => void;
  disabled?: boolean;
}

export default function ModeSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
      {OPTIONS.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => !disabled && onChange(opt.key)}
            disabled={disabled}
            className={[
              'text-left rounded-xl border px-4 py-3 transition-all',
              active
                ? 'border-zinc-200 bg-zinc-900 ring-2 ring-offset-2 ring-offset-[#09090b]'
                : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700',
              disabled ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
            style={active ? { boxShadow: `0 0 0 2px ${opt.accent}` } : undefined}
          >
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-zinc-100">{opt.label}</span>
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: opt.accent }}
              />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{opt.description}</p>
          </button>
        );
      })}
    </div>
  );
}
