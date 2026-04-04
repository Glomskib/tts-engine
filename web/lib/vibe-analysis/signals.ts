/**
 * Video Vibe Analysis — Signal Extraction
 *
 * Pure heuristic functions that extract timing, pacing,
 * and rhythm signals from transcript segments.
 * No AI calls — fast, deterministic, testable.
 */

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface PacingSignals {
  /** Words per minute overall */
  words_per_minute: number;
  /** Average gap between segments in seconds */
  avg_pause_length: number;
  /** Number of pauses > 0.5s per minute */
  pause_frequency: number;
  /** Words in first 3 seconds */
  first_3s_word_count: number;
  /** Words in the first segment (hook) */
  hook_word_count: number;
  /** Total word count */
  total_word_count: number;
  /** Total segments */
  segment_count: number;
  /** Duration in seconds */
  duration_seconds: number;
  /** Speaking rate in first third vs last third */
  pace_acceleration: 'accelerating' | 'decelerating' | 'steady';
  /** Longest pause location as fraction of total duration (0-1) */
  longest_pause_position: number;
  /** Longest pause duration in seconds */
  longest_pause_duration: number;
}

export interface VisualSignals {
  /** Estimated number of visual cuts based on frame differences */
  estimated_cuts: number;
  /** Cuts per second in first 3 seconds */
  first_3s_cuts: number;
  /** Overall cuts per second */
  cuts_per_second: number;
}

/**
 * Extract pacing signals from Whisper transcript segments.
 */
export function extractPacingSignals(
  segments: TranscriptSegment[],
  duration: number,
): PacingSignals {
  if (segments.length === 0 || duration <= 0) {
    return {
      words_per_minute: 0,
      avg_pause_length: 0,
      pause_frequency: 0,
      first_3s_word_count: 0,
      hook_word_count: 0,
      total_word_count: 0,
      segment_count: 0,
      duration_seconds: duration,
      pace_acceleration: 'steady',
      longest_pause_position: 0,
      longest_pause_duration: 0,
    };
  }

  // Word counts
  const totalWords = segments.reduce(
    (sum, s) => sum + s.text.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  const durationMinutes = duration / 60;
  const wpm = durationMinutes > 0 ? totalWords / durationMinutes : 0;

  // First 3 seconds
  const first3sWords = segments
    .filter((s) => s.start < 3)
    .reduce((sum, s) => {
      const words = s.text.trim().split(/\s+/).filter(Boolean);
      // If segment spans past 3s, estimate fraction
      if (s.end > 3 && s.start < 3) {
        const fraction = (3 - s.start) / (s.end - s.start);
        return sum + Math.round(words.length * fraction);
      }
      return sum + words.length;
    }, 0);

  // Hook word count (first segment)
  const hookWords = segments[0].text.trim().split(/\s+/).filter(Boolean).length;

  // Pause analysis
  const pauses: Array<{ duration: number; position: number }> = [];
  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].start - segments[i - 1].end;
    if (gap > 0.3) {
      pauses.push({
        duration: gap,
        position: segments[i].start / duration,
      });
    }
  }

  const avgPause =
    pauses.length > 0
      ? pauses.reduce((s, p) => s + p.duration, 0) / pauses.length
      : 0;
  const pauseFreq =
    durationMinutes > 0 ? pauses.filter((p) => p.duration > 0.5).length / durationMinutes : 0;

  // Longest pause
  let longestPause = { duration: 0, position: 0 };
  for (const p of pauses) {
    if (p.duration > longestPause.duration) longestPause = p;
  }

  // Pace acceleration: compare first third vs last third WPM
  const thirdPoint = duration / 3;
  const twoThirdPoint = (duration * 2) / 3;

  const firstThirdWords = segments
    .filter((s) => s.end <= thirdPoint)
    .reduce((sum, s) => sum + s.text.trim().split(/\s+/).filter(Boolean).length, 0);
  const lastThirdWords = segments
    .filter((s) => s.start >= twoThirdPoint)
    .reduce((sum, s) => sum + s.text.trim().split(/\s+/).filter(Boolean).length, 0);

  const firstThirdWPM = thirdPoint > 0 ? (firstThirdWords / (thirdPoint / 60)) : 0;
  const lastThirdWPM = thirdPoint > 0 ? (lastThirdWords / (thirdPoint / 60)) : 0;

  let paceAcceleration: 'accelerating' | 'decelerating' | 'steady' = 'steady';
  if (firstThirdWPM > 0 && lastThirdWPM > 0) {
    const ratio = lastThirdWPM / firstThirdWPM;
    if (ratio > 1.2) paceAcceleration = 'accelerating';
    else if (ratio < 0.8) paceAcceleration = 'decelerating';
  }

  return {
    words_per_minute: Math.round(wpm),
    avg_pause_length: Math.round(avgPause * 100) / 100,
    pause_frequency: Math.round(pauseFreq * 10) / 10,
    first_3s_word_count: first3sWords,
    hook_word_count: hookWords,
    total_word_count: totalWords,
    segment_count: segments.length,
    duration_seconds: duration,
    pace_acceleration: paceAcceleration,
    longest_pause_position: Math.round(longestPause.position * 100) / 100,
    longest_pause_duration: Math.round(longestPause.duration * 100) / 100,
  };
}

/**
 * Estimate visual cuts from frame analysis.
 * Phase 1: simple estimation based on frame count and video type.
 * Phase 2 will use actual frame-diff analysis.
 */
export function estimateVisualSignals(
  frameCount: number,
  duration: number,
): VisualSignals {
  // Phase 1: rough estimation
  // We get ~4 frames from frame-extractor
  // If frames look very different, more cuts; if similar, fewer
  // For now, we estimate based on duration and let AI refine
  return {
    estimated_cuts: 0, // Will be set by AI interpretation
    first_3s_cuts: 0,
    cuts_per_second: 0,
  };
}
