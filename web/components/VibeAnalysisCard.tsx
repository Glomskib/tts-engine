'use client';

import { useState } from 'react';
import {
  Loader2,
  Zap,
  Clock,
  Eye,
  Megaphone,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Wand2,
} from 'lucide-react';

// ============================================================================
// Types (client-side mirror — no server imports in 'use client')
// ============================================================================

interface VibeAnalysis {
  delivery_style: string;
  pacing_style: string;
  hook_energy: string;
  visual_style: string;
  visual_rhythm: string;
  cta_tone: string;
  reveal_timing: string;
  recreate_guidance: string[];
  timing_arc: {
    hook_ends_at: number;
    explanation_ends_at: number;
    proof_reveal_at: number;
    cta_starts_at: number;
  };
  _signals: {
    words_per_minute: number;
    avg_pause_length: number;
    pause_frequency: number;
    hook_word_count: number;
    total_word_count: number;
    segment_count: number;
    estimated_cuts: number;
    first_3s_word_count: number;
    duration_seconds: number;
  };
  confidence: number;
  version: string;
}

// ── Human-readable labels ──────────────────────────────────

const DELIVERY_LABELS: Record<string, string> = {
  high_energy_punchy: 'High-energy & punchy',
  calm_direct: 'Calm & direct',
  skeptical_conversational: 'Skeptical & conversational',
  deadpan_sharp: 'Deadpan & sharp',
  chaotic_fast: 'Chaotic & fast',
  nurturing_soft: 'Nurturing & soft',
  urgent_direct: 'Urgent & direct',
  playful_casual: 'Playful & casual',
  authoritative_measured: 'Authoritative & measured',
};

const PACING_LABELS: Record<string, string> = {
  fast_hook_medium_body: 'Fast hook, medium body, quick CTA',
  slow_build_fast_payoff: 'Slow build, fast payoff',
  steady_explainer: 'Steady explainer pace',
  rapid_fire: 'Rapid-fire throughout',
  punchy_short_beats: 'Punchy short beats',
  conversational_flow: 'Conversational flow',
};

const HOOK_ENERGY_LABELS: Record<string, string> = {
  immediate: 'Immediate',
  building: 'Building',
  delayed: 'Delayed',
};

const VISUAL_LABELS: Record<string, string> = {
  talking_head: 'Talking head',
  demo_led: 'Demo-led',
  montage_led: 'Montage-led',
  mixed: 'Mixed format',
  screen_recording: 'Screen recording',
  text_overlay_driven: 'Text overlay driven',
};

const RHYTHM_LABELS: Record<string, string> = {
  fast_cut: 'Fast-cut',
  medium_cut: 'Medium-cut',
  slow_cut: 'Slow & steady',
  static: 'Static / single shot',
};

const CTA_LABELS: Record<string, string> = {
  casual_direct: 'Casual & direct',
  soft_suggestive: 'Soft & suggestive',
  aggressive_push: 'Aggressive push',
  community_prompt: 'Community prompt',
  curiosity_close: 'Curiosity close',
  no_cta: 'No CTA',
};

const REVEAL_LABELS: Record<string, string> = {
  immediate: 'Immediate reveal',
  mid_video: 'Mid-video reveal',
  delayed_payoff: 'Delayed payoff',
};

// ── Color helpers ──────────────────────────────────────────

function energyColor(energy: string): string {
  if (energy === 'immediate') return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
  if (energy === 'building') return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
}

function deliveryColor(style: string): string {
  if (style.includes('energy') || style.includes('chaotic') || style.includes('urgent'))
    return 'bg-orange-500/10 text-orange-400';
  if (style.includes('calm') || style.includes('nurturing'))
    return 'bg-blue-500/10 text-blue-400';
  if (style.includes('skeptical') || style.includes('deadpan'))
    return 'bg-violet-500/10 text-violet-400';
  return 'bg-emerald-500/10 text-emerald-400';
}

// ============================================================================
// Props
// ============================================================================

interface VibeAnalysisCardProps {
  transcript: string;
  segments: Array<{ start: number; end: number; text: string }>;
  duration: number;
  analysis?: Record<string, unknown> | null;
  /** Called when user wants to generate hooks/scripts in this style */
  onGenerateInStyle?: (vibe: VibeAnalysis) => void;
}

// ============================================================================
// Component
// ============================================================================

export default function VibeAnalysisCard({
  transcript,
  segments,
  duration,
  analysis,
  onGenerateInStyle,
}: VibeAnalysisCardProps) {
  const [vibe, setVibe] = useState<VibeAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  async function analyzeVibe() {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/transcribe/vibe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, segments, duration, analysis }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Analysis failed');
        return;
      }

      setVibe(data.vibe);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function copyVibeText() {
    if (!vibe) return;
    const text = [
      `Delivery Style: ${DELIVERY_LABELS[vibe.delivery_style] || vibe.delivery_style}`,
      `Pacing: ${PACING_LABELS[vibe.pacing_style] || vibe.pacing_style}`,
      `Hook Energy: ${HOOK_ENERGY_LABELS[vibe.hook_energy] || vibe.hook_energy}`,
      `Visual Style: ${VISUAL_LABELS[vibe.visual_style] || vibe.visual_style}`,
      `Visual Rhythm: ${RHYTHM_LABELS[vibe.visual_rhythm] || vibe.visual_rhythm}`,
      `CTA Tone: ${CTA_LABELS[vibe.cta_tone] || vibe.cta_tone}`,
      `Reveal: ${REVEAL_LABELS[vibe.reveal_timing] || vibe.reveal_timing}`,
      '',
      'Recreate This Vibe:',
      ...vibe.recreate_guidance.map((g) => `• ${g}`),
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Not yet analyzed ─────────────────────────────────────
  if (!vibe && !loading) {
    return (
      <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden">
        <button
          onClick={analyzeVibe}
          disabled={loading}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-white/[0.02] transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Sparkles size={20} className="text-violet-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Video Vibe</h3>
              <p className="text-sm text-zinc-400">
                Delivery style, pacing, visual rhythm, CTA tone
              </p>
            </div>
          </div>
          <span className="text-sm text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity">
            Analyze →
          </span>
        </button>
        {error && (
          <div className="px-6 pb-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-zinc-900/50 border border-violet-500/20 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <Loader2 size={20} className="text-violet-400 animate-spin" />
          <div>
            <h3 className="text-lg font-semibold text-white">Analyzing Vibe...</h3>
            <p className="text-sm text-zinc-400">Reading delivery, pacing, and rhythm</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Results ──────────────────────────────────────────────
  return (
    <div className="bg-zinc-900/50 border border-violet-500/20 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
            <Sparkles size={20} className="text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Video Vibe</h3>
            <p className="text-sm text-zinc-400">
              {DELIVERY_LABELS[vibe!.delivery_style]} · {PACING_LABELS[vibe!.pacing_style]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyVibeText();
            }}
            className="p-2 rounded-lg hover:bg-zinc-700/50 transition-colors"
            title="Copy vibe summary"
          >
            {copied ? (
              <Check size={16} className="text-green-400" />
            ) : (
              <Copy size={16} className="text-zinc-400" />
            )}
          </button>
          {expanded ? (
            <ChevronUp size={20} className="text-zinc-400" />
          ) : (
            <ChevronDown size={20} className="text-zinc-400" />
          )}
        </div>
      </button>

      {expanded && vibe && (
        <div className="px-6 pb-6 space-y-5">
          {/* Vibe Labels Grid */}
          <div className="grid grid-cols-2 gap-3">
            <VibeLabel
              icon={<Megaphone size={14} />}
              label="Delivery Style"
              value={DELIVERY_LABELS[vibe.delivery_style] || vibe.delivery_style}
              colorClass={deliveryColor(vibe.delivery_style)}
            />
            <VibeLabel
              icon={<Clock size={14} />}
              label="Pacing"
              value={PACING_LABELS[vibe.pacing_style] || vibe.pacing_style}
              colorClass="bg-cyan-500/10 text-cyan-400"
            />
            <VibeLabel
              icon={<Zap size={14} />}
              label="Hook Energy"
              value={HOOK_ENERGY_LABELS[vibe.hook_energy] || vibe.hook_energy}
              colorClass={energyColor(vibe.hook_energy)}
            />
            <VibeLabel
              icon={<Eye size={14} />}
              label="Visual Rhythm"
              value={`${VISUAL_LABELS[vibe.visual_style] || vibe.visual_style} · ${RHYTHM_LABELS[vibe.visual_rhythm] || vibe.visual_rhythm}`}
              colorClass="bg-pink-500/10 text-pink-400"
            />
          </div>

          {/* CTA + Reveal row */}
          <div className="flex gap-3">
            <div className="flex-1 rounded-lg bg-zinc-800/50 border border-white/5 p-3">
              <span className="text-xs text-zinc-500 uppercase tracking-wide">CTA Tone</span>
              <p className="text-sm text-zinc-200 mt-1">
                {CTA_LABELS[vibe.cta_tone] || vibe.cta_tone}
              </p>
            </div>
            <div className="flex-1 rounded-lg bg-zinc-800/50 border border-white/5 p-3">
              <span className="text-xs text-zinc-500 uppercase tracking-wide">Reveal</span>
              <p className="text-sm text-zinc-200 mt-1">
                {REVEAL_LABELS[vibe.reveal_timing] || vibe.reveal_timing}
              </p>
            </div>
          </div>

          {/* Timing Arc */}
          <TimingArc arc={vibe.timing_arc} duration={vibe._signals.duration_seconds} />

          {/* Recreate This Vibe */}
          {vibe.recreate_guidance.length > 0 && (
            <div className="rounded-xl bg-violet-500/5 border border-violet-500/15 p-5">
              <h4 className="text-sm font-semibold text-violet-300 flex items-center gap-2 mb-3">
                <Wand2 size={14} />
                Recreate This Vibe
              </h4>
              <ul className="space-y-2">
                {vibe.recreate_guidance.map((tip, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-zinc-300"
                  >
                    <span className="text-violet-400 mt-0.5 shrink-0">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          {onGenerateInStyle && (
            <div className="flex gap-2">
              <button
                onClick={() => onGenerateInStyle(vibe)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
              >
                <Wand2 size={14} />
                Write In This Style
              </button>
              <button
                onClick={() => {
                  const params = new URLSearchParams({
                    topic: 'Video breakdown',
                    source: 'transcript',
                  });
                  window.location.href = `/admin/content-pack?${params.toString()}`;
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 text-sm font-medium transition-colors"
              >
                Build Content Pack
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function VibeLabel({
  icon,
  label,
  value,
  colorClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <div className="rounded-lg bg-zinc-800/50 border border-white/5 p-3">
      <span className="text-xs text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <p className="mt-1.5">
        <span className={`inline-flex px-2.5 py-1 rounded-full text-sm font-medium ${colorClass}`}>
          {value}
        </span>
      </p>
    </div>
  );
}

function TimingArc({
  arc,
  duration,
}: {
  arc: VibeAnalysis['timing_arc'];
  duration: number;
}) {
  if (duration <= 0) return null;

  const sections = [
    { label: 'Hook', end: arc.hook_ends_at, color: 'bg-orange-500' },
    { label: 'Explain', end: arc.explanation_ends_at, color: 'bg-cyan-500' },
    { label: 'Proof', end: arc.proof_reveal_at, color: 'bg-violet-500' },
    { label: 'CTA', end: duration, color: 'bg-green-500' },
  ];

  let prevEnd = 0;

  return (
    <div>
      <span className="text-xs text-zinc-500 uppercase tracking-wide">Timing Arc</span>
      <div className="flex h-3 rounded-full overflow-hidden mt-2 bg-zinc-800">
        {sections.map((section, i) => {
          const width = ((section.end - prevEnd) / duration) * 100;
          prevEnd = section.end;
          if (width <= 0) return null;
          return (
            <div
              key={i}
              className={`${section.color} opacity-60 hover:opacity-100 transition-opacity relative group`}
              style={{ width: `${Math.max(width, 2)}%` }}
              title={`${section.label}: ${Math.round(section.end - (i > 0 ? sections[i - 1].end : 0))}s`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5 text-xs text-zinc-500">
        {sections.map((section, i) => (
          <span key={i}>{section.label}</span>
        ))}
      </div>
    </div>
  );
}
