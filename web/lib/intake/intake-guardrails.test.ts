import { describe, it, expect } from 'vitest';
import { estimateIntakeCost } from '@/lib/finops/intake-cost';

describe('estimateIntakeCost', () => {
  it('returns expected values for a 5-min, 500MB file', () => {
    const result = estimateIntakeCost({ durationSeconds: 300, fileBytes: 500 * 1024 * 1024 });
    expect(result.total_usd).toBeGreaterThan(0);
    expect(result.transcribe_usd).toBeGreaterThan(0);
    expect(result.storage_usd).toBeGreaterThan(0);
    expect(result.overhead_usd).toBe(0.01);
    expect(result.duration_seconds).toBe(300);
    expect(result.file_bytes).toBe(500 * 1024 * 1024);
    // 5min * $0.006/min = $0.03 transcribe
    expect(result.transcribe_usd).toBeCloseTo(0.03, 4);
    // 0.488 GB * $0.02/GB ≈ $0.00977
    expect(result.storage_usd).toBeCloseTo(0.02 * (500 / 1024), 4);
  });

  it('returns zero transcribe cost for 0-second file', () => {
    const result = estimateIntakeCost({ durationSeconds: 0, fileBytes: 1024 });
    expect(result.transcribe_usd).toBe(0);
    expect(result.overhead_usd).toBe(0.01);
    expect(result.total_usd).toBeGreaterThan(0);
  });

  it('never returns NaN or negative values', () => {
    const inputs = [
      { durationSeconds: 0, fileBytes: 0 },
      { durationSeconds: -1, fileBytes: -1 },
      { durationSeconds: 3600, fileBytes: 2 * 1024 * 1024 * 1024 },
      { durationSeconds: 1, fileBytes: 1 },
    ];
    for (const input of inputs) {
      const result = estimateIntakeCost(input);
      expect(Number.isNaN(result.total_usd)).toBe(false);
      expect(result.total_usd).toBeGreaterThanOrEqual(0);
      expect(result.transcribe_usd).toBeGreaterThanOrEqual(0);
      expect(result.storage_usd).toBeGreaterThanOrEqual(0);
    }
  });

  it('total equals sum of components', () => {
    const result = estimateIntakeCost({ durationSeconds: 600, fileBytes: 1024 * 1024 * 1024 });
    const expectedTotal = result.transcribe_usd + result.storage_usd + result.overhead_usd;
    expect(result.total_usd).toBeCloseTo(expectedTotal, 5);
  });
});

describe('IntakeFailureReason', () => {
  it('includes new guardrail failure reasons', async () => {
    // Dynamic import to avoid needing the full server env
    const { FAILURE_MESSAGES } = await import('@/lib/intake/intake-limits');
    expect(FAILURE_MESSAGES).toHaveProperty('NEEDS_APPROVAL');
    expect(FAILURE_MESSAGES).toHaveProperty('DEFERRED');
    expect(FAILURE_MESSAGES).toHaveProperty('INTAKE_DISABLED');
    expect(FAILURE_MESSAGES).toHaveProperty('REJECTED_BY_USER');
    expect(typeof FAILURE_MESSAGES.NEEDS_APPROVAL).toBe('string');
    expect(typeof FAILURE_MESSAGES.DEFERRED).toBe('string');
    expect(typeof FAILURE_MESSAGES.INTAKE_DISABLED).toBe('string');
    expect(typeof FAILURE_MESSAGES.REJECTED_BY_USER).toBe('string');
  });
});
