/**
 * Editor Notes Generation — Claude API
 *
 * Two generators:
 *   1. generateEditorNotes()     — legacy EditorNotes (cut_suggestions, etc.)
 *   2. generateEnhancedEditorNotes() — full EditorNotesJSON (timeline, comment bait, etc.)
 *
 * The enhanced version is used by the content-item-processing worker.
 */

import { callAnthropicJSON } from '@/lib/ai/anthropic';
import type { EditorNotes } from '@/lib/content-items/types';
import {
  type EditorNotesJSON,
  safeValidateEditorNotesJSON,
  editorNotesToMarkdown,
} from '@/lib/content-items/editor-notes-schema';

// ─────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────

export interface EditorNotesInput {
  transcript: string;
  timestamps?: Array<{ start: number; end: number; text: string }>;
  originalScript?: string;
  correlationId?: string;
}

export interface EnhancedEditorNotesInput extends EditorNotesInput {
  /** Brief context for persona-aware notes */
  persona?: string;
  niche?: string;
  productName?: string;
  brandName?: string;
  cowTier?: 'safe' | 'edgy' | 'unhinged';
  durationSeconds?: number;
}

export interface EnhancedEditorNotesResult {
  json: EditorNotesJSON;
  markdown: string;
}

// ─────────────────────────────────────────────────────
// Legacy generator (unchanged, used by intake worker)
// ─────────────────────────────────────────────────────

const LEGACY_SYSTEM_PROMPT = `You are a professional video editor analyzing raw footage transcripts.
Generate structured editing suggestions as JSON matching the EditorNotes schema EXACTLY.

Schema:
{
  "cut_suggestions": [{ "start_ts": "MM:SS", "end_ts": "MM:SS", "reason": "string" }],
  "pause_removals": [{ "start_ts": "MM:SS", "end_ts": "MM:SS" }],
  "mistake_removals": [{ "start_ts": "MM:SS", "end_ts": "MM:SS", "note": "string" }],
  "jump_cut_opportunities": [{ "ts": "MM:SS", "suggestion": "string" }],
  "broll_suggestions": [{ "start_ts": "MM:SS", "end_ts": "MM:SS", "broll_idea": "string" }],
  "on_screen_text_timing": [{ "ts": "MM:SS", "text": "string", "duration_s": number }],
  "editing_style": "string describing recommended editing style",
  "overall_notes": "string with general editing guidance"
}

Guidelines:
- Identify long pauses, filler words ("um", "uh"), false starts, and mistakes
- Suggest jump cuts to tighten pacing
- Recommend B-roll insertions for visual variety
- Suggest on-screen text for key claims or stats mentioned
- If an original script is provided, compare to identify deviations and suggest cuts to match
- Use MM:SS timestamp format
- Return ONLY valid JSON`;

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function buildLegacyPrompt(input: EditorNotesInput): string {
  const parts: string[] = ['Analyze this video transcript and generate editor notes.\n'];

  if (input.timestamps?.length) {
    parts.push('TIMESTAMPED TRANSCRIPT:');
    for (const seg of input.timestamps) {
      parts.push(`[${formatTimestamp(seg.start)} - ${formatTimestamp(seg.end)}] ${seg.text}`);
    }
  } else {
    parts.push('TRANSCRIPT (no timestamps):');
    parts.push(input.transcript);
  }

  if (input.originalScript) {
    parts.push('\nORIGINAL SCRIPT (what was planned):');
    parts.push(input.originalScript);
    parts.push('\nCompare the transcript to the original script. Note deviations and suggest cuts to tighten.');
  }

  parts.push('\nReturn ONLY valid JSON matching the EditorNotes schema.');
  return parts.join('\n');
}

export async function generateEditorNotes(
  input: EditorNotesInput,
): Promise<EditorNotes> {
  const { parsed } = await callAnthropicJSON<EditorNotes>(
    buildLegacyPrompt(input),
    {
      systemPrompt: LEGACY_SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.5,
      correlationId: input.correlationId,
      requestType: 'editor_notes',
      agentId: 'editor-notes-gen',
    },
  );

  return {
    cut_suggestions: parsed.cut_suggestions || [],
    pause_removals: parsed.pause_removals || [],
    mistake_removals: parsed.mistake_removals || [],
    jump_cut_opportunities: parsed.jump_cut_opportunities || [],
    broll_suggestions: parsed.broll_suggestions || [],
    on_screen_text_timing: parsed.on_screen_text_timing || [],
    editing_style: parsed.editing_style || '',
    overall_notes: parsed.overall_notes || '',
  };
}

// ─────────────────────────────────────────────────────
// Enhanced generator (new — used by content-item-processing)
// ─────────────────────────────────────────────────────

const ENHANCED_SYSTEM_PROMPT = `You are FlashFlow Editor Assistant — an expert video editor AI.
You analyze raw footage transcripts and generate structured, actionable editor notes.

Return ONLY a valid JSON object matching this EXACT schema (no markdown fences):

{
  "summary": "1-2 sentence summary of the content",
  "editing_style": {
    "pace": "fast"|"medium"|"slow",
    "jump_cut_recommendation": "guidance on jump cut frequency and style",
    "music_sfx_notes": "music/sound effect recommendations"
  },
  "timeline": [
    {
      "start_sec": 0,
      "end_sec": 15,
      "label": "keep"|"cut"|"tighten"|"broll"|"text"|"retake",
      "note": "what to do with this segment",
      "broll": "b-roll suggestion or null",
      "on_screen_text": "text overlay or null"
    }
  ],
  "mistakes_retakes": [
    { "at_sec": 45, "issue": "stumbled on word", "fix": "cut and use take from 1:02" }
  ],
  "broll_pack": [
    { "at_sec": 30, "type": "product"|"lifestyle"|"meme"|"screen"|"stock", "prompt": "description of b-roll needed" }
  ],
  "caption": {
    "primary": "main caption for the post",
    "alt": "alternative caption variant"
  },
  "hashtags": ["#hashtag1", "#hashtag2"],
  "cta": { "at_sec": 120, "line": "call to action line" },
  "comment_bait": {
    "safe": ["safe comment bait ideas"],
    "spicy": ["edgier comment bait to spark debate"],
    "chaotic": ["wild/funny comment bait for max engagement"]
  }
}

Rules:
- All timestamps are in SECONDS (numbers, not strings)
- Timeline should cover the full video with reasonable segments (5-30 sec each)
- Identify: cut points, retakes/mistakes, pacing issues, on-screen text opportunities, b-roll insertions
- Hook strength: assess the first 3-5 seconds critically. Suggest improvements if weak.
- CTA: recommend optimal placement timing
- hashtags: provide exactly 5-12 relevant hashtags
- comment_bait: provide at least 2 per tier (safe, spicy, chaotic). Make them genuinely engaging, not generic.
- If persona/niche context is provided, tailor all suggestions to that audience
- Return ONLY valid JSON, no markdown wrapping`;

function buildEnhancedPrompt(input: EnhancedEditorNotesInput): string {
  const parts: string[] = [];

  // Context
  if (input.persona || input.niche || input.productName || input.brandName) {
    parts.push('CONTENT CONTEXT:');
    if (input.brandName) parts.push(`Brand: ${input.brandName}`);
    if (input.productName) parts.push(`Product: ${input.productName}`);
    if (input.persona) parts.push(`Creator Persona: ${input.persona}`);
    if (input.niche) parts.push(`Niche: ${input.niche}`);
    if (input.cowTier) parts.push(`Purple Cow Tier: ${input.cowTier} (adjust comment bait intensity accordingly)`);
    parts.push('');
  }

  if (input.durationSeconds) {
    parts.push(`Total Duration: ${formatTimestamp(input.durationSeconds)} (${input.durationSeconds}s)\n`);
  }

  // Transcript
  if (input.timestamps?.length) {
    parts.push('TIMESTAMPED TRANSCRIPT:');
    for (const seg of input.timestamps) {
      parts.push(`[${formatTimestamp(seg.start)} - ${formatTimestamp(seg.end)}] ${seg.text}`);
    }
  } else {
    parts.push('TRANSCRIPT (no timestamps):');
    parts.push(input.transcript.slice(0, 8000));
  }

  if (input.originalScript) {
    parts.push('\nORIGINAL SCRIPT (what was planned):');
    parts.push(input.originalScript.slice(0, 3000));
    parts.push('\nCompare recording to script. Note deviations, missed points, and ad-libs worth keeping.');
  }

  parts.push('\nGenerate comprehensive editor notes. Return ONLY valid JSON.');
  return parts.join('\n');
}

export async function generateEnhancedEditorNotes(
  input: EnhancedEditorNotesInput,
): Promise<EnhancedEditorNotesResult> {
  const { parsed: raw } = await callAnthropicJSON<EditorNotesJSON>(
    buildEnhancedPrompt(input),
    {
      systemPrompt: ENHANCED_SYSTEM_PROMPT,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 4096,
      temperature: 0.4,
      correlationId: input.correlationId,
      requestType: 'enhanced_editor_notes',
      agentId: 'editor-notes-enhanced',
    },
  );

  // Validate with zod
  const validation = safeValidateEditorNotesJSON(raw);
  if (!validation.ok) {
    // Try to salvage by coercing common issues
    const coerced = coerceEditorNotes(raw);
    const retry = safeValidateEditorNotesJSON(coerced);
    if (!retry.ok) {
      throw new Error(`Editor notes schema validation failed: ${validation.error}`);
    }
    const markdown = editorNotesToMarkdown(retry.data!);
    return { json: retry.data!, markdown };
  }

  const markdown = editorNotesToMarkdown(validation.data!);
  return { json: validation.data!, markdown };
}

/**
 * Attempt to coerce common Claude output issues into valid schema.
 */
function coerceEditorNotes(raw: Record<string, unknown>): Record<string, unknown> {
  const result = { ...raw };

  // Ensure hashtags has minimum 5
  if (Array.isArray(result.hashtags) && result.hashtags.length < 5) {
    while (result.hashtags.length < 5) {
      result.hashtags.push('#content');
    }
  }

  // Ensure comment_bait has minimum 2 per tier
  if (result.comment_bait && typeof result.comment_bait === 'object') {
    const cb = result.comment_bait as Record<string, string[]>;
    for (const tier of ['safe', 'spicy', 'chaotic']) {
      if (!Array.isArray(cb[tier])) cb[tier] = [];
      while (cb[tier].length < 2) {
        cb[tier].push(tier === 'safe' ? 'What do you think?' : tier === 'spicy' ? 'Hot take: agree or disagree?' : 'This is gonna be controversial...');
      }
    }
  }

  return result;
}
