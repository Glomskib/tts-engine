/**
 * Deterministic clip-candidate scoring.
 *
 * Stage 1 (extractFeatures) computes per-chunk feature scores in [0..1].
 * Stage 2 (scoreCandidates) projects features through mode-specific weights
 * to produce a final score, classifies clip type, and selects the top N
 * non-overlapping candidates.
 *
 * Mode does NOT change the algorithm — only the weights and the secondary
 * classifier. This is the core of the "single engine, multiple modes" promise.
 *
 * LLM enrichment of top candidates is intentionally deferred (V2). Deterministic
 * scoring is fast, free, predictable, and ships today.
 */

import type {
  CandidateOutput,
  ChunkFeatures,
  ChunkInput,
  Mode,
  TranscriptSegment,
} from './types';
import { getMode } from './modes';

// ---------------------------------------------------------------------------
// Vocabulary banks
// ---------------------------------------------------------------------------

const HOOK_OPENERS = [
  'wait','listen','okay','here\'s','heres','imagine','let me','i can\'t believe','i cant believe',
  'this is','watch this','stop','don\'t','dont','you won\'t','you wont','nobody','everyone',
  'why','how','what if','the truth','the secret','the reason','three','five','seven',
];

const PRODUCT_KEYWORDS = [
  'product','brand','link in bio','link below','tiktok shop','amazon','shopify','order',
  'discount','code','promo','off','sale','buy','purchase','grab','review','unbox',
  'shipping','received','arrived','box','package','tested','tried','using','use it',
];

const EMOTION_WORDS = [
  'love','amazing','incredible','beautiful','grateful','thankful','heartbreaking','heart',
  'cried','crying','tears','smile','smiling','laugh','laughing','joy','proud','hope',
  'inspire','inspiring','moved','overwhelmed','meaningful','powerful','blessed','wow',
];

const BENEFIT_TOKENS = [
  'you\'ll','youll','you can','you get','you save','saves you','helps you','for you',
  'so you','that you','because you','your','best for','perfect for','works for',
];

const CTA_TOKENS = [
  'click','tap','swipe','sign up','register','donate','give','support','share','follow',
  'comment','subscribe','join','grab','order','buy','book','rsvp','show up','check the link',
];

const TESTIMONIAL_PHRASES = [
  'changed my life','for the first time','i never thought','i used to','before this',
  'after','now i','finally','if it weren\'t for','wouldn\'t be here','wouldnt be here',
  'best decision','game changer','life changing',
];

const GROUP_TOKENS = [
  'we','us','our','everyone','team','together','community','family','crew','group',
  'all of you','all of us','volunteers','supporters','riders','runners','walkers',
];

const SCENIC_TOKENS = [
  'mountain','ocean','beach','sunset','sunrise','sky','river','trail','forest','park',
  'view','horizon','beautiful day','perfect day','outdoors','outside','open road',
];

const CELEBRATION_TOKENS = [
  'we did it','finished','done','crossed the','crossed','medal','champion','victory',
  'celebrate','celebrating','party','milestone','accomplished','achieved','completed',
  'made it','first place','goal','raised','reached','over','smashed',
];

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function ratio(hits: number, divisor: number): number {
  if (divisor <= 0) return 0;
  return Math.min(1, hits / divisor);
}

function countOccurrences(text: string, terms: string[]): number {
  let count = 0;
  for (const t of terms) {
    if (!t) continue;
    const idx = text.indexOf(t);
    if (idx !== -1) count++;
  }
  return count;
}

function specificityScore(rawText: string): number {
  // Count digits and capitalized non-sentence-start words.
  const digits = (rawText.match(/\d+/g) || []).length;
  const properNouns = (rawText.match(/(?<=[a-z]\s)[A-Z][a-z]+/g) || []).length;
  return ratio(digits + properNouns, 4);
}

function durationFitScore(durationSec: number): number {
  // Sweet spot 6-30s, gentle falloff.
  if (durationSec < 3) return 0.1;
  if (durationSec < 6) return 0.5;
  if (durationSec <= 30) return 1.0;
  if (durationSec <= 45) return 0.6;
  if (durationSec <= 60) return 0.3;
  return 0.1;
}

function hookStrengthScore(rawText: string): number {
  const norm = normalize(rawText);
  // Weight openers heavier — first 6 words matter most.
  const opening = norm.split(' ').slice(0, 6).join(' ');
  const openHits = countOccurrences(opening, HOOK_OPENERS);
  const tailHits = countOccurrences(norm, HOOK_OPENERS) - openHits;
  return Math.min(1, openHits * 0.6 + tailHits * 0.1);
}

export function extractFeatures(text: string, durationSec: number): ChunkFeatures {
  const norm = normalize(text);
  const wordCount = norm.split(' ').filter(Boolean).length || 1;

  return {
    hookStrength: hookStrengthScore(text),
    productMention: ratio(countOccurrences(norm, PRODUCT_KEYWORDS), 2),
    emotionalIntensity: ratio(countOccurrences(norm, EMOTION_WORDS), 2),
    benefitStatement: ratio(countOccurrences(norm, BENEFIT_TOKENS), 2),
    ctaLikelihood: ratio(countOccurrences(norm, CTA_TOKENS), 2),
    retentionPotential: ratio(specificityScore(text) * 4 + Math.min(1, wordCount / 25) * 2, 4),
    testimonialPhrase: ratio(countOccurrences(norm, TESTIMONIAL_PHRASES), 1),
    groupLanguage: ratio(countOccurrences(norm, GROUP_TOKENS), 2),
    scenicLanguage: ratio(countOccurrences(norm, SCENIC_TOKENS), 1),
    celebrationLanguage: ratio(countOccurrences(norm, CELEBRATION_TOKENS), 1),
    durationFit: durationFitScore(durationSec),
    specificity: specificityScore(text),
  };
}

// ---------------------------------------------------------------------------
// Chunk grouping — combine adjacent transcript segments into clip-sized spans
// ---------------------------------------------------------------------------

const TARGET_MIN_SEC = 6;
const TARGET_MAX_SEC = 30;
const HARD_MAX_SEC = 45;

/**
 * Absolute cap applied to every generated candidate regardless of source length
 * or segment packing. A "short" must never exceed this duration — if a candidate
 * somehow slips through longer, its end is trimmed to start + cap.
 * Paired with the ≥80%-of-source reject in generateCandidates() so the engine
 * cannot silently emit the full source as a "short".
 *
 * Affiliate (TikTok Shop) is capped more aggressively than Nonprofit —
 * product-content shorts live or die in the first 15s, so we favor punchier
 * output even if it means leaving useful material on the cutting-room floor.
 */
export const SHORT_MAX_SEC = 30;
// Per-mode caps. Clipper lives in the 8–25s sweet spot (volume-first clipping
// for long-form creators — anything longer reads as a cold-take, not a scroll-
// stopping clip). Unknown modes fall through to the 30s default.
const SHORT_MAX_BY_MODE: Partial<Record<Mode, number>> = {
  affiliate: 20,
  nonprofit: 30,
  clipper: 25,
};
export function getShortMaxSec(mode: Mode): number {
  return SHORT_MAX_BY_MODE[mode] ?? SHORT_MAX_SEC;
}

/**
 * Per-mode minimum candidate duration. Clipper needs enough runway for a
 * hook + payoff (8s floor); affiliate/nonprofit keep the general 6s floor
 * so they can surface tight product-hook or celebration snippets.
 */
const SHORT_MIN_BY_MODE: Partial<Record<Mode, number>> = {
  clipper: 8,
};
export function getShortMinSec(mode: Mode): number {
  return SHORT_MIN_BY_MODE[mode] ?? TARGET_MIN_SEC;
}

/**
 * Minimum delta between source duration and chosen candidate duration for the
 * output to count as a real transformation. A 60s source with a 59s candidate
 * is effectively a full re-export — we reject that.
 */
export const MIN_TRIM_DELTA_SEC = 3;

/**
 * Reject candidates whose duration is within this fraction of the source. A
 * 0-29s candidate from a 30s source (97%) is not a real short.
 */
export const MAX_CANDIDATE_SOURCE_RATIO = 0.8;

interface CombinedChunk {
  startIdx: number;
  endIdx: number;
  start: number;
  end: number;
  text: string;
}

/**
 * Greedily combine consecutive whisper segments into windows that land in the
 * 6-30s sweet spot. Allows brief overrun up to HARD_MAX_SEC.
 */
function combineSegments(segments: TranscriptSegment[]): CombinedChunk[] {
  const out: CombinedChunk[] = [];
  if (!segments.length) return out;

  let cur: CombinedChunk = {
    startIdx: 0,
    endIdx: 0,
    start: segments[0].start,
    end: segments[0].end,
    text: segments[0].text.trim(),
  };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const candDuration = seg.end - cur.start;

    if (candDuration <= TARGET_MAX_SEC) {
      cur.endIdx = i;
      cur.end = seg.end;
      cur.text = (cur.text + ' ' + seg.text).trim();
      continue;
    }

    if (cur.end - cur.start >= TARGET_MIN_SEC) {
      out.push(cur);
      cur = { startIdx: i, endIdx: i, start: seg.start, end: seg.end, text: seg.text.trim() };
    } else if (candDuration <= HARD_MAX_SEC) {
      cur.endIdx = i;
      cur.end = seg.end;
      cur.text = (cur.text + ' ' + seg.text).trim();
    } else {
      out.push(cur);
      cur = { startIdx: i, endIdx: i, start: seg.start, end: seg.end, text: seg.text.trim() };
    }
  }

  if (cur.end - cur.start >= 2) out.push(cur);
  return out;
}

// ---------------------------------------------------------------------------
// Build ChunkInput[] from raw transcript segments
// ---------------------------------------------------------------------------

export function buildChunks(segments: TranscriptSegment[]): ChunkInput[] {
  const combined = combineSegments(segments);
  return combined.map((c, i) => ({
    idx: i,
    start: c.start,
    end: c.end,
    text: c.text,
    features: extractFeatures(c.text, c.end - c.start),
  }));
}

// ---------------------------------------------------------------------------
// Scoring + selection
// ---------------------------------------------------------------------------

function classifyClipType(features: ChunkFeatures, mode: Mode): string {
  // Pick the highest-signal feature relevant to the mode and use it as a label.
  const candidates: Array<[string, number]> = [];

  if (mode === 'affiliate') {
    candidates.push(
      ['hook', features.hookStrength],
      ['product', features.productMention],
      ['benefit', features.benefitStatement],
      ['cta', features.ctaLikelihood],
      ['testimonial', features.testimonialPhrase],
    );
  } else if (mode === 'clipper') {
    // Clipper vocabulary: moments, not product/donation signals. The labels
    // downstream (insights.assignClipperLabels) map these into user-facing
    // "Best hook / Most engaging / Fast highlight" tags.
    candidates.push(
      ['hook', features.hookStrength],
      ['insight', features.retentionPotential + features.specificity * 0.5],
      ['story', features.emotionalIntensity],
      ['takeaway', features.benefitStatement],
      ['moment', features.celebrationLanguage],
      ['testimonial', features.testimonialPhrase],
    );
  } else {
    candidates.push(
      ['testimonial', features.testimonialPhrase],
      ['celebration', features.celebrationLanguage],
      ['mission', features.emotionalIntensity],
      ['group', features.groupLanguage],
      ['scenic', features.scenicLanguage],
      ['hook', features.hookStrength],
    );
  }

  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0]?.[1] > 0 ? candidates[0][0] : 'general';
}

function extractHookLine(text: string): string {
  // First sentence, capped to a punchy length.
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return firstSentence.length > 90 ? firstSentence.slice(0, 87) + '…' : firstSentence;
}

/**
 * Score a single segment for hook-likeness (used by refineCandidateStarts to
 * snap a candidate's start time to the strongest opener within the first ~5s).
 */
function segmentHookScore(text: string): number {
  const norm = normalize(text);
  const opening = norm.split(' ').slice(0, 6).join(' ');
  const openHits = countOccurrences(opening, HOOK_OPENERS);
  // Bonus for question marks (curiosity hook) and short punchy sentences.
  const isQuestion = /\?/.test(text);
  const wordCount = norm.split(' ').filter(Boolean).length;
  const punchy = wordCount >= 3 && wordCount <= 12 ? 0.3 : 0;
  return Math.min(1, openHits * 0.5 + (isQuestion ? 0.4 : 0) + punchy);
}

/**
 * Snap each selected candidate's start time to the strongest hook segment
 * that lies within the first HOOK_TRIM_WINDOW_SEC of the original window.
 *
 * Why: even if a chunk scored high overall, the BEST first 1-2 sentences
 * are what determine retention on TikTok/Reels. We always start the clip
 * on the punchiest opener available within the lookahead.
 *
 * Never extends a candidate later than its current end.
 */
const HOOK_TRIM_WINDOW_SEC = 5;
const HOOK_TRIM_MIN_DURATION_SEC = 4;

export function refineCandidateStarts(
  candidates: Array<CandidateOutput & { rank: number }>,
  segments: TranscriptSegment[],
): Array<CandidateOutput & { rank: number; hookStartSec?: number }> {
  if (segments.length === 0) return candidates;

  return candidates.map((c) => {
    const windowEnd = c.start + HOOK_TRIM_WINDOW_SEC;
    let best: { start: number; score: number; text: string } | null = null;

    for (const seg of segments) {
      if (seg.end <= c.start) continue;
      if (seg.start >= windowEnd) break;
      if (seg.start >= c.end - HOOK_TRIM_MIN_DURATION_SEC) break;
      const score = segmentHookScore(seg.text);
      if (!best || score > best.score) {
        best = { start: seg.start, score, text: seg.text };
      }
    }

    // Only snap if we found a meaningfully-hooky segment.
    if (best && best.score >= 0.3 && best.start > c.start) {
      const snapped = Math.max(c.start, best.start - 0.15); // 150ms lead-in
      // Ensure we keep at least HOOK_TRIM_MIN_DURATION_SEC of clip
      if (c.end - snapped >= HOOK_TRIM_MIN_DURATION_SEC) {
        return {
          ...c,
          start: Number(snapped.toFixed(3)),
          hookText: extractHookLine(best.text + ' ' + c.text.slice(c.text.indexOf(best.text) + best.text.length)),
          hookStartSec: Number(snapped.toFixed(3)),
        };
      }
    }
    return { ...c, hookStartSec: c.start };
  });
}

interface ScoredChunk extends ChunkInput {
  finalScore: number;
  breakdown: Record<string, number>;
  clipType: string;
}

export function scoreChunks(chunks: ChunkInput[], mode: Mode): ScoredChunk[] {
  const cfg = getMode(mode);
  const weights = cfg.scoreWeights;

  return chunks.map((chunk) => {
    const breakdown: Record<string, number> = {};
    let total = 0;
    for (const [k, w] of Object.entries(weights)) {
      const featureKey = k as keyof ChunkFeatures;
      const featureVal = chunk.features[featureKey];
      const contribution = featureVal * w;
      breakdown[featureKey] = Number(contribution.toFixed(3));
      total += contribution;
    }
    return {
      ...chunk,
      finalScore: Number(total.toFixed(3)),
      breakdown,
      clipType: classifyClipType(chunk.features, mode),
    };
  });
}

/**
 * Pick top N non-overlapping candidates. Returns 1..N CandidateOutput,
 * each tagged with rank.
 */
export function selectTopCandidates(
  scored: ScoredChunk[],
  targetCount: number,
): Array<CandidateOutput & { rank: number }> {
  const sorted = [...scored].sort((a, b) => b.finalScore - a.finalScore);
  const picked: ScoredChunk[] = [];

  for (const cand of sorted) {
    if (picked.length >= targetCount) break;
    const overlaps = picked.some((p) => !(cand.end <= p.start || cand.start >= p.end));
    if (!overlaps) picked.push(cand);
  }

  // Rank by source order (chronological) to feel natural in the output grid.
  picked.sort((a, b) => a.start - b.start);

  return picked.map((c, i) => ({
    start: c.start,
    end: c.end,
    text: c.text,
    hookText: extractHookLine(c.text),
    clipType: c.clipType,
    score: c.finalScore,
    scoreBreakdown: c.breakdown,
    sourceChunkIdxs: [c.idx],
    rank: i + 1,
  }));
}

/**
 * Build finer-grained sub-chunks from a short video where combineSegments
 * would produce only 1-2 chunks spanning the whole source.
 *
 * For a 19s video with segments [0-3, 3-7, 7-12, 12-19], combineSegments
 * returns one chunk 0-19. This function instead generates overlapping windows
 * of TARGET_MIN_SEC..TARGET_MAX_SEC that give the selector real variety.
 */
function buildSubChunks(segments: TranscriptSegment[]): ChunkInput[] {
  if (segments.length < 2) return [];
  const sourceDuration = segments[segments.length - 1].end - segments[0].start;
  // Only activate for short videos where combineSegments produces too few chunks
  if (sourceDuration > HARD_MAX_SEC * 1.5) return [];

  const out: ChunkInput[] = [];
  let idx = 0;

  // Sliding window: start from each segment, extend to TARGET_MIN..TARGET_MAX
  for (let i = 0; i < segments.length; i++) {
    let text = '';
    for (let j = i; j < segments.length; j++) {
      const duration = segments[j].end - segments[i].start;
      text = (text + ' ' + segments[j].text).trim();
      if (duration >= TARGET_MIN_SEC && duration <= TARGET_MAX_SEC) {
        out.push({
          idx: idx++,
          start: segments[i].start,
          end: segments[j].end,
          text,
          features: extractFeatures(text, duration),
        });
      }
      if (duration > TARGET_MAX_SEC) break;
    }
  }

  return out;
}

/**
 * Convenience pipeline: segments → top N candidates for a given mode,
 * with hook-first start refinement applied (snaps each candidate's start to
 * the strongest opener inside its first 5s).
 */
/**
 * Snap `candidate.end` to the last segment boundary at or before
 * `candidate.start + maxSec`. Avoids cutting mid-word while still
 * enforcing the hard cap.
 */
function clampCandidateToShort<T extends { start: number; end: number }>(
  cand: T,
  segments: TranscriptSegment[],
  maxSec: number,
): T {
  const dur = cand.end - cand.start;
  if (dur <= maxSec) return cand;
  const budget = cand.start + maxSec;
  let snappedEnd = budget;
  for (const seg of segments) {
    if (seg.end <= cand.start) continue;
    if (seg.end > budget) break;
    snappedEnd = seg.end;
  }
  if (snappedEnd < cand.start + TARGET_MIN_SEC) snappedEnd = cand.start + TARGET_MIN_SEC;
  console.log(`[scoring] Clamped candidate from ${cand.start.toFixed(1)}-${cand.end.toFixed(1)}s (${dur.toFixed(1)}s) → ${cand.start.toFixed(1)}-${snappedEnd.toFixed(1)}s (cap=${maxSec}s)`);
  return { ...cand, end: Number(snappedEnd.toFixed(3)) };
}

export function generateCandidates(
  segments: TranscriptSegment[],
  mode: Mode,
  targetCount: number,
  sourceDurationSec?: number,
): {
  chunks: ChunkInput[];
  selected: Array<CandidateOutput & { rank: number; hookStartSec?: number }>;
} {
  let chunks = buildChunks(segments);
  const subChunks = buildSubChunks(segments);

  // Merge sub-chunks first, then filter.
  if (subChunks.length > 0) {
    chunks = [...chunks, ...subChunks];
    const seen = new Set<string>();
    chunks = chunks.filter((c) => {
      const key = `${c.start.toFixed(2)}-${c.end.toFixed(2)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Drop chunks that span ≥80% of source BEFORE scoring/selection.
  // The greedy non-overlap picker would otherwise select the full-source chunk
  // first and block every shorter sub-window from being considered.
  if (sourceDurationSec && sourceDurationSec > 0) {
    const threshold = sourceDurationSec * MAX_CANDIDATE_SOURCE_RATIO;
    const before = chunks.length;
    chunks = chunks.filter((c) => (c.end - c.start) < threshold);
    if (chunks.length !== before) {
      console.log(`[scoring] Dropped ${before - chunks.length} near-full-source chunk(s) (source=${sourceDurationSec.toFixed(1)}s, threshold=${threshold.toFixed(1)}s, remaining=${chunks.length})`);
    }
  }

  const scored = scoreChunks(chunks, mode);
  let picked = selectTopCandidates(scored, Math.max(targetCount, targetCount * 2));

  // GUARD: reject candidates that are effectively the full source.
  //   - span ≥ MAX_CANDIDATE_SOURCE_RATIO of source duration
  //   - OR leave less than MIN_TRIM_DELTA_SEC of trimmed material
  // Unlike the earlier code path, we do NOT silently fall back to the
  // least-bad offender — if every candidate fails, we return zero selected
  // and let stageAnalyze surface a clean product message.
  if (sourceDurationSec && sourceDurationSec > 0) {
    const ratioThreshold = sourceDurationSec * MAX_CANDIDATE_SOURCE_RATIO;
    const filtered = picked.filter((c) => {
      const candDuration = c.end - c.start;
      const trimDelta = sourceDurationSec - candDuration;
      if (candDuration >= ratioThreshold) {
        console.log(`[scoring] Rejected: ${c.start.toFixed(1)}-${c.end.toFixed(1)}s (${candDuration.toFixed(1)}s = ${((candDuration / sourceDurationSec) * 100).toFixed(0)}% of ${sourceDurationSec.toFixed(1)}s source)`);
        return false;
      }
      if (trimDelta < MIN_TRIM_DELTA_SEC) {
        console.log(`[scoring] Rejected: ${c.start.toFixed(1)}-${c.end.toFixed(1)}s (trim delta only ${trimDelta.toFixed(1)}s, min ${MIN_TRIM_DELTA_SEC}s)`);
        return false;
      }
      return true;
    });
    picked = filtered;
  }

  // Enforce per-mode floor BEFORE slicing to target — clipper needs ≥8s of
  // runway for a real hook + payoff, shorter cuts read as noise.
  const minSec = getShortMinSec(mode);
  if (minSec > TARGET_MIN_SEC) {
    const before = picked.length;
    picked = picked.filter((c) => (c.end - c.start) >= minSec);
    if (picked.length !== before) {
      console.log(`[scoring] ${mode}: dropped ${before - picked.length} sub-${minSec}s candidate(s)`);
    }
  }

  picked = picked.slice(0, targetCount);
  picked = picked.map((c, i) => ({ ...c, rank: i + 1 }));

  const refined = refineCandidateStarts(picked, segments);
  // Final safety: no candidate may exceed the mode-specific cap regardless of
  // how it got here. Affiliate (20s) < Clipper (25s) < Nonprofit (30s).
  const maxSec = getShortMaxSec(mode);
  const clamped = refined.map((c) => clampCandidateToShort(c, segments, maxSec));

  return { chunks, selected: clamped };
}
