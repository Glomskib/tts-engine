/**
 * Dedupe repeated "takes" from a word-level transcript.
 *
 * When a creator records B-roll style or unscripted, they often say the same
 * line two or three times before they're happy with one. The final cut should
 * keep only the LAST take of each repeated line — that's Brandon's locked
 * decision for FlashFlow's clipping pipeline.
 *
 * Algorithm:
 *   1. Group words into "sentences" — runs of words ending at natural breaks
 *      (sentence punctuation, or a gap >= 0.6s between consecutive words).
 *   2. Normalize each sentence (lowercase, strip filler, collapse spaces).
 *   3. Find groups of similar sentences using a stem hash (first 4 content
 *      words after stopword removal). Sentences sharing the same stem are
 *      treated as the same "line."
 *   4. For each group with >= 2 occurrences, emit cut ranges covering all
 *      occurrences EXCEPT the last one.
 *   5. Pad cut ranges slightly so we don't clip the start of the final take.
 *
 * Returns time ranges to CUT, expressed in seconds since the start of the
 * source video. The caller is responsible for turning these into
 * EditPlanAction `{type:'cut', start_sec, end_sec}` entries.
 */

export interface TranscriptWord {
  start: number;
  end: number;
  text: string;
}

export interface DedupeCutRange {
  start_sec: number;
  end_sec: number;
  reason: string;
}

export interface DedupeOptions {
  /** Word-gap that signals a sentence boundary (sec). Default 0.6. */
  sentenceGapSec?: number;
  /** Minimum content-word count for a sentence to be considered. */
  minWordCount?: number;
  /** Pre-roll padding kept BEFORE the start of a cut, sec. */
  preRollSec?: number;
  /** Post-roll padding kept AFTER the end of a cut, sec. */
  postRollSec?: number;
  /** Similarity stem length (number of content words). Default 4. */
  stemWords?: number;
}

// ---- Stopwords ----
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do', 'does', 'for',
  'from', 'had', 'has', 'have', 'he', 'her', 'his', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'just', 'like', 'me', 'my', 'no', 'not', 'now', 'of',
  'on', 'one', 'or', 'our', 'out', 'over', 'so', 'some', 'than', 'that',
  'the', 'their', 'them', 'then', 'there', 'they', 'this', 'to', 'too',
  'up', 'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who',
  'will', 'with', 'would', 'you', 'your', 'um', 'uh', 'erm', 'ah', 'eh',
  'okay', 'ok', 'right', 'yeah', 'yep', 'nope', 'well', 'actually', 'like',
  'kind', 'sort',
]);

const PUNCTUATION_RE = /[.!?]/;
const NON_WORD_RE = /[^a-z0-9\s']/g;

/** Public entry point. */
export function dedupeTranscriptTakes(
  words: TranscriptWord[] | null | undefined,
  opts: DedupeOptions = {},
): DedupeCutRange[] {
  if (!words || words.length < 4) return [];

  const sentenceGapSec = opts.sentenceGapSec ?? 0.6;
  const minWordCount = opts.minWordCount ?? 4;
  const preRollSec = opts.preRollSec ?? 0.05;
  const postRollSec = opts.postRollSec ?? 0.1;
  const stemWords = opts.stemWords ?? 4;

  // 1. Group words into sentences.
  const sentences = groupIntoSentences(words, sentenceGapSec);

  // 2. Filter trivially short sentences.
  const usable = sentences.filter(s => contentWordCount(s.normalized) >= minWordCount);

  if (usable.length < 2) return [];

  // 3. Group sentences by stem.
  const groups = new Map<string, typeof usable>();
  for (const s of usable) {
    const stem = stemHash(s.normalized, stemWords);
    if (!stem) continue;
    const list = groups.get(stem) ?? [];
    list.push(s);
    groups.set(stem, list);
  }

  // 4. Build cut ranges: for any group with multiple sentences, cut all but
  //    the LAST occurrence.
  const cuts: DedupeCutRange[] = [];
  for (const [stem, list] of groups) {
    if (list.length < 2) continue;
    // sort by start to be safe (groupIntoSentences should already be ordered)
    list.sort((a, b) => a.start - b.start);
    const last = list[list.length - 1];
    for (let i = 0; i < list.length - 1; i++) {
      const s = list[i];
      cuts.push({
        start_sec: Math.max(0, s.start - preRollSec),
        end_sec: s.end + postRollSec,
        reason: `repeat take (kept last "${last.normalized.slice(0, 40)}")`,
      });
    }
    void stem;
  }

  // 5. Merge overlapping/adjacent cuts so the renderer doesn't see two cuts
  //    that share a boundary.
  return mergeRanges(cuts);
}

/**
 * Sentence-level repeat removal — robust to real-world flub-and-redo.
 *
 * dedupeTranscriptTakes groups WORDS into pseudo-sentences by pauses and needs
 * a near-identical first-4-content-word stem. Real repeats are rarely word-
 * identical, and a quick self-correction often has NO clean pause, so they slip
 * through (this was why repeats survived in real videos). This works on the
 * actual transcript SENTENCES (Whisper segments / ve_transcript_chunks) and
 * matches by token CONTAINMENT, so a flubbed fragment that's re-said more fully
 * ("...I was draggin—" → "...I was dragging through my days") is caught. Keeps
 * the LAST take, cuts the earlier one(s). Only compares sentences close in time
 * (default 15s) so a deliberate callback later in the video is never cut.
 */
export function dedupeSentences(
  segments: Array<{ start_sec: number; end_sec: number; text: string }>,
  opts: { simThreshold?: number; windowSec?: number; minContentWords?: number } = {},
): DedupeCutRange[] {
  const simThreshold = opts.simThreshold ?? 0.7;
  const windowSec = opts.windowSec ?? 15;
  const minWords = opts.minContentWords ?? 3;

  const segs = segments
    .map((s) => ({ start: s.start_sec, end: s.end_sec, tokens: contentTokenSet(s.text), raw: s.text }))
    .filter((s) => s.tokens.size >= minWords)
    .sort((a, b) => a.start - b.start);

  const cut: DedupeCutRange[] = [];
  const cutFlags = new Array(segs.length).fill(false);
  for (let i = 0; i < segs.length; i++) {
    if (cutFlags[i]) continue;
    for (let j = i + 1; j < segs.length; j++) {
      if (segs[j].start - segs[i].end > windowSec) break;
      if (cutFlags[j]) continue;
      if (containment(segs[i].tokens, segs[j].tokens) >= simThreshold) {
        cutFlags[i] = true; // keep the LATER take, cut this earlier one
        cut.push({
          start_sec: Math.max(0, segs[i].start - 0.05),
          end_sec: segs[i].end + 0.1,
          reason: `repeat take "${segs[i].raw.slice(0, 40)}"`,
        });
        break;
      }
    }
  }
  return mergeRanges(cut);
}

function contentTokenSet(text: string): Set<string> {
  return new Set(normalize(text).split(' ').filter((w) => w && !STOPWORDS.has(w)));
}

/** Containment similarity: shared tokens / smaller set — catches a short flub
 *  that's fully re-said in a longer, cleaner take. */
function containment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const t of small) if (large.has(t)) inter++;
  return inter / small.size;
}

// ---- Helpers ----

interface SentenceSpan {
  start: number;
  end: number;
  normalized: string;
}

function groupIntoSentences(words: TranscriptWord[], gapSec: number): SentenceSpan[] {
  const sents: SentenceSpan[] = [];
  let buf: TranscriptWord[] = [];
  let lastEnd: number | null = null;

  function flush() {
    if (buf.length === 0) return;
    sents.push({
      start: buf[0].start,
      end: buf[buf.length - 1].end,
      normalized: normalize(buf.map(w => w.text).join(' ')),
    });
    buf = [];
  }

  for (const w of words) {
    const gap = lastEnd === null ? 0 : w.start - lastEnd;
    const endsSentence = PUNCTUATION_RE.test(w.text);
    if (gap >= gapSec && buf.length > 0) flush();
    buf.push(w);
    lastEnd = w.end;
    if (endsSentence) flush();
  }
  flush();
  return sents;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(NON_WORD_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentWordCount(normalized: string): number {
  return normalized.split(' ').filter(w => w && !STOPWORDS.has(w)).length;
}

function stemHash(normalized: string, n: number): string | null {
  const content = normalized.split(' ').filter(w => w && !STOPWORDS.has(w));
  if (content.length < n) return null;
  return content.slice(0, n).join(' ');
}

function mergeRanges(ranges: DedupeCutRange[]): DedupeCutRange[] {
  if (ranges.length < 2) return ranges.slice();
  const sorted = ranges.slice().sort((a, b) => a.start_sec - b.start_sec);
  const out: DedupeCutRange[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start_sec <= prev.end_sec + 0.05) {
      prev.end_sec = Math.max(prev.end_sec, cur.end_sec);
      prev.reason = prev.reason.includes('+merged')
        ? prev.reason
        : prev.reason + ' +merged';
    } else {
      out.push(cur);
    }
  }
  return out;
}
