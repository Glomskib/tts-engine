/**
 * Transcript Analyzer — Editing Suggestions Engine
 *
 * Analyzes a transcript to detect:
 * - Long pauses (>1.2s)
 * - Filler words
 * - B-roll insertion points (after hooks, stats, product mentions)
 * - Text overlay opportunities
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface EditingSuggestion {
  timestamp_start: number | null;
  timestamp_end: number | null;
  suggestion: string;
  type: 'cut_pause' | 'remove_mistake' | 'add_broll' | 'add_text_overlay' | 'highlight_hook';
}

const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'basically', 'literally', 'actually', 'right', 'so yeah', 'i mean'];
const STAT_PATTERNS = /\d+%|\d+x|\d+ times|\d+ people|\d+ million|\d+ thousand/i;
const PRODUCT_PATTERNS = /product|brand|item|supplement|serum|formula|ingredients?/i;

/**
 * Analyze a transcript and generate editing suggestions.
 */
export function generateSuggestions(segments: TranscriptSegment[]): EditingSuggestion[] {
  const suggestions: EditingSuggestion[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const textLower = seg.text.toLowerCase().trim();

    // Detect long pauses between segments
    if (i > 0) {
      const gap = seg.start - segments[i - 1].end;
      if (gap > 1.2) {
        suggestions.push({
          timestamp_start: segments[i - 1].end,
          timestamp_end: seg.start,
          suggestion: `Cut ${gap.toFixed(1)}s pause`,
          type: 'cut_pause',
        });
      }
    }

    // Detect filler words
    for (const filler of FILLER_WORDS) {
      if (textLower.includes(filler)) {
        suggestions.push({
          timestamp_start: seg.start,
          timestamp_end: seg.end,
          suggestion: `Remove filler: "${filler}"`,
          type: 'remove_mistake',
        });
        break; // one suggestion per segment
      }
    }

    // First segment — highlight as hook
    if (i === 0) {
      suggestions.push({
        timestamp_start: seg.start,
        timestamp_end: seg.end,
        suggestion: 'Highlight hook — add text overlay or visual emphasis',
        type: 'highlight_hook',
      });
    }

    // B-roll after stats
    if (STAT_PATTERNS.test(seg.text)) {
      suggestions.push({
        timestamp_start: seg.end,
        timestamp_end: null,
        suggestion: 'Insert B-roll to visualize stat',
        type: 'add_broll',
      });
    }

    // B-roll after product mentions
    if (PRODUCT_PATTERNS.test(seg.text)) {
      suggestions.push({
        timestamp_start: seg.end,
        timestamp_end: null,
        suggestion: 'Insert product B-roll',
        type: 'add_broll',
      });
    }

    // Text overlay for key sentences (short, punchy sentences)
    const wordCount = seg.text.trim().split(/\s+/).length;
    if (wordCount >= 3 && wordCount <= 8 && (seg.text.includes('!') || seg.text.includes('?'))) {
      suggestions.push({
        timestamp_start: seg.start,
        timestamp_end: seg.end,
        suggestion: `Add text overlay: "${seg.text.trim()}"`,
        type: 'add_text_overlay',
      });
    }
  }

  // Sort by timestamp
  suggestions.sort((a, b) => (a.timestamp_start ?? 0) - (b.timestamp_start ?? 0));

  return suggestions;
}

/**
 * Fetch transcript, analyze it, store suggestions, and return them.
 */
export async function analyzeAndStoreSuggestions(
  contentItemId: string,
  workspaceId: string,
): Promise<{ suggestions: EditingSuggestion[]; stored: number }> {
  // Fetch transcript segments from content_item_transcripts
  const { data: transcript } = await supabaseAdmin
    .from('content_item_transcripts')
    .select('segments')
    .eq('content_item_id', contentItemId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!transcript?.segments || !Array.isArray(transcript.segments)) {
    return { suggestions: [], stored: 0 };
  }

  const segments: TranscriptSegment[] = transcript.segments.map((s: Record<string, unknown>) => ({
    start: Number(s.start ?? 0),
    end: Number(s.end ?? 0),
    text: String(s.text ?? ''),
  }));

  const suggestions = generateSuggestions(segments);

  if (suggestions.length === 0) {
    return { suggestions: [], stored: 0 };
  }

  // Clear old suggestions for this content item
  await supabaseAdmin
    .from('editing_suggestions')
    .delete()
    .eq('content_item_id', contentItemId);

  // Insert new suggestions
  const rows = suggestions.map(s => ({
    content_item_id: contentItemId,
    workspace_id: workspaceId,
    timestamp_start: s.timestamp_start,
    timestamp_end: s.timestamp_end,
    suggestion: s.suggestion,
    type: s.type,
  }));

  const { data: inserted } = await supabaseAdmin
    .from('editing_suggestions')
    .insert(rows)
    .select('id');

  return { suggestions, stored: inserted?.length ?? 0 };
}
