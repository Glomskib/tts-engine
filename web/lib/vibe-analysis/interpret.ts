/**
 * Video Vibe Analysis — Interpretation Layer
 *
 * Turns raw pacing signals + AI analysis into normalized
 * FlashFlow vibe labels and recreate-this-vibe guidance.
 *
 * Two-tier approach:
 * 1. Heuristic classification from transcript signals (fast, free)
 * 2. AI interpretation for nuance, visual analysis, recreate guidance
 */

import type { PacingSignals } from './signals';
import type {
  VibeAnalysis,
  DeliveryStyle,
  PacingStyle,
  HookEnergy,
  VisualStyle,
  VisualRhythm,
  CtaTone,
  RevealTiming,
} from './types';

// ── Heuristic classification (no AI, instant) ────────────

export function classifyDeliveryFromSignals(signals: PacingSignals): DeliveryStyle {
  const { words_per_minute, avg_pause_length, pause_frequency } = signals;

  if (words_per_minute > 180 && pause_frequency < 3) return 'chaotic_fast';
  if (words_per_minute > 160 && avg_pause_length < 0.4) return 'high_energy_punchy';
  if (words_per_minute > 160) return 'urgent_direct';
  if (words_per_minute < 110 && avg_pause_length > 0.8) return 'calm_direct';
  if (words_per_minute < 110 && pause_frequency > 5) return 'deadpan_sharp';
  if (words_per_minute < 130 && avg_pause_length > 0.6) return 'nurturing_soft';
  if (avg_pause_length > 0.5 && words_per_minute < 150) return 'skeptical_conversational';
  if (words_per_minute >= 130 && words_per_minute <= 160) return 'playful_casual';
  return 'authoritative_measured';
}

export function classifyPacingFromSignals(signals: PacingSignals): PacingStyle {
  const { first_3s_word_count, pace_acceleration, words_per_minute, avg_pause_length } = signals;

  const fastHook = first_3s_word_count >= 8;

  if (words_per_minute > 170) return 'rapid_fire';
  if (fastHook && pace_acceleration === 'decelerating') return 'fast_hook_medium_body';
  if (!fastHook && pace_acceleration === 'accelerating') return 'slow_build_fast_payoff';
  if (avg_pause_length < 0.3 && words_per_minute > 140) return 'punchy_short_beats';
  if (avg_pause_length > 0.5) return 'conversational_flow';
  return 'steady_explainer';
}

export function classifyHookEnergyFromSignals(signals: PacingSignals): HookEnergy {
  const { first_3s_word_count, hook_word_count } = signals;

  if (first_3s_word_count >= 10 || hook_word_count >= 12) return 'immediate';
  if (first_3s_word_count >= 5) return 'building';
  return 'delayed';
}

// ── AI-powered full interpretation ──────────────────────

interface InterpretInput {
  transcript: string;
  segments: Array<{ start: number; end: number; text: string }>;
  duration: number;
  signals: PacingSignals;
  /** Existing analysis from transcriber (hook, format, etc.) */
  existingAnalysis?: Record<string, unknown> | null;
  /** Base64 frames for visual analysis (optional) */
  frames?: Array<{ timestamp_seconds: number; base64_jpeg: string }>;
}

interface AIVibeResult {
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
  estimated_cuts: number;
}

/**
 * Full vibe interpretation using heuristic signals + AI.
 * The AI refines heuristic guesses and adds visual/CTA/recreate analysis.
 */
export async function interpretVibe(input: InterpretInput): Promise<VibeAnalysis> {
  const { transcript, segments, duration, signals, existingAnalysis, frames } = input;

  // Heuristic pre-classification (fallback if AI fails)
  const heuristicDelivery = classifyDeliveryFromSignals(signals);
  const heuristicPacing = classifyPacingFromSignals(signals);
  const heuristicHookEnergy = classifyHookEnergyFromSignals(signals);

  // Build AI prompt
  const signalSummary = `
Speaking rate: ${signals.words_per_minute} words/min
Average pause: ${signals.avg_pause_length}s
Pause frequency: ${signals.pause_frequency} notable pauses/min
First 3 seconds: ${signals.first_3s_word_count} words
Hook (first segment): ${signals.hook_word_count} words
Total words: ${signals.total_word_count}
Duration: ${signals.duration_seconds}s
Pacing trend: ${signals.pace_acceleration}
Longest pause: ${signals.longest_pause_duration}s at ${Math.round(signals.longest_pause_position * 100)}% through`;

  const existingContext = existingAnalysis
    ? `\nExisting analysis: ${JSON.stringify(existingAnalysis)}`
    : '';

  // Build content blocks for multimodal (frames + text)
  const contentBlocks: Array<Record<string, unknown>> = [];

  if (frames && frames.length > 0) {
    for (const frame of frames.slice(0, 4)) {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: frame.base64_jpeg,
        },
      });
    }
  }

  const promptText = `Analyze this video's vibe — how it FEELS to watch, not what it says.

TRANSCRIPT (${segments.length} segments, ${duration}s):
${transcript.slice(0, 3000)}

TIMING SIGNALS:
${signalSummary}
${existingContext}
${frames && frames.length > 0 ? `\n${frames.length} video frames are attached for visual analysis.` : ''}

My heuristic guesses (refine these):
- Delivery: ${heuristicDelivery}
- Pacing: ${heuristicPacing}
- Hook energy: ${heuristicHookEnergy}

CLASSIFY using EXACTLY these values:

delivery_style: high_energy_punchy | calm_direct | skeptical_conversational | deadpan_sharp | chaotic_fast | nurturing_soft | urgent_direct | playful_casual | authoritative_measured

pacing_style: fast_hook_medium_body | slow_build_fast_payoff | steady_explainer | rapid_fire | punchy_short_beats | conversational_flow

hook_energy: immediate | building | delayed

visual_style: talking_head | demo_led | montage_led | mixed | screen_recording | text_overlay_driven

visual_rhythm: fast_cut | medium_cut | slow_cut | static

cta_tone: casual_direct | soft_suggestive | aggressive_push | community_prompt | curiosity_close | no_cta

reveal_timing: immediate | mid_video | delayed_payoff

Also provide:
- recreate_guidance: 4-6 practical bullets for recreating this vibe WITHOUT copying the words. Written for a creator, not a scientist. Example bullets: "Open with a blunt statement in the first 2 seconds", "Keep your explanation tight, then slow down for the reveal", "Use a direct, casual CTA — no polish needed"
- timing_arc: estimate where hook/explanation/proof/cta land in seconds
- estimated_cuts: estimated number of visual cuts/transitions in the video

Return ONLY valid JSON:
{
  "delivery_style": "...",
  "pacing_style": "...",
  "hook_energy": "...",
  "visual_style": "...",
  "visual_rhythm": "...",
  "cta_tone": "...",
  "reveal_timing": "...",
  "recreate_guidance": ["...", "..."],
  "timing_arc": { "hook_ends_at": 3, "explanation_ends_at": 15, "proof_reveal_at": 20, "cta_starts_at": 25 },
  "estimated_cuts": 5
}`;

  contentBlocks.push({ type: 'text', text: promptText });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        temperature: 0.3,
        messages: [{ role: 'user', content: contentBlocks }],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      throw new Error(`API error ${response.status}`);
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text || '';

    // Parse JSON
    let jsonStr = text.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();
    else {
      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) jsonStr = objMatch[0];
    }

    const ai: AIVibeResult = JSON.parse(jsonStr);

    return buildVibeResult(ai, signals, duration);
  } catch (err) {
    console.warn('[vibe-analysis] AI interpretation failed, using heuristic fallback:', err);
    return buildHeuristicFallback(signals, duration, heuristicDelivery, heuristicPacing, heuristicHookEnergy);
  }
}

// ── Result builders ──────────────────────────────────────

function buildVibeResult(
  ai: AIVibeResult,
  signals: PacingSignals,
  duration: number,
): VibeAnalysis {
  return {
    delivery_style: validateEnum(ai.delivery_style, [
      'high_energy_punchy', 'calm_direct', 'skeptical_conversational', 'deadpan_sharp',
      'chaotic_fast', 'nurturing_soft', 'urgent_direct', 'playful_casual', 'authoritative_measured',
    ], 'calm_direct') as DeliveryStyle,
    pacing_style: validateEnum(ai.pacing_style, [
      'fast_hook_medium_body', 'slow_build_fast_payoff', 'steady_explainer',
      'rapid_fire', 'punchy_short_beats', 'conversational_flow',
    ], 'steady_explainer') as PacingStyle,
    hook_energy: validateEnum(ai.hook_energy, ['immediate', 'building', 'delayed'], 'building') as HookEnergy,
    visual_style: validateEnum(ai.visual_style, [
      'talking_head', 'demo_led', 'montage_led', 'mixed', 'screen_recording', 'text_overlay_driven',
    ], 'talking_head') as VisualStyle,
    visual_rhythm: validateEnum(ai.visual_rhythm, ['fast_cut', 'medium_cut', 'slow_cut', 'static'], 'medium_cut') as VisualRhythm,
    cta_tone: validateEnum(ai.cta_tone, [
      'casual_direct', 'soft_suggestive', 'aggressive_push', 'community_prompt', 'curiosity_close', 'no_cta',
    ], 'casual_direct') as CtaTone,
    reveal_timing: validateEnum(ai.reveal_timing, ['immediate', 'mid_video', 'delayed_payoff'], 'mid_video') as RevealTiming,
    recreate_guidance: Array.isArray(ai.recreate_guidance) ? ai.recreate_guidance.slice(0, 6).map(String) : [],
    timing_arc: {
      hook_ends_at: clamp(ai.timing_arc?.hook_ends_at ?? 3, 0, duration),
      explanation_ends_at: clamp(ai.timing_arc?.explanation_ends_at ?? duration * 0.5, 0, duration),
      proof_reveal_at: clamp(ai.timing_arc?.proof_reveal_at ?? duration * 0.65, 0, duration),
      cta_starts_at: clamp(ai.timing_arc?.cta_starts_at ?? duration * 0.85, 0, duration),
    },
    _signals: {
      words_per_minute: signals.words_per_minute,
      avg_pause_length: signals.avg_pause_length,
      pause_frequency: signals.pause_frequency,
      hook_word_count: signals.hook_word_count,
      total_word_count: signals.total_word_count,
      segment_count: signals.segment_count,
      estimated_cuts: ai.estimated_cuts || 0,
      first_3s_word_count: signals.first_3s_word_count,
      duration_seconds: signals.duration_seconds,
    },
    confidence: 0.8, // AI interpretation confidence
    version: '1.0.0',
  };
}

function buildHeuristicFallback(
  signals: PacingSignals,
  duration: number,
  delivery: DeliveryStyle,
  pacing: PacingStyle,
  hookEnergy: HookEnergy,
): VibeAnalysis {
  return {
    delivery_style: delivery,
    pacing_style: pacing,
    hook_energy: hookEnergy,
    visual_style: 'talking_head',
    visual_rhythm: 'medium_cut',
    cta_tone: 'casual_direct',
    reveal_timing: 'mid_video',
    recreate_guidance: [
      'Match the overall energy level of this video',
      'Pay attention to the pacing in the first 3 seconds',
      'Notice how the CTA lands — keep yours natural too',
    ],
    timing_arc: {
      hook_ends_at: Math.min(3, duration),
      explanation_ends_at: Math.round(duration * 0.5),
      proof_reveal_at: Math.round(duration * 0.65),
      cta_starts_at: Math.round(duration * 0.85),
    },
    _signals: {
      words_per_minute: signals.words_per_minute,
      avg_pause_length: signals.avg_pause_length,
      pause_frequency: signals.pause_frequency,
      hook_word_count: signals.hook_word_count,
      total_word_count: signals.total_word_count,
      segment_count: signals.segment_count,
      estimated_cuts: 0,
      first_3s_word_count: signals.first_3s_word_count,
      duration_seconds: signals.duration_seconds,
    },
    confidence: 0.4, // Heuristic-only confidence
    version: '1.0.0',
  };
}

function validateEnum<T extends string>(value: unknown, valid: T[], fallback: T): T {
  if (typeof value === 'string' && valid.includes(value as T)) return value as T;
  return fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n * 10) / 10));
}
