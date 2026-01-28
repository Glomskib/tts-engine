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
}

export interface WinnerSignal {
  hook?: string;
  transcript?: string;
  url?: string;
}

export interface HookScoringContext {
  provenHooks?: ProvenHookSignal[];
  winners?: WinnerSignal[];
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
      score += 40;
      reasons.push("proven_hook_match: +40");

      const approvedBonus = Math.min(match.approved_count * 5, 30);
      if (approvedBonus > 0) {
        score += approvedBonus;
        reasons.push(`approved_count(${match.approved_count}): +${approvedBonus}`);
      }

      const rejectedPenalty = Math.min((match.rejected_count || 0) * 8, 40);
      if (rejectedPenalty > 0) {
        score -= rejectedPenalty;
        reasons.push(`rejected_count(${match.rejected_count}): -${rejectedPenalty}`);
      }

      const underperformPenalty = Math.min((match.underperform_count || 0) * 6, 30);
      if (underperformPenalty > 0) {
        score -= underperformPenalty;
        reasons.push(`underperform_count(${match.underperform_count}): -${underperformPenalty}`);
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
