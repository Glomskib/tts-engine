/**
 * Deterministic hook scoring function.
 * Scores hook options using proven-hook signals, winners bank matches,
 * and lightweight heuristics. Never blocks generation — gracefully
 * degrades to heuristic-only scoring when data is missing.
 *
 * Pure function: no side effects, no randomness, no network calls.
 */

// --- Types ---

export interface ProvenHookSignal {
  text: string;
  approved_count: number;
  rejected_count?: number;
  underperform_count?: number;
  winner_count?: number;
  posted_count?: number;
  used_count?: number;
  hook_family?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WinnerSignal {
  hook?: string;
  transcript?: string;
  url?: string;
}

export interface HookScoringContext {
  provenHooks?: ProvenHookSignal[];
  winners?: WinnerSignal[];
  nowMs?: number; // Server timestamp for temporal decay (Date.now())
}

export interface HookScoreResult {
  option: string;
  score: number;
  reasons: string[];
}

// --- Constants ---

const CURIOSITY_PHRASES = [
  "why", "stop", "no one tells you", "most people",
  "the reason", "before you",
];

const AUDIENCE_ANCHORS = [
  "if you", "for anyone who", "when you",
  "for men", "for women",
];

// Lightweight policy-risk words (soft penalty, never censors)
const POLICY_RISK_WORDS = [
  "cure", "treat", "diagnose", "guaranteed", "miracle",
  "medical", "prescription", "disease",
];

// --- Helpers ---

/** Normalize for matching: lowercase, trim, collapse spaces, strip punctuation */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

/** Check if a contains b as a substring (both normalized) */
function containsNormalized(haystack: string, needle: string): boolean {
  return normalizeForMatch(haystack).includes(normalizeForMatch(needle));
}

/** Clamp a value between min and max */
function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

/** Calculate days since an ISO date string. Returns conservative default if invalid. */
function daysSince(isoDate: string | null | undefined, nowMs: number): number {
  if (!isoDate) return 365; // Conservative default
  try {
    const dateMs = new Date(isoDate).getTime();
    if (isNaN(dateMs)) return 365;
    const diffMs = nowMs - dateMs;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return clamp(days, 0, 3650); // Clamp to 0-10 years
  } catch {
    return 365;
  }
}

/** Calculate temporal decay multiplier (0.75 to 1.0) based on age in days */
function getTemporalDecay(ageDays: number): number {
  // At 0 days: 1.0, at 365 days: 0.75, never below 0.75
  return clamp(1 - (ageDays / 365) * 0.25, 0.75, 1.0);
}

/** Calculate freshness boost points based on age in days */
function getFreshnessBoost(ageDays: number): number {
  if (ageDays <= 14) return 6;
  if (ageDays <= 30) return 4;
  if (ageDays <= 60) return 2;
  return 0;
}

// --- Main scoring function ---

export function scoreHookOption(
  option: string,
  context: HookScoringContext,
): HookScoreResult {
  const reasons: string[] = [];
  let score = 50; // Base score — all hooks start equal
  const normalized = normalizeForMatch(option);
  const lower = option.toLowerCase();

  // 1) Proven Hook Match (exact normalized match)
  if (context.provenHooks && context.provenHooks.length > 0) {
    const match = context.provenHooks.find(
      (h) => normalizeForMatch(h.text) === normalized,
    );
    if (match) {
      // Base match bonus (not decayed)
      score += 40;
      reasons.push("proven_match(+40)");

      // Extract performance stats with safe defaults
      const W = match.winner_count || 0;
      const P = match.posted_count || 0;
      const U = match.used_count || 0;
      const D = match.underperform_count || 0;
      const A = match.approved_count || 0;
      const R = match.rejected_count || 0;

      // Calculate temporal factors
      const nowMs = context.nowMs || Date.now();
      const ageDays = daysSince(match.updated_at || match.created_at, nowMs);
      const decay = getTemporalDecay(ageDays);
      const freshBoost = getFreshnessBoost(ageDays);

      // Add decay factor to reasons (always show for transparency)
      reasons.push(`decay(x${decay.toFixed(2)}): ageDays=${ageDays}`);

      // Add freshness boost if applicable
      if (freshBoost > 0) {
        score += freshBoost;
        reasons.push(`freshness(+${freshBoost}): ageDays=${ageDays}`);
      }

      // Performance-aware components WITH decay (only when we have posting data)

      // 1) Winner rate: reward hooks that produce winners (with decay)
      if (P > 0) {
        const winnerRate = W / Math.max(P, 1);
        const rawWinnerBonus = Math.round(Math.min(winnerRate * 40, 20));
        const decayedWinnerBonus = Math.round(rawWinnerBonus * decay);
        if (decayedWinnerBonus > 0) {
          score += decayedWinnerBonus;
          reasons.push(`winner_rate(+${decayedWinnerBonus}): ${W}/${P} (raw=${rawWinnerBonus})`);
        }
      }

      // 2) Underperform rate: penalize hooks that underperform (with decay)
      if (P > 0) {
        const underRate = D / Math.max(P, 1);
        const rawUnderPenalty = Math.round(Math.min(underRate * 40, 20));
        const decayedUnderPenalty = Math.round(rawUnderPenalty * decay);
        if (decayedUnderPenalty > 0) {
          score -= decayedUnderPenalty;
          reasons.push(`underperform_rate(-${decayedUnderPenalty}): ${D}/${P} (raw=${rawUnderPenalty})`);
        }
      }

      // 3) Confidence boost: more posting data = more trust (with decay)
      if (P > 0) {
        const rawConf = Math.round(Math.min(Math.log10(P + 1) * 6, 10));
        const decayedConf = Math.round(rawConf * decay);
        if (decayedConf > 0) {
          score += decayedConf;
          reasons.push(`confidence(+${decayedConf}): posted=${P} (raw=${rawConf})`);
        }
      }

      // 4) Count-based adjustments (NOT decayed - these are approval/rejection signals)
      const approvedBonus = Math.min(A * 3, 18);
      if (approvedBonus > 0) {
        score += approvedBonus;
        reasons.push(`approved_count(+${approvedBonus}): ${A}`);
      }

      const rejectedPenalty = Math.min(R * 6, 30);
      if (rejectedPenalty > 0) {
        score -= rejectedPenalty;
        reasons.push(`rejected_count(-${rejectedPenalty}): ${R}`);
      }

      // Raw underperform penalty (separate from rate, smaller weight, NOT decayed)
      const underperformPenalty = Math.min(D * 3, 18);
      if (underperformPenalty > 0) {
        score -= underperformPenalty;
        reasons.push(`underperform_count(-${underperformPenalty}): ${D}`);
      }
    }
  }

  // 2) Winners Bank Signal (best-effort substring match)
  if (context.winners && context.winners.length > 0) {
    const matchesWinner = context.winners.some((w) => {
      if (w.hook && containsNormalized(w.hook, option)) return true;
      if (w.transcript && containsNormalized(w.transcript, option)) return true;
      return false;
    });
    if (matchesWinner) {
      score += 15;
      reasons.push("winners_bank_match: +15");
    }
  }

  // 3) Heuristic Quality Boosts

  // Curiosity gap phrases
  const hasCuriosity = CURIOSITY_PHRASES.some((p) => lower.includes(p));
  if (hasCuriosity) {
    score += 8;
    reasons.push("curiosity_phrase: +8");
  }

  // Audience anchor
  const hasAnchor = AUDIENCE_ANCHORS.some((p) => lower.includes(p));
  if (hasAnchor) {
    score += 6;
    reasons.push("audience_anchor: +6");
  }

  // Concrete signals (numbers, time references)
  if (/\d+/.test(option)) {
    score += 6;
    reasons.push("concrete_signal: +6");
  }

  // Length bonuses/penalties
  if (option.length <= 80) {
    score += 5;
    reasons.push("concise(<=80): +5");
  }
  if (option.length > 140) {
    score -= 8;
    reasons.push("verbose(>140): -8");
  }

  // 4) Light Policy-Risk Penalty (soft, never censors)
  const hasRisk = POLICY_RISK_WORDS.some((w) => lower.includes(w));
  if (hasRisk) {
    score -= 5;
    reasons.push("policy_risk: -5");
  }

  return { option, score, reasons };
}

// --- Array scoring with near-duplicate penalty ---

/**
 * Score and sort an array of hook options.
 * Applies per-option scoring then a near-duplicate penalty
 * for subsequent options that are too similar to earlier ones.
 * Returns scored results sorted by score DESC.
 */
export function scoreAndSortHookOptions(
  options: string[],
  context: HookScoringContext,
): HookScoreResult[] {
  // Score each option independently
  const scored = options.map((opt) => scoreHookOption(opt, context));

  // 5) Near-duplicate penalty: penalize later options that are very similar
  const seen: string[] = [];
  for (const item of scored) {
    const norm = normalizeForMatch(item.option);
    const isDupe = seen.some((s) => {
      // Check if either is a substring of the other (after normalization)
      return s.includes(norm) || norm.includes(s);
    });
    if (isDupe) {
      item.score -= 10;
      item.reasons.push("near_duplicate: -10");
    }
    seen.push(norm);
  }

  // Sort by score descending, stable (preserve AI order for ties)
  return scored.sort((a, b) => b.score - a.score);
}
