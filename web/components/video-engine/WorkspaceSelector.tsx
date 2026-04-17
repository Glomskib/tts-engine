'use client';

export type Workspace = 'creator' | 'brand_agency';
export type Goal = 'sell' | 'promote' | 'reach' | 'story';

interface WorkspaceOption {
  key: Workspace;
  label: string;
  description: string;
  accent: string;
}

const OPTIONS: WorkspaceOption[] = [
  {
    key: 'creator',
    label: 'Creator',
    description: 'Short clips for TikTok, Reels, and Shorts — product demos, reviews, talking head.',
    accent: '#FF005C',
  },
  {
    key: 'brand_agency',
    label: 'Brand / Agency',
    description: 'Ads, promos, event recaps, and campaigns for a brand or client.',
    accent: '#3B82F6',
  },
];

interface Props {
  value: Workspace;
  onChange: (w: Workspace) => void;
  disabled?: boolean;
}

export default function WorkspaceSelector({ value, onChange, disabled }: Props) {
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
              'text-left rounded-xl border px-4 py-4 transition-all',
              active
                ? 'border-zinc-200 bg-zinc-900'
                : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700',
              disabled ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
            style={active ? { boxShadow: `0 0 0 2px ${opt.accent}` } : undefined}
          >
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-zinc-100">{opt.label}</span>
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: opt.accent }} />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{opt.description}</p>
          </button>
        );
      })}
    </div>
  );
}

const GOALS: Array<{ key: Goal; label: string }> = [
  { key: 'sell', label: 'Sell a product' },
  { key: 'promote', label: 'Promote something' },
  { key: 'reach', label: 'Grow reach' },
  { key: 'story', label: 'Tell a story' },
];

interface GoalProps {
  value: Goal | null;
  onChange: (g: Goal | null) => void;
  disabled?: boolean;
}

export function GoalSelector({ value, onChange, disabled }: GoalProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {GOALS.map((g) => {
        const active = value === g.key;
        return (
          <button
            key={g.key}
            type="button"
            onClick={() => !disabled && onChange(active ? null : g.key)}
            disabled={disabled}
            className={[
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'border-zinc-100 bg-zinc-100 text-zinc-900'
                : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700',
              disabled ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          >
            {g.label}
          </button>
        );
      })}
    </div>
  );
}

// Maps user-facing workspace → internal mode the engine already understands.
export function workspaceToMode(w: Workspace): 'affiliate' | 'nonprofit' {
  return w === 'creator' ? 'affiliate' : 'nonprofit';
}

// Maps internal mode → user-facing workspace label (for read paths).
export function modeToWorkspaceLabel(mode: 'affiliate' | 'nonprofit'): string {
  return mode === 'affiliate' ? 'Creator' : 'Brand / Agency';
}
