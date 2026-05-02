/**
 * AI Video Editor — LLM edit-plan generator.
 *
 * This is the value prop. The pipeline used to be 100% heuristic ffmpeg
 * (silence trim + retake regex). That feels like Premiere-on-rails, not "AI".
 *
 * What this module does:
 *   - Takes the Whisper transcript + mode + platform + user notes
 *   - Asks Claude Sonnet 4 to act as a senior short-form editor
 *   - Returns a structured EditPlan: keep ranges, retake removals, hook
 *     punch-up, caption phrase rewrites, b-roll cue timestamps, end-card
 *   - All output is grounded in transcript timestamps so the renderer can
 *     execute the plan deterministically
 *
 * Why Sonnet, not Haiku: this is the reasoning step. We let Haiku handle
 * /create LLM calls (cost win), but the editor's edit decisions are the
 * marquee moment. Sonnet 4 is the right model.
 *
 * If the LLM call fails, we fall back to a heuristic plan derived from the
 * transcript so the pipeline never blocks on an LLM outage.
 */
import { callAnthropicJSON } from '@/lib/ai/anthropic';
import type { EditJobTranscript, EditMode } from './pipeline';

// ---------- Plan shape ----------

export interface PlanKeepRange {
  start: number;
  end: number;
  /** Why the AI kept this — surfaced in the UI for transparency */
  reason?: string;
}

export interface PlanCaption {
  start: number;
  end: number;
  text: string;
  /** 'hook' captions get bigger, top-positioned style */
  style?: 'normal' | 'hook' | 'emphasis';
}

export interface PlanBRollCue {
  /** Seconds from the start of the FINAL cut, not the source */
  at: number;
  description: string;
}

export interface EditPlan {
  /** Concrete keep ranges (source timestamps) — drives the cuts */
  keep_ranges: PlanKeepRange[];
  /** Source timestamps to drop (retakes, dead air, off-topic) */
  drop_ranges: Array<{ start: number; end: number; reason?: string }>;
  /** Optional rewrite of the first 3-second hook line */
  hook?: { text: string; reason?: string } | null;
  /** Captions to burn (final-cut timestamps) */
  captions: PlanCaption[];
  /** B-roll suggestion cues (final-cut timestamps) — UI-visible, not auto-rendered yet */
  broll_cues: PlanBRollCue[];
  /** Suggested end-card text */
  end_card?: { text: string } | null;
  /** Short prose explanation for the user */
  rationale: string;
  /** Did this plan come from the LLM or the heuristic fallback */
  source: 'llm' | 'fallback';
  /** Model used (only when source='llm') */
  model?: string;
}

export interface BuildEditPlanInput {
  transcript: EditJobTranscript;
  mode: EditMode;
  platform?: string;
  notes?: string;
  /** Heuristic-derived keep ranges (from silence detection + retake removal) */
  heuristicKeep: Array<{ start: number; end: number }>;
  /** Total source duration in seconds */
  sourceDuration: number;
  /** Job id, for correlation logging */
  jobId: string;
}

// ---------- Prompt ----------

const SYSTEM_PROMPT = `You are a senior short-form video editor for TikTok / Reels / YouTube Shorts.
You are EDITING raw footage from a creator into a tight, scroll-stopping clip.

Your output is a JSON edit plan that a renderer will execute deterministically.

ALL TIMESTAMPS YOU OUTPUT ARE IN **SOURCE TIME** (seconds from the start of
the original raw clip). The renderer remaps them to final-cut time after
concatenating your keep_ranges. Never output negative timestamps and never
exceed the source duration.

Rules:
1. Every timestamp must come from the transcript words/segments you are given.
   Never invent timestamps outside the source duration.
2. Keep retakes' LATER attempt (cleaner take), drop the earlier ABORTED attempt.
   Example: speaker says "I love it when — I absolutely love it when X happens."
   Drop "I love it when —" and keep "I absolutely love it when X happens."
3. For HOOK mode: rewrite the first 3 seconds into a punchier, more curiosity-
   driven line. Keep it true to the speaker's voice; don't fabricate claims.
4. Captions: short phrases, 2-5 words each, positive emotional priming. Use
   SOURCE timestamps that fall INSIDE one of your keep_ranges. Mark the first
   3 seconds of source-time as "hook" (bigger). Mark high-impact words "emphasis".
5. B-roll cues: suggest 0-3 visual cuts where the viewer's attention should
   refresh. The "at" field is in FINAL-CUT seconds (estimated time after
   concat). One line each, concrete.
6. End-card: ≤ 8 words, action-oriented (e.g. "Save this for later" or "Try
   it free at FlashFlow.ai"). Skip if the speaker already gave a CTA.
7. Total final length should fit the platform: TikTok/Reels ≤ 60s, Shorts ≤ 60s,
   long YouTube ≤ 180s. Trim ruthlessly.

Output ONLY valid JSON matching this shape (no commentary, no code fences):

{
  "keep_ranges": [{"start": 0.0, "end": 3.2, "reason": "hook line"}],
  "drop_ranges": [{"start": 3.2, "end": 4.8, "reason": "aborted retake"}],
  "hook": {"text": "Rewritten 3-sec opener", "reason": "stronger curiosity gap"} or null,
  "captions": [{"start": 0.0, "end": 1.2, "text": "WAIT FOR IT", "style": "hook"}],
  "broll_cues": [{"at": 5.0, "description": "close-up of product label"}],
  "end_card": {"text": "Save this for later"} or null,
  "rationale": "one short paragraph in plain English"
}`;

function buildUserPrompt(input: BuildEditPlanInput): string {
  const { transcript, mode, platform, notes, heuristicKeep, sourceDuration } = input;

  // Compact the transcript: timestamped segments are enough; word-level is
  // overkill for the planner and burns tokens.
  const segLines = (transcript.segments || []).map((s, i) => {
    const start = s.start.toFixed(2);
    const end = s.end.toFixed(2);
    return `[${i}] (${start}–${end}s) ${s.text.trim()}`;
  }).join('\n');

  const heuristicLines = heuristicKeep.length > 0
    ? heuristicKeep.map((k) => `(${k.start.toFixed(2)}–${k.end.toFixed(2)}s)`).join(', ')
    : '(none — no silence detected)';

  const platformLine = platform
    ? `\nPLATFORM: ${platform} — optimize aspect/length for this surface.`
    : '';
  const notesLine = (notes && notes.trim().length > 0)
    ? `\nUSER NOTES (steering — follow these unless they violate basic editing sense):\n${notes.trim().slice(0, 2000)}`
    : '';

  return `MODE: ${mode}
SOURCE DURATION: ${sourceDuration.toFixed(2)}s${platformLine}${notesLine}

HEURISTIC KEEP RANGES (silence + retake-trimmed by ffmpeg already):
${heuristicLines}

TRANSCRIPT (segment-level, with source timestamps):
${segLines || '(no transcribable speech detected)'}

Produce the edit plan JSON.`;
}

// ---------- Validation ----------

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

interface RawPlan {
  keep_ranges?: unknown;
  drop_ranges?: unknown;
  hook?: unknown;
  captions?: unknown;
  broll_cues?: unknown;
  end_card?: unknown;
  rationale?: unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Defensive parse: an LLM can return malformed JSON or out-of-range numbers.
 * Drop bad rows silently; never throw on shape issues.
 */
function sanitizePlan(raw: RawPlan, sourceDuration: number): Omit<EditPlan, 'source' | 'model'> {
  const dur = Math.max(0.1, sourceDuration);

  const keepArr = Array.isArray(raw.keep_ranges) ? raw.keep_ranges : [];
  const keep_ranges: PlanKeepRange[] = keepArr.flatMap((r) => {
    if (!isObject(r)) return [];
    const start = clamp(Number(r.start), 0, dur);
    const end = clamp(Number(r.end), 0, dur);
    if (end - start < 0.1) return [];
    const reason = typeof r.reason === 'string' ? r.reason.slice(0, 200) : undefined;
    return [{ start, end, reason }];
  });

  const dropArr = Array.isArray(raw.drop_ranges) ? raw.drop_ranges : [];
  const drop_ranges = dropArr.flatMap((r) => {
    if (!isObject(r)) return [];
    const start = clamp(Number(r.start), 0, dur);
    const end = clamp(Number(r.end), 0, dur);
    if (end - start < 0.05) return [];
    const reason = typeof r.reason === 'string' ? r.reason.slice(0, 200) : undefined;
    return [{ start, end, reason }];
  });

  let hook: EditPlan['hook'] = null;
  if (isObject(raw.hook) && typeof raw.hook.text === 'string' && raw.hook.text.trim().length > 0) {
    hook = {
      text: raw.hook.text.trim().slice(0, 200),
      reason: typeof raw.hook.reason === 'string' ? raw.hook.reason.slice(0, 200) : undefined,
    };
  }

  const capArr = Array.isArray(raw.captions) ? raw.captions : [];
  const captions: PlanCaption[] = capArr.flatMap((c) => {
    if (!isObject(c)) return [];
    const start = clamp(Number(c.start), 0, dur);
    const end = clamp(Number(c.end), 0, dur);
    const text = typeof c.text === 'string' ? c.text.trim().slice(0, 120) : '';
    if (!text || end - start < 0.05) return [];
    const styleRaw = typeof c.style === 'string' ? c.style : 'normal';
    const style: PlanCaption['style'] = (styleRaw === 'hook' || styleRaw === 'emphasis') ? styleRaw : 'normal';
    return [{ start, end, text, style }];
  });

  const brollArr = Array.isArray(raw.broll_cues) ? raw.broll_cues : [];
  const broll_cues: PlanBRollCue[] = brollArr.flatMap((b) => {
    if (!isObject(b)) return [];
    const at = clamp(Number(b.at), 0, dur);
    const description = typeof b.description === 'string' ? b.description.trim().slice(0, 200) : '';
    if (!description) return [];
    return [{ at, description }];
  }).slice(0, 3);

  let end_card: EditPlan['end_card'] = null;
  if (isObject(raw.end_card) && typeof raw.end_card.text === 'string' && raw.end_card.text.trim().length > 0) {
    end_card = { text: raw.end_card.text.trim().slice(0, 80) };
  }

  const rationale = typeof raw.rationale === 'string' ? raw.rationale.slice(0, 600) : '';

  return { keep_ranges, drop_ranges, hook, captions, broll_cues, end_card, rationale };
}

// ---------- Heuristic fallback ----------

/**
 * If the LLM is unavailable, build a plan from the heuristic keep ranges so
 * the pipeline still succeeds. No hook rewrite, simple captions from the
 * transcript words. Better-than-nothing.
 */
function heuristicFallbackPlan(input: BuildEditPlanInput): EditPlan {
  const { transcript, heuristicKeep, sourceDuration } = input;

  const captions: PlanCaption[] = [];
  const words = transcript.words || [];
  if (words.length > 0) {
    let i = 0;
    while (i < words.length) {
      const chunk = words.slice(i, i + 4);
      if (chunk.length === 0) break;
      const start = clamp(chunk[0].start, 0, sourceDuration);
      const end = clamp(chunk[chunk.length - 1].end, 0, sourceDuration);
      const text = chunk.map((w) => w.word.trim()).join(' ').toUpperCase();
      if (text && end - start >= 0.05) {
        captions.push({
          start,
          end,
          text: text.slice(0, 120),
          style: start < 3 ? 'hook' : 'normal',
        });
      }
      i += 4;
    }
  }

  return {
    keep_ranges: heuristicKeep.map((k) => ({
      start: k.start,
      end: k.end,
      reason: 'silence-trimmed',
    })),
    drop_ranges: [],
    hook: null,
    captions,
    broll_cues: [],
    end_card: null,
    rationale: 'LLM planner unavailable — used heuristic silence + retake trim only.',
    source: 'fallback',
  };
}

// ---------- Source-time → final-time remap ----------

/**
 * Given keep_ranges in SOURCE time and a caption that's also in source time,
 * return the caption with timestamps remapped to FINAL-CUT time (the time
 * the caption should appear in the concatenated output).
 *
 * Returns null if the caption doesn't fall within any keep range — those
 * captions get silently dropped (they'd never be visible anyway).
 *
 * Example: keep_ranges = [{0,3}, {5,8}]
 *   - caption at source 1.5–2.5 → final 1.5–2.5  (offset 0 inside first keep)
 *   - caption at source 6.0–6.5 → final 4.0–4.5  (3s of first keep + 1s into second)
 *   - caption at source 4.0–4.5 → null  (in a dropped range)
 */
export function remapCaptionToFinalTime(
  caption: PlanCaption,
  keepRanges: Array<{ start: number; end: number }>,
): PlanCaption | null {
  // Sort keep ranges to make the offset math monotonic.
  const sorted = [...keepRanges].sort((a, b) => a.start - b.start);

  let cumulativeKept = 0;
  for (const r of sorted) {
    if (caption.start >= r.start && caption.start < r.end) {
      // Caption begins inside this keep range. Clamp the end too.
      const offsetInRange = caption.start - r.start;
      const finalStart = cumulativeKept + offsetInRange;
      const clampedEnd = Math.min(caption.end, r.end);
      const finalEnd = cumulativeKept + (clampedEnd - r.start);
      if (finalEnd - finalStart < 0.05) return null;
      return {
        start: finalStart,
        end: finalEnd,
        text: caption.text,
        style: caption.style,
      };
    }
    cumulativeKept += r.end - r.start;
  }
  return null;
}

/**
 * Bulk-remap caption list. Out-of-range captions are silently dropped.
 */
export function remapCaptionsToFinalTime(
  captions: PlanCaption[],
  keepRanges: Array<{ start: number; end: number }>,
): PlanCaption[] {
  const out: PlanCaption[] = [];
  for (const c of captions) {
    const remapped = remapCaptionToFinalTime(c, keepRanges);
    if (remapped) out.push(remapped);
  }
  return out;
}

// ---------- Public API ----------

/**
 * Generate an edit plan. Tries Claude Sonnet 4; falls back deterministically.
 * Never throws — failures resolve to a heuristic plan with source='fallback'.
 */
export async function buildEditPlan(input: BuildEditPlanInput): Promise<EditPlan> {
  // Check API key — if missing, skip the LLM call cleanly.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[editor/edit-plan] ANTHROPIC_API_KEY not set — using heuristic fallback');
    return heuristicFallbackPlan(input);
  }

  // No speech → heuristic-only.
  if (!input.transcript.text || input.transcript.text.trim().length === 0) {
    return heuristicFallbackPlan(input);
  }

  const prompt = buildUserPrompt(input);

  try {
    const { parsed, raw } = await callAnthropicJSON<RawPlan>(prompt, {
      // Sonnet 4 is the value-prop step. Don't downgrade.
      model: 'claude-sonnet-4-20250514',
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 2048,
      // Lower temp = more deterministic edit decisions.
      temperature: 0.4,
      requestType: 'edit-plan',
      agentId: 'editor.edit-plan',
      correlationId: input.jobId,
    });

    const sanitized = sanitizePlan(parsed, input.sourceDuration);

    // If the LLM returned NO usable keep ranges, fall back so the renderer
    // doesn't produce a 0-byte clip.
    if (sanitized.keep_ranges.length === 0) {
      console.warn('[editor/edit-plan] LLM returned 0 keep ranges — falling back', { jobId: input.jobId });
      return heuristicFallbackPlan(input);
    }

    return {
      ...sanitized,
      source: 'llm',
      model: raw.model,
    };
  } catch (err) {
    // Common failure modes: rate limit, JSON parse fail, network. Don't poison
    // the pipeline on any of these — fall back.
    console.warn('[editor/edit-plan] LLM call failed; using heuristic fallback', {
      jobId: input.jobId,
      err: err instanceof Error ? err.message : String(err),
    });
    return heuristicFallbackPlan(input);
  }
}
