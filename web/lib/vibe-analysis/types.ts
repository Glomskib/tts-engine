/**
 * Video Vibe Analysis — Types
 *
 * Normalized labels and structures for delivery style,
 * pacing, visual rhythm, and CTA analysis.
 */

// ── Delivery Style ──────────────────────────────────────────
export type DeliveryStyle =
  | 'high_energy_punchy'
  | 'calm_direct'
  | 'skeptical_conversational'
  | 'deadpan_sharp'
  | 'chaotic_fast'
  | 'nurturing_soft'
  | 'urgent_direct'
  | 'playful_casual'
  | 'authoritative_measured';

export const DELIVERY_STYLE_LABELS: Record<DeliveryStyle, string> = {
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

// ── Pacing Style ──────────────────────────────────────────
export type PacingStyle =
  | 'fast_hook_medium_body'
  | 'slow_build_fast_payoff'
  | 'steady_explainer'
  | 'rapid_fire'
  | 'punchy_short_beats'
  | 'conversational_flow';

export const PACING_STYLE_LABELS: Record<PacingStyle, string> = {
  fast_hook_medium_body: 'Fast hook, medium body, quick CTA',
  slow_build_fast_payoff: 'Slow build, fast payoff',
  steady_explainer: 'Steady explainer pace',
  rapid_fire: 'Rapid-fire throughout',
  punchy_short_beats: 'Punchy short beats',
  conversational_flow: 'Conversational flow',
};

// ── Hook Energy ──────────────────────────────────────────
export type HookEnergy = 'immediate' | 'building' | 'delayed';

export const HOOK_ENERGY_LABELS: Record<HookEnergy, string> = {
  immediate: 'Immediate',
  building: 'Building',
  delayed: 'Delayed',
};

// ── Visual Style ──────────────────────────────────────────
export type VisualStyle =
  | 'talking_head'
  | 'demo_led'
  | 'montage_led'
  | 'mixed'
  | 'screen_recording'
  | 'text_overlay_driven';

export const VISUAL_STYLE_LABELS: Record<VisualStyle, string> = {
  talking_head: 'Talking head',
  demo_led: 'Demo-led',
  montage_led: 'Montage-led',
  mixed: 'Mixed format',
  screen_recording: 'Screen recording',
  text_overlay_driven: 'Text overlay driven',
};

// ── Visual Rhythm ──────────────────────────────────────────
export type VisualRhythm = 'fast_cut' | 'medium_cut' | 'slow_cut' | 'static';

export const VISUAL_RHYTHM_LABELS: Record<VisualRhythm, string> = {
  fast_cut: 'Fast-cut',
  medium_cut: 'Medium-cut',
  slow_cut: 'Slow & steady',
  static: 'Static / single shot',
};

// ── CTA Tone ──────────────────────────────────────────
export type CtaTone =
  | 'casual_direct'
  | 'soft_suggestive'
  | 'aggressive_push'
  | 'community_prompt'
  | 'curiosity_close'
  | 'no_cta';

export const CTA_TONE_LABELS: Record<CtaTone, string> = {
  casual_direct: 'Casual & direct',
  soft_suggestive: 'Soft & suggestive',
  aggressive_push: 'Aggressive push',
  community_prompt: 'Community prompt',
  curiosity_close: 'Curiosity close',
  no_cta: 'No CTA',
};

// ── Reveal Timing ──────────────────────────────────────────
export type RevealTiming = 'immediate' | 'mid_video' | 'delayed_payoff';

export const REVEAL_TIMING_LABELS: Record<RevealTiming, string> = {
  immediate: 'Immediate reveal',
  mid_video: 'Mid-video reveal',
  delayed_payoff: 'Delayed payoff',
};

// ── Full Vibe Analysis Result ────────────────────────────
export interface VibeAnalysis {
  delivery_style: DeliveryStyle;
  pacing_style: PacingStyle;
  hook_energy: HookEnergy;
  visual_style: VisualStyle;
  visual_rhythm: VisualRhythm;
  cta_tone: CtaTone;
  reveal_timing: RevealTiming;

  /** 3-6 bullet recreate-this-vibe guidance lines */
  recreate_guidance: string[];

  /** Structured timing breakdown */
  timing_arc: {
    hook_ends_at: number;        // seconds
    explanation_ends_at: number;  // seconds
    proof_reveal_at: number;     // seconds
    cta_starts_at: number;       // seconds
  };

  /** Raw signals (backend only, not shown in UI) */
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

  /** Confidence 0-1 */
  confidence: number;

  /** Analysis version for future migration */
  version: string;
}

// ── Prompt Context (for generation integration) ─────────
export interface VibePromptContext {
  delivery_style: string;
  pacing_style: string;
  hook_energy: string;
  visual_rhythm: string;
  cta_tone: string;
  recreate_guidance: string[];
}
