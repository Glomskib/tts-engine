/**
 * Overlay Clip Index — Transcript Fetcher
 *
 * Wraps the existing youtube-transcript.ts extraction to get
 * captions for clip candidates. If no transcript is available,
 * marks the candidate as needs_transcription for future passes.
 */

import { extractYouTubeCaptions } from '@/lib/youtube-transcript';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranscriptResult {
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  language: string;
  source: 'youtube';
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/**
 * Attempt to fetch YouTube captions for a video URL.
 * Returns null if captions are unavailable (caller should mark
 * needs_transcription=true on the analysis row).
 */
export async function fetchClipTranscript(
  sourceUrl: string,
): Promise<TranscriptResult | null> {
  try {
    const result = await extractYouTubeCaptions(sourceUrl);
    if (!result || !result.transcript.trim()) return null;

    return {
      text: result.transcript,
      segments: result.segments,
      language: result.language,
      source: 'youtube',
    };
  } catch (err) {
    console.warn('[clip-index/transcript] Failed for', sourceUrl, err instanceof Error ? err.message : err);
    return null;
  }
}
