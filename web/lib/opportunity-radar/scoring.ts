/**
 * Opportunity Radar — Scoring Engine
 *
 * Deterministic, explainable scoring for product opportunities.
 * Each component has a max contribution, summing to 100.
 *
 * Components:
 *   recency         (max 25) — how recently first_seen_at was
 *   not_yet_posted  (max 20) — creator hasn't posted about it yet
 *   creator_priority(max 20) — critical/high/medium/low creator
 *   confidence      (max 15) — confirmed/high/medium/low observation
 *   repeat_sightings(max 10) — times_seen count
 *   multi_creator   (max 10) — same product seen across multiple creators
 */

import type {
  ScoreBreakdown,
  ProductObservation,
  CreatorPriority,
  ObservationConfidence,
} from './types';

interface ScoringInput {
  first_seen_at: string;
  creator_has_posted: boolean;
  confidence: ObservationConfidence;
  times_seen: number;
}

/**
 * Compute the full opportunity score with breakdown and reasons.
 */
export function computeOpportunityScore(
  input: ScoringInput,
  creatorPriority: CreatorPriority,
  multiCreatorCount: number,
): ScoreBreakdown {
  const reasons: string[] = [];

  // ── Recency (max 25) ─────────────────────────────────────
  const daysSinceFirstSeen = Math.max(
    0,
    (Date.now() - new Date(input.first_seen_at).getTime()) / (1000 * 60 * 60 * 24),
  );
  let recency: number;
  if (daysSinceFirstSeen <= 7) {
    recency = 25;
    reasons.push(`First seen ${Math.round(daysSinceFirstSeen)}d ago (+25 recency)`);
  } else if (daysSinceFirstSeen <= 14) {
    recency = 18;
    reasons.push(`First seen ${Math.round(daysSinceFirstSeen)}d ago (+18 recency)`);
  } else if (daysSinceFirstSeen <= 30) {
    recency = 10;
    reasons.push(`First seen ${Math.round(daysSinceFirstSeen)}d ago (+10 recency)`);
  } else {
    recency = 3;
    reasons.push(`First seen ${Math.round(daysSinceFirstSeen)}d ago (+3 recency)`);
  }

  // ── Not Yet Posted (max 20) ──────────────────────────────
  let not_yet_posted: number;
  if (!input.creator_has_posted) {
    not_yet_posted = 20;
    reasons.push('Creator has not yet posted (+20)');
  } else {
    not_yet_posted = 0;
    reasons.push('Creator already posted (+0)');
  }

  // ── Creator Priority (max 20) ────────────────────────────
  const PRIORITY_SCORES: Record<CreatorPriority, number> = {
    critical: 20,
    high: 15,
    medium: 10,
    low: 5,
  };
  const creator_priority_score = PRIORITY_SCORES[creatorPriority] ?? 10;
  reasons.push(`${creatorPriority} priority creator (+${creator_priority_score})`);

  // ── Confidence (max 15) ──────────────────────────────────
  const CONFIDENCE_SCORES: Record<ObservationConfidence, number> = {
    confirmed: 15,
    high: 12,
    medium: 8,
    low: 3,
  };
  const confidence_score = CONFIDENCE_SCORES[input.confidence] ?? 8;
  reasons.push(`${input.confidence} confidence (+${confidence_score})`);

  // ── Repeat Sightings (max 10) ────────────────────────────
  let repeat_sightings: number;
  if (input.times_seen >= 5) {
    repeat_sightings = 10;
  } else if (input.times_seen >= 3) {
    repeat_sightings = 7;
  } else if (input.times_seen >= 2) {
    repeat_sightings = 5;
  } else {
    repeat_sightings = 2;
  }
  reasons.push(`Seen ${input.times_seen}x (+${repeat_sightings})`);

  // ── Multi-Creator Signal (max 10) ────────────────────────
  let multi_creator: number;
  if (multiCreatorCount >= 3) {
    multi_creator = 10;
    reasons.push(`${multiCreatorCount} creators spotted this product (+10)`);
  } else if (multiCreatorCount === 2) {
    multi_creator = 7;
    reasons.push('2 creators spotted this product (+7)');
  } else if (multiCreatorCount === 1) {
    multi_creator = 3;
    reasons.push('1 other creator spotted this product (+3)');
  } else {
    multi_creator = 0;
  }

  const total = recency + not_yet_posted + creator_priority_score + confidence_score + repeat_sightings + multi_creator;

  return {
    recency,
    not_yet_posted,
    creator_priority: creator_priority_score,
    confidence: confidence_score,
    repeat_sightings,
    multi_creator,
    total: Math.min(total, 100),
    reasons,
  };
}

/** Map a numeric score to a human-readable label */
export function scoreToLabel(score: number): 'hot' | 'warm' | 'cool' | 'cold' {
  if (score >= 75) return 'hot';
  if (score >= 50) return 'warm';
  if (score >= 25) return 'cool';
  return 'cold';
}
