/**
 * Editor Notes Generation — Claude API
 *
 * Analyzes transcript + original brief script to generate structured
 * editing suggestions for video editors.
 */

import { callAnthropicJSON } from '@/lib/ai/anthropic';
import type { EditorNotes } from '@/lib/content-items/types';

export interface EditorNotesInput {
  transcript: string;
  timestamps?: Array<{ start: number; end: number; text: string }>;
  originalScript?: string;
  correlationId?: string;
}

const SYSTEM_PROMPT = `You are a professional video editor analyzing raw footage transcripts.
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

function buildPrompt(input: EditorNotesInput): string {
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
    buildPrompt(input),
    {
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.5,
      correlationId: input.correlationId,
      requestType: 'editor_notes',
      agentId: 'editor-notes-gen',
    },
  );

  // Ensure all arrays exist (defensive)
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
