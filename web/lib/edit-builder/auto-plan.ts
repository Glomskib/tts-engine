/**
 * AutoEdit AI brain.
 *
 * Replaces the dumb stitcher (`buildEditPlanFromClips`) with a Claude-powered
 * planner that reads each clip's analysis (hook candidates, silence ranges,
 * retention moments, extracted topics) and returns an `EditPlan` that picks
 * the best moments instead of stitching everything end-to-end.
 *
 * Strategy:
 *   1. Build a structured per-platform prompt with the analysis data.
 *   2. Call Claude (Sonnet 4.6) with strict JSON output.
 *   3. Parse + validate via `EditPlanSchema` (defense in depth — never write
 *      a malformed plan to the DB).
 *   4. Return the validated `EditPlan`.
 *
 * The function is **pure** apart from the Claude API call. All DB I/O happens
 * in the route handler that calls this. That keeps it testable and lets the
 * route fall back to the stitcher on AI failure without changing this code.
 *
 * Limitations of the first version (intentional, do not pad):
 *   - Picks segments only — does not choose music, transitions, or HD style.
 *   - Defaults captions ON because short-form viewers watch muted; can be
 *     overridden by the caller.
 *   - Single-pass generation. No revision loop. No alternates. The route's
 *     PATCH endpoint already handles user-edited plans as new versions.
 *   - Does not insert b-roll cutaways yet — would need a separate b-roll
 *     library. Today it picks from the user's own clips only.
 */
import { z } from 'zod';
import { EditPlanSchema, type EditPlan } from './types';

// ---------------------------------------------------------------------------
// Platform-aware planning. The presence of analysis data is what unlocks the
// AI plan — the platform profile shapes how it selects + orders segments.
// ---------------------------------------------------------------------------

type PlatformId =
  | 'tiktok'
  | 'reels'
  | 'youtube_shorts'
  | 'youtube_long'
  | 'facebook_reels'
  | 'unknown';

interface PlanPlatformProfile {
  label: string;
  aspectRatio: '9:16' | '1:1' | '16:9';
  defaultDurationSec: number;
  durationGuidance: string;
  selectionGuidance: string;
  pacingGuidance: string;
  hookPlacementGuidance: string;
  ctaPlacementGuidance: string;
}

const PLAN_PLATFORM_PROFILES: Record<PlatformId, PlanPlatformProfile> = {
  tiktok: {
    label: 'TikTok',
    aspectRatio: '9:16',
    defaultDurationSec: 28,
    durationGuidance: '22–35 seconds total. Aim for sub-30 unless the content demands more.',
    selectionGuidance: 'Pick the strongest hook moment for the FIRST 1–2 seconds, then 3–5 high-retention moments that pay off the hook quickly. Skip over silence ranges (>0.6s gaps in transcript_json or silence_ranges_json) and any clip segment marked low-retention. Trim filler words.',
    pacingGuidance: 'Cuts should land every 1.5–3 seconds. No segment longer than 4 seconds without a payoff moment inside it.',
    hookPlacementGuidance: 'Use the highest-scored hook_candidates_json entry as the first segment. Synthesize a hook_text overlay that reinforces (not duplicates) the spoken hook.',
    ctaPlacementGuidance: 'Final 2–3 seconds. Comments-driven CTA preferred. Generate a short cta_text overlay (≤6 words).',
  },
  reels: {
    label: 'Instagram Reels',
    aspectRatio: '9:16',
    defaultDurationSec: 24,
    durationGuidance: '18–30 seconds total. Reels rewards tighter than TikTok.',
    selectionGuidance: 'Prioritize visually polished segments. Reels viewers tolerate slightly more setup if the aesthetic is cohesive. Pick the cleanest 4–5 retention moments.',
    pacingGuidance: 'Cuts every 2–4 seconds. Smoother than TikTok. Avoid jarring jump cuts.',
    hookPlacementGuidance: 'First segment is the hook (1–2 seconds). Hook_text overlay should be visually polished, ≤8 words.',
    ctaPlacementGuidance: 'Save / share-driven CTA. cta_text overlay like "Save for later" or "Send to a friend who…".',
  },
  youtube_shorts: {
    label: 'YouTube Shorts',
    aspectRatio: '9:16',
    defaultDurationSec: 45,
    durationGuidance: '30–60 seconds. Slightly longer than TikTok — viewers tolerate setup.',
    selectionGuidance: 'Allow up to 3 seconds of setup before the hook payoff. Pick more retention moments (5–7) since YouTube watch-time matters. Prioritize segments with clear value/instruction.',
    pacingGuidance: 'Cuts every 2–4 seconds. Room for B-roll-style inserts.',
    hookPlacementGuidance: 'Hook lands in 0–3 seconds. hook_text overlay can promise a specific outcome.',
    ctaPlacementGuidance: 'Subscribe-driven CTA. cta_text like "Subscribe for more" or "Comment X for part 2".',
  },
  youtube_long: {
    label: 'YouTube long-form',
    aspectRatio: '16:9',
    defaultDurationSec: 480, // 8 min default
    durationGuidance: '5–15 minutes. Pick a target_duration based on how much usable content the analysis surfaces — do not pad.',
    selectionGuidance: 'Treat clips as raw material for a long-form edit. Build 5–8 sections (chapters): cold open, intro, sections, conclusion + CTA. Pick the strongest 30–60s for cold open. Each section should have its own internal hook.',
    pacingGuidance: 'Sections of 60–120 seconds with clear transitions. Cuts within a section every 3–6 seconds. Talking-head OK for up to 8 seconds in long-form.',
    hookPlacementGuidance: 'Cold open is 30–60 seconds total. hook_text overlay teases the most surprising moment of the video.',
    ctaPlacementGuidance: 'Two CTA layers: a soft mid-roll mention (~3–5 min in) and a hard end CTA. cta_text on the end CTA only.',
  },
  facebook_reels: {
    label: 'Facebook Reels',
    aspectRatio: '9:16',
    defaultDurationSec: 30,
    durationGuidance: '20–45 seconds. Audience skews older — narrative arcs over Gen-Z chaos.',
    selectionGuidance: 'Prioritize segments with clear setup → payoff structure. Avoid jump-scare or trend-only moments. Strong narrative.',
    pacingGuidance: 'Cuts every 3–5 seconds. Slower than TikTok.',
    hookPlacementGuidance: 'First 2–3 seconds with a relatable real-life situation hook. hook_text overlay clear and friendly.',
    ctaPlacementGuidance: 'Share-driven CTA. cta_text like "Share with a friend who needs to see this".',
  },
  unknown: {
    label: 'Generic short-form',
    aspectRatio: '9:16',
    defaultDurationSec: 28,
    durationGuidance: '20–35 seconds.',
    selectionGuidance: 'Pick the strongest hook + 3–5 retention moments. Skip silence and filler.',
    pacingGuidance: 'Cuts every 2–3 seconds.',
    hookPlacementGuidance: 'Hook lands in 0–2 seconds.',
    ctaPlacementGuidance: 'Generic CTA in final 2–3 seconds.',
  },
};

function resolvePlatform(rawPlatform: string | null | undefined): PlatformId {
  if (!rawPlatform) return 'unknown';
  const norm = rawPlatform.toLowerCase().replace(/[\s-]/g, '_');
  if (norm.includes('tiktok')) return 'tiktok';
  if (norm.includes('reel') && norm.includes('facebook')) return 'facebook_reels';
  if (norm.includes('reel') || norm.includes('instagram')) return 'reels';
  if (norm.includes('shorts')) return 'youtube_shorts';
  if (norm.includes('youtube_long') || norm === 'youtube') return 'youtube_long';
  if (norm.includes('facebook')) return 'facebook_reels';
  if (norm in PLAN_PLATFORM_PROFILES) return norm as PlatformId;
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Input shape — exactly what the route loads from edit_source_clips +
// edit_analysis.
// ---------------------------------------------------------------------------

export interface ClipWithAnalysis {
  id: string;
  duration_ms: number | null;
  sort_order: number;
  /** Word/phrase-level transcript with timestamps; structure varies by source. */
  transcript_json?: unknown;
  /** Array of detected hook candidates with start/end ms + score. */
  hook_candidates_json?: Array<{
    start_ms?: number;
    end_ms?: number;
    score?: number;
    text?: string;
  }>;
  /** Silence ranges in ms — segments to SKIP. */
  silence_ranges_json?: Array<{ start_ms: number; end_ms: number }>;
  /** Retention moments — high-value segments to KEEP. */
  retention_moments_json?: Array<{
    start_ms: number;
    end_ms: number;
    score?: number;
    reason?: string;
  }>;
  /** Topics extracted from this clip. */
  extracted_topics_json?: string[];
}

export interface BuildAIEditPlanOptions {
  projectId: string;
  clips: ClipWithAnalysis[];
  /** From edit_projects.target_platform. */
  targetPlatform?: string;
  /** From edit_projects.aspect_ratio. Overrides platform default if present. */
  aspectRatio?: '9:16' | '1:1' | '16:9';
  /** Optional explicit duration. Falls back to platform default. */
  durationTargetSec?: number;
  /** Anthropic API key. Pass from the route to avoid coupling this module to env. */
  anthropicApiKey: string;
  /** Override the model. Defaults to claude-sonnet-4-6 for plan quality. */
  model?: string;
  /** Abort signal for timeouts. */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Claude response schema — what we expect back. Smaller than EditPlanSchema
// because the model returns segment indices keyed against our input clips,
// and we hydrate clipId on our side.
// ---------------------------------------------------------------------------

const AIPlanSegmentSchema = z.object({
  clipId: z.string().uuid(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  reason: z.string().optional(),
  emphasis: z.enum(['hook', 'proof', 'cta', 'broll']).optional(),
});

const AIPlanResponseSchema = z.object({
  segments: z.array(AIPlanSegmentSchema).min(1).max(64),
  hookText: z.string().max(200).optional(),
  ctaText: z.string().max(200).optional(),
  durationTargetSec: z.number().int().positive().optional(),
  reasoning: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Build an AI-driven EditPlan. Throws on failure — the caller should catch
 * and fall back to the stitcher (`buildEditPlanFromClips`).
 */
export async function buildAIEditPlan(opts: BuildAIEditPlanOptions): Promise<EditPlan> {
  if (opts.clips.length === 0) {
    throw new Error('AutoEdit: cannot generate plan with zero clips');
  }
  if (!opts.anthropicApiKey) {
    throw new Error('AutoEdit: missing anthropicApiKey');
  }

  const platform = resolvePlatform(opts.targetPlatform);
  const profile = PLAN_PLATFORM_PROFILES[platform];
  const aspectRatio = opts.aspectRatio ?? profile.aspectRatio;
  const targetSec = opts.durationTargetSec ?? profile.defaultDurationSec;

  // Compact the clip+analysis bundle into a structured prompt input. Keep this
  // tight — large clip libraries can blow context if we dump everything raw.
  const clipsBlock = opts.clips
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c, idx) => {
      const lines: string[] = [];
      lines.push(`### CLIP ${idx + 1}`);
      lines.push(`clipId: ${c.id}`);
      lines.push(`durationMs: ${c.duration_ms ?? 'unknown'}`);
      if (c.extracted_topics_json && c.extracted_topics_json.length > 0) {
        lines.push(`topics: ${c.extracted_topics_json.slice(0, 8).join(', ')}`);
      }
      if (c.hook_candidates_json && c.hook_candidates_json.length > 0) {
        const hooks = c.hook_candidates_json
          .slice(0, 6)
          .map((h, hi) => {
            const range = `${h.start_ms ?? '?'}–${h.end_ms ?? '?'}ms`;
            const score = typeof h.score === 'number' ? ` score=${h.score.toFixed(2)}` : '';
            const text = h.text ? ` text="${truncate(h.text, 120)}"` : '';
            return `  hook[${hi}]: ${range}${score}${text}`;
          })
          .join('\n');
        lines.push('HOOK CANDIDATES (sorted by score, best first):\n' + hooks);
      }
      if (c.retention_moments_json && c.retention_moments_json.length > 0) {
        const moments = c.retention_moments_json
          .slice(0, 8)
          .map((m, mi) => {
            const score = typeof m.score === 'number' ? ` score=${m.score.toFixed(2)}` : '';
            const reason = m.reason ? ` reason="${truncate(m.reason, 80)}"` : '';
            return `  moment[${mi}]: ${m.start_ms}–${m.end_ms}ms${score}${reason}`;
          })
          .join('\n');
        lines.push('RETENTION MOMENTS (high-value spans worth keeping):\n' + moments);
      }
      if (c.silence_ranges_json && c.silence_ranges_json.length > 0) {
        const silence = c.silence_ranges_json
          .slice(0, 8)
          .map((s, si) => `  skip[${si}]: ${s.start_ms}–${s.end_ms}ms`)
          .join('\n');
        lines.push('SKIP THESE RANGES (silence / dead air):\n' + silence);
      }
      return lines.join('\n');
    })
    .join('\n\n');

  const prompt = `You are an elite short-form video editor. Your job is to read the analysis of one or more raw video clips and produce a structured EDIT PLAN: which timestamp ranges to use, in what order, with hook + CTA overlays, optimized for the target platform.

DO NOT stitch full clips together. Pick the strongest moments only. Skip silence and filler. Lead with the hook. End with a CTA.

=== TARGET PLATFORM ===
Platform: ${profile.label}
Aspect ratio: ${aspectRatio}
Target duration: ~${targetSec} seconds (${profile.durationGuidance})

Selection rules: ${profile.selectionGuidance}
Pacing: ${profile.pacingGuidance}
Hook placement: ${profile.hookPlacementGuidance}
CTA placement: ${profile.ctaPlacementGuidance}

=== CLIPS WITH ANALYSIS ===
${clipsBlock}

=== TASK ===
Return a single JSON object — NO PROSE, NO MARKDOWN — with exactly this shape:

{
  "reasoning": "1–2 sentences explaining your selection strategy for this video.",
  "durationTargetSec": <integer total duration of the final cut>,
  "hookText": "<short on-screen overlay text shown during the first segment, ≤80 chars>",
  "ctaText": "<short on-screen overlay text shown during the final segment, ≤80 chars>",
  "segments": [
    {
      "clipId": "<one of the clipId values from the CLIPS block above>",
      "startMs": <inclusive start timestamp inside the clip, integer>,
      "endMs": <exclusive end timestamp inside the clip, integer>,
      "emphasis": "hook" | "proof" | "cta" | "broll",
      "reason": "1 sentence on why this span made the cut"
    }
    // ... 3–8 segments for short-form, 5–8 sections for youtube_long
  ]
}

HARD CONSTRAINTS:
- Every clipId in your segments MUST exactly match a clipId from the CLIPS block. Do not invent IDs.
- Every (startMs, endMs) range must be inside the source clip's duration. Do not extrapolate.
- endMs must be > startMs.
- Total duration of all segments combined should be within ±20% of the target duration.
- Mark the FIRST segment with emphasis="hook".
- Mark the LAST segment with emphasis="cta".
- Skip ranges in the SKIP list — never include them in any segment.
- Output valid JSON only. No markdown fences. No commentary.
`;

  // Direct Anthropic call — same pattern as /api/public/generate-script.
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model ?? 'claude-sonnet-4-6',
      max_tokens: 2400,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AutoEdit: Claude returned ${res.status}: ${truncate(text, 400)}`);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text: string }> };
  const raw = data.content?.find((b) => b.type === 'text')?.text;
  if (!raw) throw new Error('AutoEdit: empty response from Claude');

  // Claude sometimes wraps JSON in markdown fences despite our instruction.
  // Strip defensively before parsing.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`AutoEdit: response was not valid JSON. First 200 chars: ${truncate(cleaned, 200)}`);
  }

  const aiResult = AIPlanResponseSchema.safeParse(parsed);
  if (!aiResult.success) {
    throw new Error(`AutoEdit: response failed schema validation: ${aiResult.error.issues.map((i) => i.message).slice(0, 3).join('; ')}`);
  }

  // Hydrate into the canonical EditPlan shape. The schema validation here is
  // defense-in-depth — the route also re-validates before write.
  const validClipIds = new Set(opts.clips.map((c) => c.id));
  const safeSegments = aiResult.data.segments.filter((s) => validClipIds.has(s.clipId));
  if (safeSegments.length === 0) {
    throw new Error('AutoEdit: AI returned 0 segments matching real clip IDs');
  }

  // Extract subtitleText per segment from each clip's transcript. Doing this
  // programmatically (rather than asking the AI to retype the transcript)
  // avoids hallucinated captions and keeps the source-of-truth in
  // edit_analysis.transcript_json. The worker burns these in via ASS.
  const clipById = new Map(opts.clips.map((c) => [c.id, c]));

  const plan: EditPlan = {
    projectId: opts.projectId,
    aspectRatio,
    durationTargetSec: aiResult.data.durationTargetSec ?? targetSec,
    hookText: aiResult.data.hookText,
    captions: { enabled: true, stylePreset: 'default', position: 'bottom', highlightKeywords: true },
    segments: safeSegments.map((s) => {
      const clip = clipById.get(s.clipId);
      const subtitleText = clip ? extractCaptionForSpan(clip.transcript_json, s.startMs, s.endMs) : undefined;
      return {
        clipId: s.clipId,
        startMs: s.startMs,
        endMs: s.endMs,
        emphasis: s.emphasis ?? 'proof',
        ...(subtitleText ? { subtitleText } : {}),
      };
    }),
    overlays: [
      ...(aiResult.data.hookText
        ? [{
            type: 'hook_text' as const,
            text: aiResult.data.hookText,
            startMs: 0,
            endMs: Math.min(2500, Math.max(1500, safeSegments[0]?.endMs - safeSegments[0]?.startMs || 2000)),
            stylePreset: 'default',
          }]
        : []),
      ...(aiResult.data.ctaText
        ? [{
            type: 'cta_text' as const,
            text: aiResult.data.ctaText,
            // CTA overlay timing is computed on the worker side relative to
            // total output duration — using safe defaults here that the
            // worker can refine.
            startMs: 0,
            endMs: 3000,
            stylePreset: 'default',
          }]
        : []),
    ],
  };

  // Final canonical-schema validation — never write a plan that fails this.
  const final = EditPlanSchema.safeParse(plan);
  if (!final.success) {
    throw new Error(`AutoEdit: final plan failed canonical schema: ${final.error.issues.map((i) => i.message).slice(0, 3).join('; ')}`);
  }
  return final.data;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

/**
 * Convenience: returns true when ALL clips have analysis_status='done'.
 * The route uses this to decide between AI plan and stitcher fallback.
 */
export function clipsHaveCompleteAnalysis(
  clips: Array<{ analysis_status?: string }>,
): boolean {
  if (clips.length === 0) return false;
  return clips.every((c) => c.analysis_status === 'done');
}

/**
 * Extract caption text for an output segment by slicing the transcript
 * words that fall within [startMs, endMs] of the source clip.
 *
 * Supported transcript_json shapes (we accept any of these — different
 * STT providers return different formats):
 *   { words: [{ word, start_ms, end_ms }, ...] }
 *   { words: [{ text, start, end }, ...] }   (start/end in seconds)
 *   { segments: [{ start, end, text }, ...] }
 *
 * Returns undefined when no words match (caller skips captions for that segment).
 * Caps caption length at 240 chars to avoid wrapping disasters in the burn-in.
 */
function extractCaptionForSpan(
  transcript: unknown,
  startMs: number,
  endMs: number,
): string | undefined {
  if (!transcript || typeof transcript !== 'object') return undefined;
  const t = transcript as Record<string, unknown>;

  // Shape 1: { words: [...] } — most common from gpt-4o-transcribe + others
  const words = Array.isArray(t.words) ? (t.words as Array<Record<string, unknown>>) : null;
  if (words && words.length > 0) {
    const collected: string[] = [];
    for (const w of words) {
      const startRaw = (w.start_ms ?? w.startMs ?? w.start) as number | undefined;
      const endRaw = (w.end_ms ?? w.endMs ?? w.end) as number | undefined;
      if (typeof startRaw !== 'number') continue;
      // If the value looks like seconds (< 1000 for a minute-long clip is common),
      // promote to ms. Heuristic: if both start and end are < 600, treat as seconds.
      const isSeconds = startRaw < 600 && (typeof endRaw !== 'number' || endRaw < 600);
      const wStart = isSeconds ? Math.round(startRaw * 1000) : Math.round(startRaw);
      const wEnd = typeof endRaw === 'number'
        ? (isSeconds ? Math.round(endRaw * 1000) : Math.round(endRaw))
        : wStart + 200;
      // Include word if its midpoint falls inside the span (captures words
      // that straddle the boundary).
      const mid = (wStart + wEnd) / 2;
      if (mid >= startMs && mid <= endMs) {
        const text = (w.word ?? w.text) as string | undefined;
        if (text) collected.push(text);
      }
    }
    if (collected.length === 0) return undefined;
    return truncate(collected.join(' ').replace(/\s+/g, ' ').trim(), 240) || undefined;
  }

  // Shape 2: { segments: [{ start, end, text }, ...] } — Whisper-style
  const segs = Array.isArray(t.segments) ? (t.segments as Array<Record<string, unknown>>) : null;
  if (segs && segs.length > 0) {
    const collected: string[] = [];
    for (const s of segs) {
      const sStart = typeof s.start === 'number' ? Math.round(s.start * 1000) : null;
      const sEnd = typeof s.end === 'number' ? Math.round(s.end * 1000) : null;
      const text = s.text as string | undefined;
      if (sStart === null || sEnd === null || !text) continue;
      // Overlap check
      if (sEnd >= startMs && sStart <= endMs) {
        collected.push(text);
      }
    }
    if (collected.length === 0) return undefined;
    return truncate(collected.join(' ').replace(/\s+/g, ' ').trim(), 240) || undefined;
  }

  return undefined;
}
