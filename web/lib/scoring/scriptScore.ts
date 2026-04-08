/**
 * Deterministic (no-LLM) script quality score — 0 to 100.
 *
 * Used by FlashFlow Phase 3 to give users instant, free feedback on a
 * generated script. Shown as a single number in Content Studio with the
 * breakdown surfaced on hover.
 *
 * Breakdown:
 *   hook_strength     — 0..30  (hook presence, length, punch)
 *   emotional_trigger — 0..30  (presence of emotion/curiosity words, numbers, questions)
 *   format_match      — 0..40  (beats, CTA, b-roll, overlays all present and within norms)
 */

import type { Skit } from '@/lib/ai/skitPostProcess';

export interface ScriptScoreBreakdown {
  hook_strength: number;
  emotional_trigger: number;
  format_match: number;
  total: number;
}

const EMOTIONAL_WORDS = [
  'shocked', 'secret', 'finally', 'never', 'wait', 'actually', 'tried',
  'stop', 'truth', 'nobody', 'everyone', 'changed', 'obsessed', 'literally',
  'honestly', 'real', 'surprised', 'insane', 'wild', 'crazy', 'hooked',
];

export function scoreScript(skit: Skit): ScriptScoreBreakdown {
  const hook = (skit.hook_line || skit.verbal_hook || skit.visual_hook || '').trim();
  const hookLower = hook.toLowerCase();

  // ---- Hook strength (0..30) ----
  let hookStrength = 0;
  if (hook.length > 0) hookStrength += 6;
  if (hook.length >= 20 && hook.length <= 120) hookStrength += 8; // sweet spot
  if (/[?!]/.test(hook)) hookStrength += 4;                        // punctuation punch
  if (/\d/.test(hook)) hookStrength += 4;                          // numbers stop scrolls
  if (EMOTIONAL_WORDS.some((w) => hookLower.includes(w))) hookStrength += 8;
  hookStrength = Math.min(hookStrength, 30);

  // ---- Emotional trigger (0..30) ----
  const body = [
    ...skit.beats.map((b) => `${b.action} ${b.dialogue ?? ''} ${b.on_screen_text ?? ''}`),
    ...skit.overlays,
    skit.cta_line,
  ].join(' ').toLowerCase();

  let emotional = 0;
  const emoHits = EMOTIONAL_WORDS.filter((w) => body.includes(w)).length;
  emotional += Math.min(emoHits * 4, 16);
  if (/\?/.test(body)) emotional += 4;                    // at least one question
  if (/\d/.test(body)) emotional += 4;                    // at least one number/stat
  if (/you|your/.test(body)) emotional += 6;              // direct address
  emotional = Math.min(emotional, 30);

  // ---- Format match (0..40) ----
  let format = 0;
  if (skit.beats.length >= 3) format += 10;
  if (skit.beats.length >= 3 && skit.beats.length <= 8) format += 6;
  if (skit.cta_line && skit.cta_line.trim().length > 0) format += 8;
  if (skit.cta_overlay && skit.cta_overlay.trim().length > 0) format += 4;
  if (skit.b_roll && skit.b_roll.length >= 2) format += 6;
  if (skit.overlays && skit.overlays.length >= 1) format += 6;
  format = Math.min(format, 40);

  const total = hookStrength + emotional + format;
  return { hook_strength: hookStrength, emotional_trigger: emotional, format_match: format, total };
}
