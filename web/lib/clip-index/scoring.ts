/**
 * Overlay Clip Index — Scoring Engine
 *
 * Computes relevance-first scores for clip candidates:
 *   - ingredient_density: frequency + early mention weighting
 *   - format_score: suspense/structure cues (hook/tension/reveal)
 *   - obscurity_boost: prefer smaller channels / lower views
 *   - confidence: composite score
 *
 * Also extracts best_moments and risk_flags from transcript text.
 */

import {
  getClipRules,
  type ClipRules,
  type Ingredient,
  type ProductTypeMapping,
} from './rules-parser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoringInput {
  transcript_text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  view_count: number | null;
  channel: string | null;
}

export interface BestMoment {
  label: 'hook' | 'reveal' | 'claim';
  start_s: number;
  end_s: number;
  quote: string;
}

export interface ScoringResult {
  ingredients: string[];
  primary_ingredient: string | null;
  product_types: string[];
  ingredient_density: number;
  format_score: number;
  obscurity_boost: number;
  confidence: number;
  best_moments: BestMoment[];
  risk_flags: string[];
  risk_level: 'low' | 'med' | 'high';
}

// ---------------------------------------------------------------------------
// Ingredient extraction
// ---------------------------------------------------------------------------

interface IngredientMatch {
  name: string;
  count: number;
  first_position: number; // 0-1 position in transcript (early=low)
}

function extractIngredients(
  text: string,
  ingredientList: Ingredient[],
): IngredientMatch[] {
  const lower = text.toLowerCase();
  const matches: IngredientMatch[] = [];

  for (const ing of ingredientList) {
    const allTerms = [ing.name.toLowerCase(), ...ing.synonyms];
    let totalCount = 0;
    let firstPos = Infinity;

    for (const term of allTerms) {
      // Word boundary match
      const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi');
      let match;
      while ((match = regex.exec(lower)) !== null) {
        totalCount++;
        const pos = match.index / lower.length;
        if (pos < firstPos) firstPos = pos;
      }
    }

    if (totalCount > 0) {
      matches.push({
        name: ing.name,
        count: totalCount,
        first_position: firstPos === Infinity ? 1 : firstPos,
      });
    }
  }

  // Sort by count desc, then by earliest mention
  matches.sort((a, b) => b.count - a.count || a.first_position - b.first_position);
  return matches;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Ingredient density score
// ---------------------------------------------------------------------------

function computeIngredientDensity(matches: IngredientMatch[]): number {
  if (matches.length === 0) return 0;

  // Weight: more mentions + early mentions = higher density
  let score = 0;
  for (const m of matches) {
    const countWeight = Math.min(m.count, 10) / 10; // cap at 10 mentions
    const earlyWeight = 1 - m.first_position; // 0-1 scale, early=higher
    score += (countWeight * 0.6) + (earlyWeight * 0.4);
  }

  // Normalize to 0-1 (cap contribution per ingredient)
  return Math.min(score / 3, 1);
}

// ---------------------------------------------------------------------------
// Format score (structure/suspense cues)
// ---------------------------------------------------------------------------

const HOOK_PATTERNS = [
  /\b(?:you won't believe|here's (?:the|what)|this is why|stop (?:taking|using|doing)|the truth about|nobody talks about|what they don't tell you|i (?:tried|tested)|my experience with)\b/i,
  /\b(?:game changer|changed my life|blown away|shocked|surprised)\b/i,
];

const TENSION_PATTERNS = [
  /\b(?:but here's the (?:thing|problem)|the (?:problem|issue|catch) is|however|on the other hand|what most people (?:don't|miss))\b/i,
  /\b(?:side effects?|danger|risk|warning|careful|watch out)\b/i,
];

const REVEAL_PATTERNS = [
  /\b(?:the (?:real |actual )?(?:reason|answer|solution|result)|so (?:here's|what)|turns out|actually works|the (?:science|research|data|evidence|studies?) (?:shows?|says?|suggests?))\b/i,
  /\b(?:my results|after \d+ (?:days?|weeks?|months?))\b/i,
];

function computeFormatScore(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;

  // Hook presence (first 20% of transcript)
  const hookZone = lower.slice(0, Math.floor(lower.length * 0.2));
  const hasHook = HOOK_PATTERNS.some(p => p.test(hookZone));
  if (hasHook) score += 0.35;

  // Tension cues anywhere
  const hasTension = TENSION_PATTERNS.some(p => p.test(lower));
  if (hasTension) score += 0.30;

  // Reveal cues (latter 50%)
  const revealZone = lower.slice(Math.floor(lower.length * 0.5));
  const hasReveal = REVEAL_PATTERNS.some(p => p.test(revealZone));
  if (hasReveal) score += 0.35;

  return Math.min(score, 1);
}

// ---------------------------------------------------------------------------
// Obscurity boost
// ---------------------------------------------------------------------------

function computeObscurityBoost(viewCount: number | null): number {
  if (viewCount === null) return 0.5; // missing stats = neutral

  // Prefer mid/low view counts
  // 0-1000 views: boost 0.8
  // 1000-10K: boost 0.6
  // 10K-100K: boost 0.4
  // 100K-1M: boost 0.2
  // >1M: boost 0.0
  if (viewCount < 1000) return 0.8;
  if (viewCount < 10_000) return 0.6;
  if (viewCount < 100_000) return 0.4;
  if (viewCount < 1_000_000) return 0.2;
  return 0;
}

// ---------------------------------------------------------------------------
// Best moments extraction
// ---------------------------------------------------------------------------

function extractBestMoments(
  segments: Array<{ start: number; end: number; text: string }>,
): BestMoment[] {
  if (segments.length === 0) return [];

  const moments: BestMoment[] = [];
  const fullText = segments.map(s => s.text).join(' ');
  const totalLen = fullText.length;

  for (const seg of segments) {
    const lower = seg.text.toLowerCase();
    const position = fullText.indexOf(seg.text) / totalLen;

    // Hook detection (first 25% of content)
    if (position < 0.25 && moments.filter(m => m.label === 'hook').length < 1) {
      if (HOOK_PATTERNS.some(p => p.test(lower))) {
        moments.push({
          label: 'hook',
          start_s: Math.floor(seg.start),
          end_s: Math.ceil(seg.end),
          quote: seg.text.slice(0, 150),
        });
      }
    }

    // Reveal detection (latter 50%)
    if (position > 0.5 && moments.filter(m => m.label === 'reveal').length < 1) {
      if (REVEAL_PATTERNS.some(p => p.test(lower))) {
        moments.push({
          label: 'reveal',
          start_s: Math.floor(seg.start),
          end_s: Math.ceil(seg.end),
          quote: seg.text.slice(0, 150),
        });
      }
    }

    // Claim detection (any position)
    if (moments.filter(m => m.label === 'claim').length < 2) {
      if (/\b(?:cure|treat|reverse|heal|guaranteed|proven to)\b/i.test(lower)) {
        moments.push({
          label: 'claim',
          start_s: Math.floor(seg.start),
          end_s: Math.ceil(seg.end),
          quote: seg.text.slice(0, 150),
        });
      }
    }

    if (moments.length >= 4) break;
  }

  return moments.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Risk flags
// ---------------------------------------------------------------------------

const RISK_FLAG_PATTERNS: Array<{ flag: string; patterns: RegExp[] }> = [
  {
    flag: 'medical_claim_language',
    patterns: [
      /\b(?:cure[sd]?|treat[sd]?|reverse[sd]?|heal[sd]?)\s+(?:\w+\s+){0,3}(?:disease|cancer|diabetes|alzheimer|parkinson|arthritis)/i,
      /\b(?:prevent[sd]?|eliminate[sd]?)\s+(?:\w+\s+){0,3}(?:disease|illness|condition)/i,
    ],
  },
  {
    flag: 'guarantee_language',
    patterns: [
      /\b(?:guaranteed|100%|money.?back|no.?risk|proven to)\b/i,
    ],
  },
  {
    flag: 'authority_implication',
    patterns: [
      /\b(?:doctor[s']?\s+(?:say|recommend|prescribe)|(?:my|the)\s+doctor|physician.?recommended|clinically\s+proven)\b/i,
    ],
  },
  {
    flag: 'before_after_promise',
    patterns: [
      /\b(?:before\s+and\s+after|transformation|look\s+(?:\d+\s+)?years?\s+younger)\b/i,
    ],
  },
];

const HARD_REJECT_PATTERNS = [
  /\b(?:buy\s+(?:illegal|black\s+market)|drug\s+dealer|controlled\s+substance)\b/i,
  /\b(?:hate|kill\s+(?:all|them)|white\s+(?:power|supremac))/i,
];

function extractRiskFlags(text: string): { flags: string[]; level: 'low' | 'med' | 'high'; hardReject: boolean } {
  const flags: string[] = [];
  let hardReject = false;

  // Check hard reject first
  for (const pattern of HARD_REJECT_PATTERNS) {
    if (pattern.test(text)) {
      hardReject = true;
      break;
    }
  }

  // Flag patterns (do not reject, just flag)
  for (const { flag, patterns } of RISK_FLAG_PATTERNS) {
    for (const p of patterns) {
      if (p.test(text)) {
        if (!flags.includes(flag)) flags.push(flag);
        break;
      }
    }
  }

  const level: 'low' | 'med' | 'high' =
    flags.length >= 3 ? 'high' :
    flags.length >= 1 ? 'med' : 'low';

  return { flags, level, hardReject };
}

// ---------------------------------------------------------------------------
// Product type mapping
// ---------------------------------------------------------------------------

function mapProductTypes(
  ingredientNames: string[],
  productTypes: ProductTypeMapping[],
): string[] {
  const types = new Set<string>();
  const lowerNames = ingredientNames.map(n => n.toLowerCase());

  for (const pt of productTypes) {
    for (const keyword of pt.keywords) {
      if (lowerNames.some(n => n.includes(keyword) || keyword.includes(n))) {
        types.add(pt.type);
      }
    }
  }

  return Array.from(types);
}

// ---------------------------------------------------------------------------
// Main scoring function
// ---------------------------------------------------------------------------

export async function scoreCandidate(input: ScoringInput): Promise<ScoringResult> {
  const rules = await getClipRules();

  // Extract ingredients
  const ingredientMatches = extractIngredients(input.transcript_text, rules.ingredients);
  const ingredientNames = ingredientMatches.map(m => m.name);
  const primaryIngredient = ingredientNames[0] || null;

  // Compute scores
  const ingredientDensity = computeIngredientDensity(ingredientMatches);
  const formatScore = computeFormatScore(input.transcript_text);
  const obscurityBoost = computeObscurityBoost(input.view_count);

  // Confidence is a weighted composite
  const confidence =
    (ingredientDensity * 0.40) +
    (formatScore * 0.30) +
    (obscurityBoost * 0.15) +
    (ingredientNames.length > 0 ? 0.15 : 0); // base ingredient presence

  // Best moments from segments
  const bestMoments = extractBestMoments(input.segments);

  // Risk analysis
  const { flags, level } = extractRiskFlags(input.transcript_text);

  // Product types
  const productTypes = mapProductTypes(ingredientNames, rules.product_types);

  return {
    ingredients: ingredientNames,
    primary_ingredient: primaryIngredient,
    product_types: productTypes,
    ingredient_density: round(ingredientDensity),
    format_score: round(formatScore),
    obscurity_boost: round(obscurityBoost),
    confidence: round(confidence),
    best_moments: bestMoments,
    risk_flags: flags,
    risk_level: level,
  };
}

/**
 * Check if a transcript triggers a hard reject (illegal/hate content).
 */
export function isHardReject(text: string): boolean {
  return extractRiskFlags(text).hardReject;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
