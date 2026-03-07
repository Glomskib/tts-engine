import { describe, it, expect } from 'vitest';
import { getNextAction, type ContentItemForAction } from './nextAction';

function makeItem(overrides: Partial<ContentItemForAction> = {}): ContentItemForAction {
  return {
    id: 'test-id',
    status: 'briefing',
    product_id: 'prod-1',
    ...overrides,
  };
}

describe('getNextAction', () => {
  // Status-based actions
  it('briefing without brief → Generate Brief', () => {
    const action = getNextAction(makeItem({ status: 'briefing', has_brief: false }));
    expect(action.label).toBe('Generate Brief');
    expect(action.onClickType).toBe('generate_brief');
  });

  it('briefing with brief → Review Brief', () => {
    const action = getNextAction(makeItem({ status: 'briefing', has_brief: true }));
    expect(action.label).toBe('Review Brief');
    expect(action.href).toBe('/admin/record/test-id');
  });

  it('ready_to_record → Record', () => {
    const action = getNextAction(makeItem({ status: 'ready_to_record' }));
    expect(action.label).toBe('Record');
    expect(action.href).toBe('/admin/record/test-id');
  });

  it('recorded without transcript → Paste Transcript', () => {
    const action = getNextAction(makeItem({ status: 'recorded', transcript_text: null }));
    expect(action.label).toBe('Paste Transcript');
    expect(action.onClickType).toBe('paste_transcript');
  });

  it('recorded with transcript → Generate Editor Notes', () => {
    const action = getNextAction(makeItem({ status: 'recorded', transcript_text: 'some transcript' }));
    expect(action.label).toBe('Generate Editor Notes');
    expect(action.onClickType).toBe('generate_editor_notes');
  });

  it('recorded with completed editor notes → Review Editor Notes', () => {
    const action = getNextAction(makeItem({
      status: 'recorded',
      transcript_text: 'some transcript',
      editor_notes_status: 'completed',
      editor_notes: 'some notes',
    }));
    expect(action.label).toBe('Review Editor Notes');
    expect(action.href).toBe('/admin/record/test-id');
  });

  it('editing → Mark Ready to Post', () => {
    const action = getNextAction(makeItem({ status: 'editing' }));
    expect(action.label).toBe('Mark Ready to Post');
    expect(action.onClickType).toBe('mark_ready_to_post');
  });

  it('ready_to_post → Post', () => {
    const action = getNextAction(makeItem({ status: 'ready_to_post' }));
    expect(action.label).toBe('Post');
    expect(action.href).toBe('/admin/post/test-id');
  });

  it('posted → Log Metrics', () => {
    const action = getNextAction(makeItem({ status: 'posted' }));
    expect(action.label).toBe('Log Metrics');
    expect(action.onClickType).toBe('log_metrics');
  });

  // Missing product override
  it('missing product in ready_to_record → Link Product', () => {
    const action = getNextAction(makeItem({ status: 'ready_to_record', product_id: null }));
    expect(action.label).toBe('Link Product');
    expect(action.onClickType).toBe('link_product');
  });

  it('missing product in briefing → does NOT override (briefing is exempt)', () => {
    const action = getNextAction(makeItem({ status: 'briefing', product_id: null }));
    expect(action.label).toBe('Generate Brief');
  });

  it('missing product in posted → does NOT override (posted is exempt)', () => {
    const action = getNextAction(makeItem({ status: 'posted', product_id: null }));
    expect(action.label).toBe('Log Metrics');
  });

  // Variant colors
  it('returns correct variant for each status', () => {
    expect(getNextAction(makeItem({ status: 'ready_to_record' })).variant).toBe('teal');
    expect(getNextAction(makeItem({ status: 'ready_to_post' })).variant).toBe('green');
    expect(getNextAction(makeItem({ status: 'posted' })).variant).toBe('zinc');
  });
});
