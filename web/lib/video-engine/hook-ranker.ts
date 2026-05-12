/**
 * Hook ranker — scores transcript segments 0-10 for emotional pull, hook strength,
 * and viral potential, weighted by the user's brand voice profile.
 *
 * Beats Opus Clip's "virality score" because the lens is YOUR voice — what would
 * land for YOUR audience, not a generic curve. Brandon's "all videos need to be
 * felt" rule means we score for feeling first, virality second.
 *
 * Output drives clip selection: pick the top N segments (where N = target_clip_count).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { TranscriptSegment } from './types';

interface RankerInput {
  segments: TranscriptSegment[];
  target_count: number;
  describe: string;              // user's natural-language prompt from /create
  vibe: string;                  // hype | calm | real | funny | sad | <custom>
  brand_profile?: {
    name: string;
    tone_descriptor: string | null;
    prohibited_phrases?: string | null;
    preferred_phrases?: string | null;
    sample_posts?: string[];
  } | null;
  /** Min/max output clip duration in seconds. */
  min_duration?: number;
  max_duration?: number;
}

export interface RankedClip {
  /** Indices in the input segments[] that this clip spans (inclusive). */
  segment_start_idx: number;
  segment_end_idx: number;
  /** Cut points in seconds from start of source. */
  start_sec: number;
  end_sec: number;
  /** 0-10 feel score. >= 7 = ship, 4-6 = maybe, <4 = skip. */
  hook_score: number;
  /** One-line diagnosis of WHY this scored where it did. */
  feel_diagnosis: string;
  /** Suggested title/caption for the clip. */
  suggested_title?: string;
  /** Raw concatenated text of the clip. */
  text: string;
}

const RANKER_SYSTEM = `You are a senior short-form video editor with 10+ years of experience picking the moments in long videos that actually go viral. You are evaluating segments from a transcript and selecting the best clips.

Your bar:
1. EMOTIONAL PULL — does this segment make a viewer FEEL something in the first 2 seconds? Surprise, recognition, intrigue, laughter, hurt, hope. If the segment doesn't generate emotion in the opening, skip it.
2. STANDS ALONE — can someone scrolling who has zero context understand what's happening? If they need backstory, skip it.
3. HOOK STRENGTH — does the first 2 seconds make them stop scrolling? Strong: shocking statement, specific number, named conflict, "you won't believe", contrarian take. Weak: throat-clearing, "so anyway", "as I was saying".
4. PAYOFF — does the segment land on something? A reveal, a punchline, a turn, a takeaway. Segments that just trail off score lower.
5. BRAND FIT — does this match the human's actual voice and what their audience expects? Use the brand profile context.

You output JSON with strict schema. No prose around it.`;

export async function rankClips(input: RankerInput): Promise<RankedClip[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: return top N segments by length, no scoring
    return fallbackRank(input);
  }

  const minDur = input.min_duration ?? 8;
  const maxDur = input.max_duration ?? 60;

  // Build context block
  let brandContext = '';
  if (input.brand_profile) {
    const bp = input.brand_profile;
    brandContext = `\n## Brand voice profile\n`;
    brandContext += `Name: ${bp.name}\n`;
    if (bp.tone_descriptor) brandContext += `Tone: ${bp.tone_descriptor}\n`;
    if (bp.prohibited_phrases) brandContext += `Avoid phrases: ${bp.prohibited_phrases}\n`;
    if (bp.preferred_phrases) brandContext += `Lean into phrases: ${bp.preferred_phrases}\n`;
    if (bp.sample_posts?.length) {
      brandContext += `Reference posts in this voice:\n`;
      bp.sample_posts.slice(0, 3).forEach((p, i) => {
        brandContext += `${i + 1}. ${p.slice(0, 200)}\n`;
      });
    }
  }

  const transcriptBlock = input.segments
    .map((s, idx) => `[${idx}] ${s.start.toFixed(1)}s–${s.end.toFixed(1)}s: ${s.text}`)
    .join('\n');

  const userPrompt = `Pick the top ${input.target_count} clips from this transcript.

User's request: "${input.describe || '(no specific request)'}"
Vibe: ${input.vibe}
${brandContext}

Clip duration constraints: ${minDur}s minimum, ${maxDur}s maximum. Pick consecutive segments that together fit this range.

Transcript:
${transcriptBlock}

Return JSON in this exact shape:
{
  "clips": [
    {
      "segment_start_idx": <number>,
      "segment_end_idx": <number>,
      "hook_score": <0-10 number>,
      "feel_diagnosis": "<one sentence explaining why this scored here>",
      "suggested_title": "<6-10 word punchy title>"
    }
  ]
}

Score honestly. A 6 means "ok but not memorable". A 9 means "this will get shared". Don't grade-inflate.`;

  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    temperature: 0.4,
    system: RANKER_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = resp.content.find((c) => c.type === 'text');
  const raw = text && text.type === 'text' ? text.text : '';
  const parsed = extractJSON<{ clips: Array<{
    segment_start_idx: number;
    segment_end_idx: number;
    hook_score: number;
    feel_diagnosis: string;
    suggested_title?: string;
  }> }>(raw);

  return parsed.clips.map((c) => {
    const startSeg = input.segments[c.segment_start_idx];
    const endSeg = input.segments[c.segment_end_idx];
    if (!startSeg || !endSeg) {
      throw new Error(`Invalid segment indices ${c.segment_start_idx}-${c.segment_end_idx}`);
    }
    const text = input.segments
      .slice(c.segment_start_idx, c.segment_end_idx + 1)
      .map((s) => s.text)
      .join(' ');
    return {
      segment_start_idx: c.segment_start_idx,
      segment_end_idx: c.segment_end_idx,
      start_sec: startSeg.start,
      end_sec: endSeg.end,
      hook_score: Math.max(0, Math.min(10, c.hook_score)),
      feel_diagnosis: c.feel_diagnosis,
      suggested_title: c.suggested_title,
      text,
    };
  });
}

/**
 * Deterministic fallback when Anthropic is unavailable.
 * Picks N evenly-spaced clips of ~25 seconds each.
 */
function fallbackRank(input: RankerInput): RankedClip[] {
  const clips: RankedClip[] = [];
  if (input.segments.length === 0) return clips;

  const totalDur = input.segments[input.segments.length - 1].end;
  const clipDur = 25;
  const stride = totalDur / (input.target_count + 1);

  for (let i = 0; i < input.target_count; i++) {
    const target = stride * (i + 1);
    const startIdx = input.segments.findIndex((s) => s.end >= target);
    if (startIdx === -1) continue;
    let endIdx = startIdx;
    while (endIdx < input.segments.length - 1 && input.segments[endIdx].end - input.segments[startIdx].start < clipDur) {
      endIdx++;
    }
    const text = input.segments.slice(startIdx, endIdx + 1).map((s) => s.text).join(' ');
    clips.push({
      segment_start_idx: startIdx,
      segment_end_idx: endIdx,
      start_sec: input.segments[startIdx].start,
      end_sec: input.segments[endIdx].end,
      hook_score: 5,
      feel_diagnosis: 'Deterministic fallback — Anthropic unavailable for scoring.',
      text,
    });
  }
  return clips;
}

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
