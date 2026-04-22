'use client';

export type Workspace = 'creator' | 'brand_agency' | 'clipper';
export type Goal = 'sell' | 'promote' | 'reach' | 'story';
export type ClipperPreset = 'viral' | 'highlights' | 'educational' | 'talking_head';

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

const GOALS: Array<{ key: Goal; label: string; hint: string }> = [
  { key: 'sell', label: 'Sell a product', hint: 'Hook → demo → CTA. Optimized for clicks and conversions.' },
  { key: 'promote', label: 'Promote something', hint: 'Highlight features and benefits. Great for launches and announcements.' },
  { key: 'reach', label: 'Grow reach', hint: 'Attention-first editing. Punchier cuts, trending pacing, shareable moments.' },
  { key: 'story', label: 'Tell a story', hint: 'Longer flow, natural pacing. Best for founder stories and behind-the-scenes.' },
];

interface GoalProps {
  value: Goal | null;
  onChange: (g: Goal | null) => void;
  disabled?: boolean;
}

export function GoalSelector({ value, onChange, disabled }: GoalProps) {
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
      {GOALS.map((g) => {
        const active = value === g.key;
        return (
          <button
            key={g.key}
            type="button"
            onClick={() => !disabled && onChange(active ? null : g.key)}
            disabled={disabled}
            className={[
              'text-left rounded-xl border px-3 py-2.5 transition-all',
              active
                ? 'border-zinc-100 bg-zinc-900'
                : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700',
              disabled ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <div className="text-xs font-semibold text-zinc-100">{g.label}</div>
            <p className="mt-1 text-[11px] leading-snug text-zinc-500">{g.hint}</p>
          </button>
        );
      })}
    </div>
  );
}

// Maps user-facing workspace → internal mode the engine already understands.
export function workspaceToMode(w: Workspace): 'affiliate' | 'nonprofit' | 'clipper' {
  if (w === 'creator') return 'affiliate';
  if (w === 'brand_agency') return 'nonprofit';
  return 'clipper';
}

// Maps internal mode → user-facing workspace label (for read paths).
export function modeToWorkspaceLabel(mode: string): string {
  if (mode === 'affiliate') return 'Creator';
  if (mode === 'nonprofit') return 'Brand / Agency';
  if (mode === 'clipper') return 'Long-Form Clipper';
  return mode;
}

// Clipper presets map 1:1 to template keys so picking one pins preset_keys at the API.
const CLIPPER_PRESETS: Array<{ key: ClipperPreset; label: string; hint: string; templateKey: string }> = [
  { key: 'viral',        label: 'Viral moments',     hint: 'Scroll-stopping hooks. Bold captions, punch-in, high energy.', templateKey: 'clip_viral_moment' },
  { key: 'highlights',   label: 'Fast highlights',   hint: 'Short, punchy cuts. Best for volume and daily posting.',       templateKey: 'clip_fast_highlight' },
  { key: 'educational',  label: 'Educational cuts',  hint: 'Explainer-shaped with informational captions. Clean pacing.',  templateKey: 'clip_educational_cut' },
  { key: 'talking_head', label: 'Clean talking-head', hint: 'Lower-third captions only. No overlay, speaker stays centered.', templateKey: 'clip_clean_talking_head' },
];

export function clipperPresetToTemplateKey(p: ClipperPreset): string {
  return CLIPPER_PRESETS.find((x) => x.key === p)?.templateKey ?? 'clip_fast_highlight';
}

interface ClipperPresetProps {
  value: ClipperPreset | null;
  onChange: (p: ClipperPreset | null) => void;
  disabled?: boolean;
}

export function ClipperPresetSelector({ value, onChange, disabled }: ClipperPresetProps) {
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
      {CLIPPER_PRESETS.map((p) => {
        const active = value === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => !disabled && onChange(active ? null : p.key)}
            disabled={disabled}
            className={[
              'text-left rounded-xl border px-3 py-2.5 transition-all',
              active
                ? 'border-zinc-100 bg-zinc-900'
                : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700',
              disabled ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <div className="text-xs font-semibold text-zinc-100">{p.label}</div>
            <p className="mt-1 text-[11px] leading-snug text-zinc-500">{p.hint}</p>
          </button>
        );
      })}
    </div>
  );
}
