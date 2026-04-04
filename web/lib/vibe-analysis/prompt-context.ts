/**
 * Video Vibe Analysis — Prompt Context Builder
 *
 * Converts vibe analysis into prompt injection text
 * for hook and script generation.
 *
 * IMPORTANT: This tells the model to recreate the FEEL,
 * not copy the words.
 */

import type { VibeAnalysis, VibePromptContext } from './types';
import {
  DELIVERY_STYLE_LABELS,
  PACING_STYLE_LABELS,
  HOOK_ENERGY_LABELS,
  VISUAL_RHYTHM_LABELS,
  CTA_TONE_LABELS,
  REVEAL_TIMING_LABELS,
} from './types';

/**
 * Build a prompt context block from vibe analysis.
 * Used by hook generator and script generator to recreate
 * the energy of a reference video.
 */
export function buildVibePromptContext(vibe: VibeAnalysis): string {
  const lines = [
    '=== REFERENCE VIDEO VIBE (recreate this energy, NOT the words) ===',
    `Delivery: ${DELIVERY_STYLE_LABELS[vibe.delivery_style]}`,
    `Pacing: ${PACING_STYLE_LABELS[vibe.pacing_style]}`,
    `Hook Energy: ${HOOK_ENERGY_LABELS[vibe.hook_energy]}`,
    `Visual Rhythm: ${VISUAL_RHYTHM_LABELS[vibe.visual_rhythm]}`,
    `CTA Tone: ${CTA_TONE_LABELS[vibe.cta_tone]}`,
    `Reveal: ${REVEAL_TIMING_LABELS[vibe.reveal_timing]}`,
    '',
    'How to recreate this vibe:',
  ];

  for (const tip of vibe.recreate_guidance) {
    lines.push(`  - ${tip}`);
  }

  lines.push('');
  lines.push('CRITICAL: Match the rhythm, energy, and structural feel — do NOT copy specific phrases or wording from the original.');
  lines.push('===');

  return lines.join('\n');
}

/**
 * Extract minimal vibe context for lightweight prompt injection.
 */
export function extractVibePromptContext(vibe: VibeAnalysis): VibePromptContext {
  return {
    delivery_style: DELIVERY_STYLE_LABELS[vibe.delivery_style],
    pacing_style: PACING_STYLE_LABELS[vibe.pacing_style],
    hook_energy: HOOK_ENERGY_LABELS[vibe.hook_energy],
    visual_rhythm: VISUAL_RHYTHM_LABELS[vibe.visual_rhythm],
    cta_tone: CTA_TONE_LABELS[vibe.cta_tone],
    recreate_guidance: vibe.recreate_guidance,
  };
}
