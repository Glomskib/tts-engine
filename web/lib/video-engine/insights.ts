/**
 * Deterministic insight derivation for selected clip candidates.
 *
 * Takes a scored candidate (score + per-feature breakdown + clip type +
 * duration) and produces user-facing tags:
 *   - hookStrength:    low | med | high   (confidence badge)
 *   - suggestedUse:    one-line "what is this clip for?"
 *   - selectionReason: one-line "why we picked this"
 *   - bestFor:         platform list driven by duration
 *
 * Pure function — no DB, no LLM. Run inside the analyze stage right after
 * scoring so the values land in ve_clip_candidates with the rest of the row.
 */

import type { Mode } from './types';

export type HookStrength = 'low' | 'med' | 'high';

export interface CandidateInsightInput {
  score: number;
  scoreBreakdown: Record<string, number>;
  clipType: string;
  durationSec: number;
  hookText: string | null;
  mode: Mode;
}

export interface CandidateInsight {
  hookStrength: HookStrength;
  suggestedUse: string;
  selectionReason: string;
  bestFor: string[];
}

/**
 * Score buckets calibrated empirically against the affiliate + nonprofit weight
 * sums (max contribution per chunk lands around ~5–6 with full weights).
 */
function bucketHookStrength(score: number): HookStrength {
  if (score >= 2.0) return 'high';
  if (score >= 1.0) return 'med';
  return 'low';
}

/**
 * Top contributing features by absolute weight, descending. Filters out
 * features that contributed essentially nothing (< 0.05).
 */
function topFeatures(breakdown: Record<string, number>, n = 2): Array<[string, number]> {
  return Object.entries(breakdown)
    .filter(([, v]) => v >= 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

const FEATURE_LABELS: Record<string, string> = {
  hookStrength: 'a strong opener',
  productMention: 'clear product talk',
  emotionalIntensity: 'high emotional intensity',
  benefitStatement: 'a benefit-driven angle',
  ctaLikelihood: 'an explicit call-to-action',
  retentionPotential: 'specific, retention-friendly language',
  testimonialPhrase: 'testimonial-style phrasing',
  groupLanguage: 'community/group language',
  scenicLanguage: 'scenic visual cues in the dialogue',
  celebrationLanguage: 'celebration moments',
  durationFit: 'a tight duration',
  specificity: 'numbers and proper nouns',
};

function suggestedUseFor(clipType: string, durationSec: number, mode: Mode): string {
  const isShort = durationSec <= 15;
  if (mode === 'affiliate') {
    switch (clipType) {
      case 'hook':        return isShort ? 'Top-of-feed hook — open with this' : 'Hook-driven explainer';
      case 'product':     return 'Product spotlight';
      case 'benefit':     return 'Benefit pitch — answers "why care"';
      case 'cta':         return 'Closing CTA — drives the click';
      case 'testimonial': return 'Social proof — paste in stitch/duets';
      default:            return 'Standalone short';
    }
  }
  if (mode === 'clipper') {
    switch (clipType) {
      case 'hook':        return isShort ? 'Scroll-stopping opener' : 'Strong opener — lead with this';
      case 'story':       return 'Emotional beat — great for stitches';
      case 'takeaway':    return 'Key takeaway — quotable moment';
      case 'insight':     return 'Specific point — lands on Shorts/Reels';
      case 'moment':      return 'Reaction / celebration moment';
      case 'testimonial': return 'Quote clip — paste into duets/stitches';
      default:            return 'Standalone cut';
    }
  }
  // nonprofit
  switch (clipType) {
    case 'testimonial':  return 'Voice-of-impact — testimonial';
    case 'celebration':  return 'Celebration / hype recap';
    case 'mission':      return 'Why-we-do-this — mission moment';
    case 'group':        return 'Community feel — group/team spotlight';
    case 'scenic':       return 'B-roll style — atmosphere over message';
    case 'hook':         return 'Top-of-feed hook';
    default:             return 'Standalone short';
  }
}

function selectionReasonFor(input: CandidateInsightInput): string {
  const top = topFeatures(input.scoreBreakdown, 2);
  if (top.length === 0) {
    return 'Picked for overall pacing and length fit.';
  }
  const phrases = top.map(([k]) => FEATURE_LABELS[k] ?? k);
  if (phrases.length === 1) {
    return `Picked for ${phrases[0]}.`;
  }
  return `Picked for ${phrases[0]} and ${phrases[1]}.`;
}

/**
 * Goal-oriented "best for" tags, derived from clip type + mode + duration.
 *
 * Vocabulary is intentionally tiny — engagement, conversion, awareness — so
 * the user can immediately decide where each clip belongs in their funnel.
 */
function bestForFor(clipType: string, mode: Mode, durationSec: number): string[] {
  const tags = new Set<string>();

  if (mode === 'clipper') {
    // Clippers live in reach/engagement land — no 'conversion' tag.
    switch (clipType) {
      case 'hook':        tags.add('engagement'); tags.add('reach'); break;
      case 'story':       tags.add('engagement'); break;
      case 'takeaway':    tags.add('engagement'); tags.add('reach'); break;
      case 'insight':     tags.add('engagement'); break;
      case 'moment':      tags.add('reach'); break;
      case 'testimonial': tags.add('engagement'); break;
      default:            tags.add('reach');
    }
  } else if (mode === 'affiliate') {
    switch (clipType) {
      case 'cta':         tags.add('conversion'); break;
      case 'product':     tags.add('conversion'); tags.add('awareness'); break;
      case 'benefit':     tags.add('conversion'); break;
      case 'testimonial': tags.add('awareness'); tags.add('conversion'); break;
      case 'hook':        tags.add('engagement'); break;
      default:            tags.add('engagement');
    }
  } else {
    switch (clipType) {
      case 'celebration': tags.add('engagement'); break;
      case 'mission':     tags.add('awareness'); break;
      case 'group':       tags.add('engagement'); tags.add('awareness'); break;
      case 'scenic':      tags.add('awareness'); break;
      case 'testimonial': tags.add('awareness'); break;
      case 'cta':         tags.add('conversion'); break;
      case 'hook':        tags.add('engagement'); break;
      default:            tags.add('awareness');
    }
  }

  // Short clips earn an extra engagement tag — top-of-feed surfaces reward
  // the first 3 seconds, and a sub-15s cut is built for the scroll.
  if (durationSec <= 15) tags.add('engagement');

  return Array.from(tags);
}

export function deriveInsights(input: CandidateInsightInput): CandidateInsight {
  return {
    hookStrength: bucketHookStrength(input.score),
    suggestedUse: suggestedUseFor(input.clipType, input.durationSec, input.mode),
    selectionReason: selectionReasonFor(input),
    bestFor: bestForFor(input.clipType, input.mode, input.durationSec),
  };
}

/**
 * Clipper-mode distinct labels. Given a set of candidates for a single run,
 * assign each the single most-distinctive user-facing tag so the top-3 grid
 * never shows three identical chips.
 *
 * Greedy, order-sensitive assignment:
 *   1. "Best hook"       → highest hookStrength contribution
 *   2. "Most engaging"   → highest (emotionalIntensity + retentionPotential)
 *   3. "Fast highlight"  → shortest remaining duration
 *
 * Pure — safe to call client-side from the candidate payload.
 */
export type ClipperLabel = 'best_hook' | 'most_engaging' | 'fast_highlight';

export interface ClipperLabelInput {
  id: string;
  scoreBreakdown: Record<string, number>;
  durationSec: number;
}

export function assignClipperLabels(
  candidates: ClipperLabelInput[],
): Map<string, ClipperLabel> {
  const labels = new Map<string, ClipperLabel>();
  if (candidates.length === 0) return labels;

  const pool = [...candidates];
  const takeBy = (score: (c: ClipperLabelInput) => number, label: ClipperLabel) => {
    if (pool.length === 0) return;
    let best = pool[0];
    let bestScore = score(best);
    for (const c of pool) {
      const s = score(c);
      if (s > bestScore) { best = c; bestScore = s; }
    }
    labels.set(best.id, label);
    const idx = pool.indexOf(best);
    if (idx >= 0) pool.splice(idx, 1);
  };

  takeBy((c) => c.scoreBreakdown.hookStrength ?? 0, 'best_hook');
  takeBy(
    (c) => (c.scoreBreakdown.emotionalIntensity ?? 0) + (c.scoreBreakdown.retentionPotential ?? 0),
    'most_engaging',
  );
  takeBy((c) => -c.durationSec, 'fast_highlight');

  return labels;
}

export function clipperLabelText(label: ClipperLabel | null | undefined): string | null {
  if (label === 'best_hook')      return 'Best hook';
  if (label === 'most_engaging')  return 'Most engaging';
  if (label === 'fast_highlight') return 'Fast highlight';
  return null;
}
