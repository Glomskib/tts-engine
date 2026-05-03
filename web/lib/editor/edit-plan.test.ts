/**
 * Unit tests for the AI Video Editor's edit-plan helpers.
 * These exercise the pure functions — no network, no fs.
 *
 * Run: pnpm test (vitest run)
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeKeepRanges,
  remapCaptionToFinalTime,
  remapCaptionsToFinalTime,
} from './edit-plan';

describe('normalizeKeepRanges', () => {
  it('returns empty for empty input', () => {
    expect(normalizeKeepRanges([])).toEqual([]);
  });

  it('drops near-zero-length ranges', () => {
    const out = normalizeKeepRanges([{ start: 0, end: 0.01 }]);
    expect(out).toEqual([]);
  });

  it('sorts unsorted ranges', () => {
    const out = normalizeKeepRanges([
      { start: 5, end: 7 },
      { start: 0, end: 2 },
    ]);
    expect(out).toEqual([
      { start: 0, end: 2 },
      { start: 5, end: 7 },
    ]);
  });

  it('merges overlapping ranges', () => {
    const out = normalizeKeepRanges([
      { start: 0, end: 5 },
      { start: 3, end: 8 },
    ]);
    expect(out).toEqual([{ start: 0, end: 8 }]);
  });

  it('merges adjacent ranges (within 0.05s)', () => {
    const out = normalizeKeepRanges([
      { start: 0, end: 3 },
      { start: 3.02, end: 5 },
    ]);
    expect(out).toEqual([{ start: 0, end: 5 }]);
  });

  it('keeps non-overlapping ranges separate', () => {
    const out = normalizeKeepRanges([
      { start: 0, end: 3 },
      { start: 5, end: 8 },
    ]);
    expect(out).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 8 },
    ]);
  });
});

describe('remapCaptionToFinalTime', () => {
  it('returns null when caption falls in a dropped range', () => {
    const out = remapCaptionToFinalTime(
      { start: 4.0, end: 4.5, text: 'X' },
      [{ start: 0, end: 3 }, { start: 5, end: 8 }],
    );
    expect(out).toBeNull();
  });

  it('maps caption inside the first keep range to final time = source time', () => {
    const out = remapCaptionToFinalTime(
      { start: 1.5, end: 2.5, text: 'X' },
      [{ start: 0, end: 3 }, { start: 5, end: 8 }],
    );
    expect(out).toEqual({ start: 1.5, end: 2.5, text: 'X', style: undefined });
  });

  it('maps caption inside the second keep range to offset by first kept duration', () => {
    // First range = 3s kept. Caption source 6.0–6.5 should map to final 4.0–4.5.
    const out = remapCaptionToFinalTime(
      { start: 6.0, end: 6.5, text: 'X' },
      [{ start: 0, end: 3 }, { start: 5, end: 8 }],
    );
    expect(out).toEqual({ start: 4.0, end: 4.5, text: 'X', style: undefined });
  });

  it('clamps a caption end that exceeds the keep-range end', () => {
    // Caption 2.5–4.0 starts inside first range [0,3] but ends past it.
    // Should clamp to 2.5–3.0 in source = 2.5–3.0 in final (since cumulative=0).
    const out = remapCaptionToFinalTime(
      { start: 2.5, end: 4.0, text: 'X' },
      [{ start: 0, end: 3 }, { start: 5, end: 8 }],
    );
    expect(out).toEqual({ start: 2.5, end: 3.0, text: 'X', style: undefined });
  });

  it('preserves the style flag', () => {
    const out = remapCaptionToFinalTime(
      { start: 0.5, end: 1.5, text: 'WAIT', style: 'hook' },
      [{ start: 0, end: 3 }],
    );
    expect(out?.style).toBe('hook');
  });
});

describe('remapCaptionsToFinalTime', () => {
  it('drops out-of-range captions silently', () => {
    const out = remapCaptionsToFinalTime(
      [
        { start: 1.0, end: 2.0, text: 'A' }, // in first range
        { start: 4.0, end: 4.5, text: 'B' }, // dropped
        { start: 6.0, end: 6.5, text: 'C' }, // in second range
      ],
      [{ start: 0, end: 3 }, { start: 5, end: 8 }],
    );
    expect(out).toHaveLength(2);
    expect(out[0].text).toBe('A');
    expect(out[1].text).toBe('C');
  });
});
