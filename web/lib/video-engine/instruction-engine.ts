/**
 * One-pass instruction engine — the /create "What do you want?" text becomes
 * the ACTUAL edit plan, not just a ranking hint.
 *
 * Before this module, context_json.describe only biased the hook-ranker's
 * clip RANKING; the render ignored it entirely (the lying UI from the
 * 2026-06-10 audit, item A). Now one Claude call maps the creator's
 * natural-language instructions onto the concrete knobs stageAssemble
 * already executes: content cuts (located in the transcript with real
 * timestamps), jump-cut/punch-in/B-roll/music toggles, a B-roll search
 * subject, a music vibe, a caption style, and a max duration.
 *
 * Contract: EVERY key is optional — only what the creator explicitly asked
 * for comes back. Any failure (no API key, model hiccup, bad JSON) returns
 * {} so the smart-cut defaults ship untouched; instructions must never be
 * able to break a render.
 */
import Anthropic from '@anthropic-ai/sdk';

export interface InstructionCutRange {
  start_sec: number;
  end_sec: number;
  /** Short human label ("rambling intro") — surfaced in the edit receipt. */
  reason: string;
}

export interface ParsedEditInstructions {
  /** Content cuts the creator asked for, located in the transcript. */
  cut_ranges?: InstructionCutRange[];
  /** "keep it one take" → false. */
  jump_cuts?: boolean;
  /** "no zooms" → false. */
  punch_ins?: boolean;
  /** "no b-roll" → false / "add b-roll" → true. */
  broll?: boolean;
  /** "show gym b-roll" → "gym" (Pexels search override). */
  broll_query?: string;
  /** "no music" → false / "add music" → true. */
  music?: boolean;
  /** "chill music" → 'calm'. Must be an R2 music-bundle vibe. */
  music_vibe?: string;
  /** "big captions" → 'mrbeast_big'. Keys mirror the fleet worker. */
  caption_style?: 'bold_yellow' | 'subtle_white' | 'mrbeast_big' | 'slow_reader' | 'karaoke';
  /** "keep it under 30 seconds" → 30. */
  max_duration_sec?: number;
  /** Understood but not executable with the knobs above — goes in the receipt. */
  notes?: string;
}

// Valid style keys mirror captionStyle() in scripts/render-node/slice-worker.mjs —
// anything else would silently fall back to bold_yellow on the fleet worker.
const CAPTION_STYLES = new Set(['bold_yellow', 'subtle_white', 'mrbeast_big', 'slow_reader', 'karaoke']);
// Music vibes mirror the R2 music-bundle folders (music-broll.ts VIBE_MUSIC) —
// an unknown vibe would presign a non-existent R2 key and the worker fetch
// would 404, so the model is told to map to the closest of these five.
const MUSIC_VIBES = new Set(['hype', 'calm', 'real', 'funny', 'sad']);

const ENGINE_SYSTEM = `You are an expert short-form video editor. A creator typed free-form instructions for how their video should be edited. Map their instructions onto a strict JSON edit plan.

Rules:
- ONLY include keys the creator explicitly asked for. Omit everything else. If they gave no actionable editing instructions (e.g. they only described the topic), return {}.
- Content cuts ("cut the intro", "remove the part about X"): find the matching region in the timestamped transcript and return cut_ranges entries with start_sec/end_sec taken from those timestamps, plus a short reason (e.g. "rambling intro").
- jump_cuts: false when they ask to keep it one take / no cuts. punch_ins: false when they ask for no zooms.
- broll: false for "no b-roll", true for "add b-roll". broll_query: the subject when they name what to show ("show gym b-roll" -> "gym").
- music: false for "no music", true for "add music". music_vibe must be EXACTLY one of: hype, calm, real, funny, sad — map their wording to the closest ("chill music" -> "calm").
- caption_style must be EXACTLY one of: bold_yellow, subtle_white, mrbeast_big, slow_reader, karaoke ("big/huge captions" -> mrbeast_big, "subtle/clean captions" -> subtle_white).
- max_duration_sec: the number for "keep it under 30 seconds" style asks.
- notes: ONE short sentence covering anything you understood but cannot execute with the keys above (so the creator sees we heard them).

You output ONLY the JSON object. No prose around it.`;

export async function parseEditInstructions(input: {
  instructions: string;
  transcript_chunks: Array<{ start: number; end: number; text: string }>;
  duration_sec: number;
}): Promise<ParsedEditInstructions> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[instruction-engine] ANTHROPIC_API_KEY not set — instructions ignored, shipping defaults');
    return {};
  }

  const transcriptBlock = input.transcript_chunks
    .map((c, idx) => `[${idx}] ${c.start.toFixed(1)}s–${c.end.toFixed(1)}s: ${c.text}`)
    .join('\n');

  const userPrompt = `Creator's instructions: "${input.instructions}"

Video duration: ${input.duration_sec.toFixed(1)}s

Transcript (timestamped):
${transcriptBlock}

Return JSON in this exact shape (every key OPTIONAL — include only what was asked for):
{
  "cut_ranges": [{ "start_sec": <number>, "end_sec": <number>, "reason": "<short label>" }],
  "jump_cuts": <boolean>,
  "punch_ins": <boolean>,
  "broll": <boolean>,
  "broll_query": "<search subject>",
  "music": <boolean>,
  "music_vibe": "<hype|calm|real|funny|sad>",
  "caption_style": "<bold_yellow|subtle_white|mrbeast_big|slow_reader|karaoke>",
  "max_duration_sec": <number>,
  "notes": "<one sentence>"
}`;

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      // Deterministic mapping, not creative writing — same instructions
      // should always produce the same edit plan.
      temperature: 0,
      system: ENGINE_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = resp.content.find((c) => c.type === 'text');
    const raw = text && text.type === 'text' ? text.text : '';
    const parsed = extractJSON<Record<string, unknown>>(raw);
    return sanitize(parsed, input.duration_sec);
  } catch (e) {
    // Non-fatal by contract — a parse hiccup must never block the render.
    console.warn('[instruction-engine] parse failed (shipping defaults):', e instanceof Error ? e.message : e);
    return {};
  }
}

/**
 * Defensive pass over the model output: drop malformed keys instead of
 * letting a hallucinated value (negative timestamps, unknown caption style)
 * reach the ffmpeg spec. Silent-drop is correct here — worst case the
 * creator gets the default edit, never a broken one.
 */
function sanitize(raw: Record<string, unknown>, durationSec: number): ParsedEditInstructions {
  const out: ParsedEditInstructions = {};

  if (Array.isArray(raw.cut_ranges)) {
    const ranges: InstructionCutRange[] = [];
    for (const r of raw.cut_ranges as Array<Record<string, unknown>>) {
      const start = Number(r?.start_sec);
      const end = Number(r?.end_sec);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const cs = Math.max(0, start);
      const ce = Math.min(durationSec > 0 ? durationSec : end, end);
      if (ce - cs < 0.2) continue; // sub-frame "cuts" are noise
      ranges.push({ start_sec: cs, end_sec: ce, reason: String(r?.reason || 'requested cut').slice(0, 120) });
    }
    if (ranges.length) out.cut_ranges = ranges;
  }

  if (typeof raw.jump_cuts === 'boolean') out.jump_cuts = raw.jump_cuts;
  if (typeof raw.punch_ins === 'boolean') out.punch_ins = raw.punch_ins;
  if (typeof raw.broll === 'boolean') out.broll = raw.broll;
  if (typeof raw.music === 'boolean') out.music = raw.music;

  if (typeof raw.broll_query === 'string' && raw.broll_query.trim()) {
    out.broll_query = raw.broll_query.trim().slice(0, 100);
  }
  if (typeof raw.music_vibe === 'string' && MUSIC_VIBES.has(raw.music_vibe.trim().toLowerCase())) {
    out.music_vibe = raw.music_vibe.trim().toLowerCase();
  }
  if (typeof raw.caption_style === 'string' && CAPTION_STYLES.has(raw.caption_style.trim().toLowerCase())) {
    out.caption_style = raw.caption_style.trim().toLowerCase() as ParsedEditInstructions['caption_style'];
  }

  const maxDur = Number(raw.max_duration_sec);
  // Floor of 3s: anything shorter is either a model misread or unrenderable.
  if (Number.isFinite(maxDur) && maxDur >= 3) out.max_duration_sec = maxDur;

  if (typeof raw.notes === 'string' && raw.notes.trim()) out.notes = raw.notes.trim().slice(0, 300);

  return out;
}

// Same fence-then-balanced-scan extraction the hook ranker uses — the model
// occasionally wraps JSON in ```json fences despite the "no prose" rule.
function extractJSON<T>(text: string): T {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed) as T; } catch { /* fall through */ }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]) as T; } catch { /* continue */ }
  }
  const startIdx = trimmed.search(/[{[]/);
  if (startIdx === -1) throw new Error(`No JSON in: ${trimmed.slice(0, 200)}`);
  const open = trimmed[startIdx];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(trimmed.slice(startIdx, i + 1)) as T;
    }
  }
  throw new Error(`Unterminated JSON in: ${trimmed.slice(0, 200)}`);
}
