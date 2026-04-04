import { describe, it, expect } from 'vitest';
import { extractPacingSignals, type TranscriptSegment } from '../signals';
import {
  classifyDeliveryFromSignals,
  classifyPacingFromSignals,
  classifyHookEnergyFromSignals,
} from '../interpret';
import type { PacingSignals } from '../signals';

// ── Helpers ──────────────────────────────────────────────

/** Build evenly-spaced segments with a given word count per segment and gap. */
function buildSegments(
  count: number,
  wordsPerSegment: number,
  segmentDuration: number,
  gapBetween: number,
  startAt = 0,
): TranscriptSegment[] {
  const word = 'word';
  const text = Array(wordsPerSegment).fill(word).join(' ');
  const segments: TranscriptSegment[] = [];
  let cursor = startAt;
  for (let i = 0; i < count; i++) {
    segments.push({ start: cursor, end: cursor + segmentDuration, text });
    cursor += segmentDuration + gapBetween;
  }
  return segments;
}

// ── extractPacingSignals ─────────────────────────────────

describe('extractPacingSignals', () => {
  it('returns zeroes for empty segments', () => {
    const result = extractPacingSignals([], 30);
    expect(result.words_per_minute).toBe(0);
    expect(result.total_word_count).toBe(0);
    expect(result.segment_count).toBe(0);
    expect(result.pace_acceleration).toBe('steady');
    expect(result.first_3s_word_count).toBe(0);
  });

  it('returns zeroes for zero duration', () => {
    const seg: TranscriptSegment[] = [{ start: 0, end: 1, text: 'hello world' }];
    const result = extractPacingSignals(seg, 0);
    expect(result.words_per_minute).toBe(0);
    expect(result.segment_count).toBe(0);
  });

  it('calculates WPM for a fast speaker', () => {
    // 20 segments, 10 words each = 200 words, 0.1s gaps, each segment 1.4s
    // Total time ~ 20 * 1.4 + 19 * 0.1 = 29.9s => use 30s duration
    const segments = buildSegments(20, 10, 1.4, 0.1);
    const result = extractPacingSignals(segments, 30);

    expect(result.total_word_count).toBe(200);
    expect(result.words_per_minute).toBe(400); // 200 / 0.5 min
    expect(result.segment_count).toBe(20);
    // Gaps of 0.1s are below 0.3s threshold, so no pauses detected
    expect(result.avg_pause_length).toBe(0);
    expect(result.pause_frequency).toBe(0);
  });

  it('calculates WPM for a slow speaker with long pauses', () => {
    // 6 segments, 5 words each = 30 words over 60s
    // Each segment 3s, gap 7s between them
    const segments = buildSegments(6, 5, 3, 7);
    const result = extractPacingSignals(segments, 60);

    expect(result.total_word_count).toBe(30);
    expect(result.words_per_minute).toBe(30); // 30 / 1 min
    expect(result.avg_pause_length).toBeGreaterThan(0);
    // All 5 gaps are 7s > 0.5s threshold
    expect(result.pause_frequency).toBe(5); // 5 pauses / 1 min
  });

  it('counts words in first 3 seconds for hook-heavy opening', () => {
    // Segment 1: 0-2s with 12 words, segment 2: 2-4s with 8 words
    const segments: TranscriptSegment[] = [
      { start: 0, end: 2, text: 'one two three four five six seven eight nine ten eleven twelve' },
      { start: 2, end: 4, text: 'alpha beta gamma delta epsilon zeta eta theta' },
      { start: 5, end: 8, text: 'later words here' },
    ];
    const result = extractPacingSignals(segments, 10);

    // First segment: fully within 3s => 12 words
    // Second segment: spans 2-4s, fraction in first 3s = (3-2)/(4-2) = 0.5 => 8 * 0.5 = 4
    expect(result.first_3s_word_count).toBe(16);
    expect(result.hook_word_count).toBe(12);
  });

  it('identifies delayed hook with few words in first 3 seconds', () => {
    const segments: TranscriptSegment[] = [
      { start: 0, end: 2, text: 'um' },
      { start: 4, end: 10, text: 'so here is what I wanted to tell you about this product' },
    ];
    const result = extractPacingSignals(segments, 10);

    expect(result.first_3s_word_count).toBe(1);
    expect(result.hook_word_count).toBe(1);
  });

  it('detects decelerating pace', () => {
    // First third (0-10s): lots of words, last third (20-30s): few words
    const segments: TranscriptSegment[] = [
      { start: 0, end: 3, text: 'one two three four five six seven eight nine ten' },
      { start: 3, end: 6, text: 'eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty' },
      { start: 6, end: 9, text: 'a b c d e f g h i j' },
      { start: 22, end: 28, text: 'slow ending here' },
    ];
    const result = extractPacingSignals(segments, 30);

    // First third (0-10s): segments at 0-3, 3-6, 6-9 all end <= 10 => 30 words
    // Last third (20-30s): segment at 22-28 => 3 words
    // Ratio = lastThirdWPM / firstThirdWPM < 0.8 => decelerating
    expect(result.pace_acceleration).toBe('decelerating');
  });

  it('detects accelerating pace', () => {
    const segments: TranscriptSegment[] = [
      { start: 0, end: 5, text: 'slow start' },
      { start: 20, end: 23, text: 'one two three four five six seven eight nine ten' },
      { start: 23, end: 26, text: 'eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty' },
      { start: 26, end: 29, text: 'more words to fill the last third with content here yes' },
    ];
    const result = extractPacingSignals(segments, 30);

    expect(result.pace_acceleration).toBe('accelerating');
  });

  it('finds the longest pause position', () => {
    const segments: TranscriptSegment[] = [
      { start: 0, end: 2, text: 'hello' },
      { start: 2.5, end: 4, text: 'small gap' },   // 0.5s gap
      { start: 8, end: 10, text: 'big gap' },       // 4s gap
      { start: 10.5, end: 12, text: 'another' },    // 0.5s gap
    ];
    const result = extractPacingSignals(segments, 15);

    expect(result.longest_pause_duration).toBe(4);
    // Position = 8 / 15 = 0.533... => rounded to 0.53
    expect(result.longest_pause_position).toBe(0.53);
  });
});

// ── classifyDeliveryFromSignals ──────────────────────────

describe('classifyDeliveryFromSignals', () => {
  function makeSignals(overrides: Partial<PacingSignals>): PacingSignals {
    return {
      words_per_minute: 140,
      avg_pause_length: 0.4,
      pause_frequency: 4,
      first_3s_word_count: 6,
      hook_word_count: 6,
      total_word_count: 100,
      segment_count: 10,
      duration_seconds: 30,
      pace_acceleration: 'steady',
      longest_pause_position: 0.5,
      longest_pause_duration: 0.8,
      ...overrides,
    };
  }

  it('classifies chaotic_fast: very high WPM + rare pauses', () => {
    const result = classifyDeliveryFromSignals(
      makeSignals({ words_per_minute: 200, pause_frequency: 1 }),
    );
    expect(result).toBe('chaotic_fast');
  });

  it('classifies high_energy_punchy: high WPM + short pauses', () => {
    const result = classifyDeliveryFromSignals(
      makeSignals({ words_per_minute: 170, avg_pause_length: 0.3, pause_frequency: 4 }),
    );
    expect(result).toBe('high_energy_punchy');
  });

  it('classifies urgent_direct: high WPM but longer pauses', () => {
    const result = classifyDeliveryFromSignals(
      makeSignals({ words_per_minute: 165, avg_pause_length: 0.5, pause_frequency: 4 }),
    );
    expect(result).toBe('urgent_direct');
  });

  it('classifies calm_direct: slow WPM + long pauses', () => {
    const result = classifyDeliveryFromSignals(
      makeSignals({ words_per_minute: 100, avg_pause_length: 1.0, pause_frequency: 3 }),
    );
    expect(result).toBe('calm_direct');
  });

  it('classifies deadpan_sharp: slow WPM + high pause frequency', () => {
    const result = classifyDeliveryFromSignals(
      makeSignals({ words_per_minute: 105, avg_pause_length: 0.4, pause_frequency: 7 }),
    );
    expect(result).toBe('deadpan_sharp');
  });

  it('classifies nurturing_soft: moderate-slow WPM + medium pauses', () => {
    const result = classifyDeliveryFromSignals(
      makeSignals({ words_per_minute: 120, avg_pause_length: 0.7, pause_frequency: 4 }),
    );
    expect(result).toBe('nurturing_soft');
  });

  it('classifies playful_casual: mid-range WPM', () => {
    const result = classifyDeliveryFromSignals(
      makeSignals({ words_per_minute: 145, avg_pause_length: 0.3, pause_frequency: 3 }),
    );
    expect(result).toBe('playful_casual');
  });

  it('returns authoritative_measured as fallback', () => {
    // WPM between 110-130 but avg_pause <= 0.5 and pause_freq <= 5
    const result = classifyDeliveryFromSignals(
      makeSignals({ words_per_minute: 115, avg_pause_length: 0.4, pause_frequency: 4 }),
    );
    expect(result).toBe('authoritative_measured');
  });
});

// ── classifyPacingFromSignals ────────────────────────────

describe('classifyPacingFromSignals', () => {
  function makeSignals(overrides: Partial<PacingSignals>): PacingSignals {
    return {
      words_per_minute: 140,
      avg_pause_length: 0.4,
      pause_frequency: 4,
      first_3s_word_count: 6,
      hook_word_count: 6,
      total_word_count: 100,
      segment_count: 10,
      duration_seconds: 30,
      pace_acceleration: 'steady',
      longest_pause_position: 0.5,
      longest_pause_duration: 0.8,
      ...overrides,
    };
  }

  it('classifies rapid_fire for very high WPM', () => {
    const result = classifyPacingFromSignals(makeSignals({ words_per_minute: 180 }));
    expect(result).toBe('rapid_fire');
  });

  it('classifies fast_hook_medium_body: fast hook + decelerating', () => {
    const result = classifyPacingFromSignals(
      makeSignals({
        first_3s_word_count: 10,
        pace_acceleration: 'decelerating',
        words_per_minute: 150,
      }),
    );
    expect(result).toBe('fast_hook_medium_body');
  });

  it('classifies slow_build_fast_payoff: slow hook + accelerating', () => {
    const result = classifyPacingFromSignals(
      makeSignals({
        first_3s_word_count: 3,
        pace_acceleration: 'accelerating',
        words_per_minute: 150,
      }),
    );
    expect(result).toBe('slow_build_fast_payoff');
  });

  it('classifies punchy_short_beats: short pauses + fast tempo', () => {
    const result = classifyPacingFromSignals(
      makeSignals({
        avg_pause_length: 0.2,
        words_per_minute: 150,
        first_3s_word_count: 5,
        pace_acceleration: 'steady',
      }),
    );
    expect(result).toBe('punchy_short_beats');
  });

  it('classifies conversational_flow: long avg pauses', () => {
    const result = classifyPacingFromSignals(
      makeSignals({
        avg_pause_length: 0.6,
        words_per_minute: 130,
        first_3s_word_count: 5,
        pace_acceleration: 'steady',
      }),
    );
    expect(result).toBe('conversational_flow');
  });

  it('classifies steady_explainer as fallback', () => {
    const result = classifyPacingFromSignals(
      makeSignals({
        avg_pause_length: 0.4,
        words_per_minute: 140,
        first_3s_word_count: 5,
        pace_acceleration: 'steady',
      }),
    );
    expect(result).toBe('steady_explainer');
  });
});

// ── classifyHookEnergyFromSignals ────────────────────────

describe('classifyHookEnergyFromSignals', () => {
  function makeSignals(overrides: Partial<PacingSignals>): PacingSignals {
    return {
      words_per_minute: 140,
      avg_pause_length: 0.4,
      pause_frequency: 4,
      first_3s_word_count: 6,
      hook_word_count: 6,
      total_word_count: 100,
      segment_count: 10,
      duration_seconds: 30,
      pace_acceleration: 'steady',
      longest_pause_position: 0.5,
      longest_pause_duration: 0.8,
      ...overrides,
    };
  }

  it('returns immediate for >= 10 words in first 3s', () => {
    const result = classifyHookEnergyFromSignals(
      makeSignals({ first_3s_word_count: 12, hook_word_count: 8 }),
    );
    expect(result).toBe('immediate');
  });

  it('returns immediate for >= 12 hook words even if first 3s count is lower', () => {
    const result = classifyHookEnergyFromSignals(
      makeSignals({ first_3s_word_count: 8, hook_word_count: 14 }),
    );
    expect(result).toBe('immediate');
  });

  it('returns building for 5-9 words in first 3s', () => {
    const result = classifyHookEnergyFromSignals(
      makeSignals({ first_3s_word_count: 7, hook_word_count: 7 }),
    );
    expect(result).toBe('building');
  });

  it('returns delayed for fewer than 5 words in first 3s', () => {
    const result = classifyHookEnergyFromSignals(
      makeSignals({ first_3s_word_count: 2, hook_word_count: 2 }),
    );
    expect(result).toBe('delayed');
  });

  it('boundary: exactly 10 first_3s words => immediate', () => {
    const result = classifyHookEnergyFromSignals(
      makeSignals({ first_3s_word_count: 10, hook_word_count: 8 }),
    );
    expect(result).toBe('immediate');
  });

  it('boundary: exactly 5 first_3s words => building', () => {
    const result = classifyHookEnergyFromSignals(
      makeSignals({ first_3s_word_count: 5, hook_word_count: 5 }),
    );
    expect(result).toBe('building');
  });

  it('boundary: exactly 4 first_3s words => delayed', () => {
    const result = classifyHookEnergyFromSignals(
      makeSignals({ first_3s_word_count: 4, hook_word_count: 4 }),
    );
    expect(result).toBe('delayed');
  });
});
