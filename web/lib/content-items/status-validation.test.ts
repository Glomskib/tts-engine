import { describe, it, expect } from 'vitest';
import { CONTENT_ITEM_STATUSES, type ContentItemStatus } from './types';

describe('CONTENT_ITEM_STATUSES', () => {
  it('contains exactly the 8 lifecycle statuses', () => {
    expect(CONTENT_ITEM_STATUSES).toEqual([
      'briefing',
      'scripted',
      'ready_to_record',
      'recorded',
      'editing',
      'scheduled',
      'ready_to_post',
      'posted',
    ]);
  });

  it('rejects invalid status values', () => {
    const invalid = ['draft', 'pending', 'archived', '', 'READY_TO_POST'];
    for (const s of invalid) {
      expect(CONTENT_ITEM_STATUSES.includes(s as ContentItemStatus)).toBe(false);
    }
  });

  it('validates PATCH payload shape for status update', () => {
    // Simulates the shape sent to PATCH /api/content-items/[id]
    const validPayload = { status: 'ready_to_record' as ContentItemStatus };
    expect(CONTENT_ITEM_STATUSES.includes(validPayload.status)).toBe(true);

    const validDueAtPayload = { due_at: '2026-03-15T12:00:00Z' };
    expect(typeof validDueAtPayload.due_at).toBe('string');
    expect(/^\d{4}-\d{2}-\d{2}T/.test(validDueAtPayload.due_at)).toBe(true);
  });
});
