/**
 * Tests for guided mode — step conditions and state persistence.
 *
 * Steps drive the 7-step onboarding flow. Wrong conditions = stuck users.
 * parsePersistedState protects against localStorage corruption.
 */

import { describe, it, expect } from 'vitest';
import { GUIDED_STEPS, TOTAL_STEPS } from './steps';
import type { StepConditionInput } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<StepConditionInput['item']> = {}, recordingAcknowledged = false): StepConditionInput {
  return {
    item: {
      script_text: null,
      raw_video_url: null,
      transcript_status: null,
      edit_plan_json: null,
      edit_status: null,
      rendered_video_url: null,
      ...overrides,
    },
    recordingAcknowledged,
  };
}

function step(n: number) {
  return GUIDED_STEPS.find(s => s.step === n)!;
}

// ── TOTAL_STEPS ───────────────────────────────────────────────────────────────

describe('TOTAL_STEPS', () => {
  it('is 7', () => expect(TOTAL_STEPS).toBe(7));
  it('all step numbers are unique and sequential', () => {
    const nums = GUIDED_STEPS.map(s => s.step);
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

// ── Step 1: Create Content Item ───────────────────────────────────────────────

describe('step 1 — create content item', () => {
  it('is NOT complete when item is null', () => {
    expect(step(1).isComplete({ item: null, recordingAcknowledged: false })).toBe(false);
  });

  it('is complete when item exists (any shape)', () => {
    expect(step(1).isComplete(makeInput())).toBe(true);
  });
});

// ── Step 2: Generate Script ───────────────────────────────────────────────────

describe('step 2 — generate script', () => {
  it('is NOT complete when script_text is null', () => {
    expect(step(2).isComplete(makeInput({ script_text: null }))).toBe(false);
  });

  it('is NOT complete when script_text is empty string', () => {
    expect(step(2).isComplete(makeInput({ script_text: '' }))).toBe(false);
  });

  it('is complete when script_text has content', () => {
    expect(step(2).isComplete(makeInput({ script_text: 'My script here' }))).toBe(true);
  });
});

// ── Step 3: Record Video (recording acknowledged) ─────────────────────────────

describe('step 3 — record video', () => {
  it('is NOT complete when recordingAcknowledged is false', () => {
    expect(step(3).isComplete(makeInput({}, false))).toBe(false);
  });

  it('is complete when recordingAcknowledged is true', () => {
    expect(step(3).isComplete(makeInput({}, true))).toBe(true);
  });

  it('item state does not affect completion', () => {
    // Recording acknowledged is the only gate
    expect(step(3).isComplete({ item: null, recordingAcknowledged: true })).toBe(true);
    expect(step(3).isComplete(makeInput({ raw_video_url: '/some/video.mp4' }, false))).toBe(false);
  });
});

// ── Step 4: Upload Video ──────────────────────────────────────────────────────

describe('step 4 — upload video', () => {
  it('is NOT complete when raw_video_url is null', () => {
    expect(step(4).isComplete(makeInput({ raw_video_url: null }))).toBe(false);
  });

  it('is complete when raw_video_url is set', () => {
    expect(step(4).isComplete(makeInput({ raw_video_url: 'https://storage/video.mp4' }))).toBe(true);
  });
});

// ── Step 5: Analyze Video ─────────────────────────────────────────────────────

describe('step 5 — analyze video', () => {
  it('is NOT complete when transcript_status is null', () => {
    expect(step(5).isComplete(makeInput({ transcript_status: null }))).toBe(false);
  });

  it('is NOT complete when transcript_status is processing', () => {
    expect(step(5).isComplete(makeInput({ transcript_status: 'processing' }))).toBe(false);
  });

  it('is NOT complete when transcript_status is failed', () => {
    expect(step(5).isComplete(makeInput({ transcript_status: 'failed' }))).toBe(false);
  });

  it('is complete only when transcript_status is completed', () => {
    expect(step(5).isComplete(makeInput({ transcript_status: 'completed' }))).toBe(true);
  });

  it('notCompleteReason returns correct message for processing', () => {
    const reason = step(5).notCompleteReason(makeInput({ transcript_status: 'processing' }));
    expect(reason).toContain('running');
  });

  it('notCompleteReason returns correct message for failed', () => {
    const reason = step(5).notCompleteReason(makeInput({ transcript_status: 'failed' }));
    expect(reason).toContain('failed');
  });

  it('notCompleteReason returns default when no status', () => {
    const reason = step(5).notCompleteReason(makeInput({ transcript_status: null }));
    expect(reason).toContain('Analyze');
  });
});

// ── Step 6: Generate Edit Plan ────────────────────────────────────────────────

describe('step 6 — generate edit plan', () => {
  it('is NOT complete when edit_plan_json is null', () => {
    expect(step(6).isComplete(makeInput({ edit_plan_json: null }))).toBe(false);
  });

  it('is complete when edit_plan_json has content', () => {
    expect(step(6).isComplete(makeInput({ edit_plan_json: { version: 1, actions: [] } }))).toBe(true);
  });
});

// ── Step 7: Render Video ──────────────────────────────────────────────────────

describe('step 7 — render video', () => {
  it('is NOT complete when edit_status is ready_to_render', () => {
    expect(step(7).isComplete(makeInput({ edit_status: 'ready_to_render' }))).toBe(false);
  });

  it('is NOT complete when edit_status is rendering', () => {
    expect(step(7).isComplete(makeInput({ edit_status: 'rendering' }))).toBe(false);
  });

  it('is complete only when edit_status is rendered', () => {
    expect(step(7).isComplete(makeInput({ edit_status: 'rendered' }))).toBe(true);
  });

  it('notCompleteReason returns progress message when rendering', () => {
    const reason = step(7).notCompleteReason(makeInput({ edit_status: 'rendering' }));
    expect(reason).toContain('progress');
  });

  it('notCompleteReason returns failed message when failed', () => {
    const reason = step(7).notCompleteReason(makeInput({ edit_status: 'failed' }));
    expect(reason).toContain('failed');
  });

  it('notCompleteReason returns default message otherwise', () => {
    const reason = step(7).notCompleteReason(makeInput({ edit_status: 'ready_to_render' }));
    expect(reason).toContain('Render');
  });
});

// ── parsePersistedState (imported indirectly through type checking) ────────────
// This is tested here as a pure function extracted for readability.
// The actual function lives in GuidedModeContext.tsx (a React file), so we
// test the same logic inline.

function parsePersistedState(raw: string): ReturnType<typeof JSON.parse> | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { active, step, contentItemId, startedAt } = parsed as Record<string, unknown>;
    if (typeof active !== 'boolean') return null;
    const stepNum = Number(step);
    if (!Number.isInteger(stepNum) || stepNum < 1 || stepNum > 7) return null;
    return {
      active,
      step: stepNum,
      contentItemId: typeof contentItemId === 'string' ? contentItemId : null,
      startedAt: typeof startedAt === 'string' ? startedAt : '',
    };
  } catch {
    return null;
  }
}

describe('parsePersistedState', () => {
  it('parses valid state', () => {
    const raw = JSON.stringify({ active: true, step: 3, contentItemId: 'abc-123', startedAt: '2026-01-01T00:00:00Z' });
    const result = parsePersistedState(raw);
    expect(result).toEqual({ active: true, step: 3, contentItemId: 'abc-123', startedAt: '2026-01-01T00:00:00Z' });
  });

  it('returns null for invalid JSON', () => {
    expect(parsePersistedState('not-json')).toBeNull();
    expect(parsePersistedState('')).toBeNull();
    expect(parsePersistedState('{broken')).toBeNull();
  });

  it('returns null when active is not boolean', () => {
    const raw = JSON.stringify({ active: 'yes', step: 1, contentItemId: null, startedAt: '' });
    expect(parsePersistedState(raw)).toBeNull();
  });

  it('returns null when step is out of range [1-7]', () => {
    const raw0 = JSON.stringify({ active: true, step: 0, contentItemId: null, startedAt: '' });
    const raw8 = JSON.stringify({ active: true, step: 8, contentItemId: null, startedAt: '' });
    expect(parsePersistedState(raw0)).toBeNull();
    expect(parsePersistedState(raw8)).toBeNull();
  });

  it('returns null when step is not a number', () => {
    const raw = JSON.stringify({ active: true, step: 'three', contentItemId: null, startedAt: '' });
    expect(parsePersistedState(raw)).toBeNull();
  });

  it('coerces null contentItemId to null', () => {
    const raw = JSON.stringify({ active: false, step: 1, contentItemId: null, startedAt: '' });
    const result = parsePersistedState(raw);
    expect(result!.contentItemId).toBeNull();
  });

  it('coerces non-string contentItemId to null', () => {
    const raw = JSON.stringify({ active: false, step: 1, contentItemId: 42, startedAt: '' });
    const result = parsePersistedState(raw);
    expect(result!.contentItemId).toBeNull();
  });

  it('coerces non-string startedAt to empty string', () => {
    const raw = JSON.stringify({ active: false, step: 1, contentItemId: null, startedAt: 12345 });
    const result = parsePersistedState(raw);
    expect(result!.startedAt).toBe('');
  });

  it('accepts step at boundaries (1 and 7)', () => {
    const rawStep1 = JSON.stringify({ active: true, step: 1, contentItemId: null, startedAt: '' });
    const rawStep7 = JSON.stringify({ active: true, step: 7, contentItemId: 'id', startedAt: '' });
    expect(parsePersistedState(rawStep1)).not.toBeNull();
    expect(parsePersistedState(rawStep7)).not.toBeNull();
  });

  it('returns null for null/empty JSON object', () => {
    expect(parsePersistedState('null')).toBeNull();
    expect(parsePersistedState('[]')).toBeNull(); // array is not object
  });
});
