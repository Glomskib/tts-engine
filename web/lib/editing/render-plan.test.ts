/**
 * Tests for the editing engine — validation, plan builder, instruction parsing.
 */

import { describe, it, expect } from 'vitest';
import { validateEditPlan } from './validate-edit-plan';
import { buildEditPlan } from './build-edit-plan';
import type { EditPlan } from './types';

// ── Plan Validation ─────────────────────────────────────────────

describe('validateEditPlan', () => {
  const basePlan: EditPlan = {
    version: 1,
    source_duration_sec: 60,
    actions: [{ type: 'keep', start_sec: 0, end_sec: 60 }],
    output: { format: 'mp4', resolution: '1080x1920', fps: 30 },
  };

  it('accepts a valid plan with a single keep', () => {
    const result = validateEditPlan(basePlan);
    expect(result.ok).toBe(true);
  });

  it('accepts a plan with all action types', () => {
    const plan: EditPlan = {
      ...basePlan,
      actions: [
        { type: 'keep', start_sec: 0, end_sec: 10 },
        { type: 'cut', start_sec: 10, end_sec: 15, reason: 'um' },
        { type: 'keep', start_sec: 15, end_sec: 30 },
        { type: 'text_overlay', start_sec: 16, end_sec: 20, text: 'Hello', position: 'bottom' },
        { type: 'speed', start_sec: 30, end_sec: 40, factor: 2 },
        { type: 'broll', start_sec: 40, end_sec: 45, asset_url: null },
        { type: 'keep', start_sec: 40, end_sec: 60 },
        { type: 'end_card', duration_sec: 2, text: 'Follow me!', bg_color: '#000000', text_color: '#FFFFFF' },
        { type: 'normalize_audio', target_lufs: -14, enabled: true },
        { type: 'burn_captions', style: 'bold', position: 'bottom', font_size: 42, enabled: true },
        { type: 'remove_silence', threshold_db: -35, min_duration_ms: 600, padding_ms: 100, enabled: true },
        { type: 'watermark', text: '@myhandle', position: 'bottom-right', opacity: 0.7 },
      ],
    };
    const result = validateEditPlan(plan);
    expect(result.ok).toBe(true);
  });

  it('rejects a plan with no actions', () => {
    expect(validateEditPlan({ ...basePlan, actions: [] }).ok).toBe(false);
  });

  it('rejects wrong version', () => {
    expect(validateEditPlan({ ...basePlan, version: 2 }).ok).toBe(false);
  });

  it('rejects end_sec <= start_sec', () => {
    const r = validateEditPlan({ ...basePlan, actions: [{ type: 'keep', start_sec: 10, end_sec: 10 }] });
    expect(r.ok).toBe(false);
    expect(r.errors!.some(e => e.includes('end_sec'))).toBe(true);
  });

  it('rejects negative start_sec', () => {
    const r = validateEditPlan({ ...basePlan, actions: [{ type: 'keep', start_sec: -1, end_sec: 10 }] });
    expect(r.ok).toBe(false);
    expect(r.errors!.some(e => e.includes('negative'))).toBe(true);
  });

  it('rejects action exceeding source duration', () => {
    const r = validateEditPlan({ ...basePlan, source_duration_sec: 30, actions: [{ type: 'keep', start_sec: 0, end_sec: 35 }] });
    expect(r.ok).toBe(false);
  });

  it('rejects overlapping keeps', () => {
    const r = validateEditPlan({ ...basePlan, actions: [{ type: 'keep', start_sec: 0, end_sec: 20 }, { type: 'keep', start_sec: 15, end_sec: 30 }] });
    expect(r.ok).toBe(false);
  });

  it('rejects speed factor out of range', () => {
    expect(validateEditPlan({ ...basePlan, actions: [{ type: 'speed', start_sec: 0, end_sec: 10, factor: 10 }] }).ok).toBe(false);
  });

  it('allows end_sec up to 0.5s past duration', () => {
    const r = validateEditPlan({ ...basePlan, source_duration_sec: 30, actions: [{ type: 'keep', start_sec: 0, end_sec: 30.4 }] });
    expect(r.ok).toBe(true);
  });

  it('does NOT apply time-bounds checks to non-timed actions', () => {
    const r = validateEditPlan({
      ...basePlan,
      actions: [
        { type: 'keep', start_sec: 0, end_sec: 60 },
        { type: 'normalize_audio', target_lufs: -14, enabled: true },
        { type: 'end_card', duration_sec: 2, bg_color: '#000000', text_color: '#FFFFFF' },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it('accepts 1080x1080 resolution', () => {
    const r = validateEditPlan({
      ...basePlan,
      output: { format: 'mp4', resolution: '1080x1080', fps: 30 },
    });
    expect(r.ok).toBe(true);
  });
});

// ── Build Edit Plan ─────────────────────────────────────────────

describe('buildEditPlan', () => {
  it('returns a keep-all plan with normalize_audio when no instructions', () => {
    const { plan, warnings } = buildEditPlan({ source_duration_sec: 30 });
    expect(plan.actions.some(a => a.type === 'keep')).toBe(true);
    expect(plan.actions.some(a => a.type === 'normalize_audio')).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it('adds hook overlay from primary_hook', () => {
    const { plan } = buildEditPlan({ source_duration_sec: 30, primary_hook: 'Did you know?' });
    const overlay = plan.actions.find(a => a.type === 'text_overlay');
    expect(overlay).toBeDefined();
    if (overlay?.type === 'text_overlay') {
      expect(overlay.text).toBe('Did you know?');
      expect(overlay.start_sec).toBe(0);
    }
  });

  it('adds end card from CTA', () => {
    const { plan } = buildEditPlan({ source_duration_sec: 30, cta_text: 'Follow for more!' });
    const ec = plan.actions.find(a => a.type === 'end_card');
    expect(ec).toBeDefined();
    if (ec?.type === 'end_card') expect(ec.text).toBe('Follow for more!');
  });

  it('skips normalize when instructions say "raw audio"', () => {
    const { plan } = buildEditPlan({
      source_duration_sec: 30,
      editing_instructions: 'Keep raw audio, no changes.',
    });
    expect(plan.actions.some(a => a.type === 'normalize_audio')).toBe(false);
  });
});

// ── Instruction Parsing ─────────────────────────────────────────

describe('instruction parsing', () => {
  it('parses "cut 5 to 10"', () => {
    const { plan } = buildEditPlan({ source_duration_sec: 30, editing_instructions: 'cut 5 to 10' });
    const cut = plan.actions.find(a => a.type === 'cut');
    expect(cut).toBeDefined();
    if (cut?.type === 'cut') { expect(cut.start_sec).toBe(5); expect(cut.end_sec).toBe(10); }
  });

  it('parses "cut from 12.5s to 18s"', () => {
    const { plan } = buildEditPlan({ source_duration_sec: 30, editing_instructions: 'cut from 12.5s to 18s' });
    const cut = plan.actions.find(a => a.type === 'cut');
    expect(cut).toBeDefined();
    if (cut?.type === 'cut') { expect(cut.start_sec).toBe(12.5); expect(cut.end_sec).toBe(18); }
  });

  it('parses "keep 0 to 15"', () => {
    const { plan } = buildEditPlan({ source_duration_sec: 30, editing_instructions: 'keep 0 to 15' });
    const keep = plan.actions.find(a => a.type === 'keep');
    expect(keep).toBeDefined();
    if (keep?.type === 'keep') expect(keep.end_sec).toBe(15);
  });

  it('parses "remove pauses"', () => {
    const { plan } = buildEditPlan({ source_duration_sec: 30, editing_instructions: 'Remove all pauses' });
    expect(plan.actions.some(a => a.type === 'remove_silence')).toBe(true);
  });

  it('parses "tight edit" as silence removal with aggressive threshold', () => {
    const { plan } = buildEditPlan({ source_duration_sec: 30, editing_instructions: 'Make it a tight edit' });
    const rs = plan.actions.find(a => a.type === 'remove_silence');
    expect(rs).toBeDefined();
    if (rs?.type === 'remove_silence') expect(rs.threshold_db).toBe(-30);
  });

  it('parses "add captions"', () => {
    const { plan } = buildEditPlan({ source_duration_sec: 30, editing_instructions: 'Add auto captions' });
    expect(plan.actions.some(a => a.type === 'burn_captions')).toBe(true);
  });

  it('parses "fast paced snappy"', () => {
    const { plan } = buildEditPlan({ source_duration_sec: 30, editing_instructions: 'Keep it snappy and fast paced' });
    expect(plan.actions.some(a => a.type === 'remove_silence')).toBe(true);
  });

  it('parses "end card"', () => {
    const { plan } = buildEditPlan({ source_duration_sec: 30, editing_instructions: 'Add an end card' });
    expect(plan.actions.some(a => a.type === 'end_card')).toBe(true);
  });

  it('parses "watermark @myhandle"', () => {
    const { plan } = buildEditPlan({ source_duration_sec: 30, editing_instructions: 'watermark @myhandle' });
    const wm = plan.actions.find(a => a.type === 'watermark');
    expect(wm).toBeDefined();
    if (wm?.type === 'watermark') expect(wm.text).toBe('@myhandle');
  });

  it('warns on unrecognized long instructions', () => {
    const { warnings } = buildEditPlan({
      source_duration_sec: 30,
      editing_instructions: 'Make it feel like a Christopher Nolan film with dramatic tension',
    });
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('warns on aspect ratio hints', () => {
    const { warnings } = buildEditPlan({
      source_duration_sec: 30,
      editing_instructions: 'Make it square for Instagram',
    });
    expect(warnings.some(w => w.includes('square'))).toBe(true);
  });

  it('parses "remove dead air"', () => {
    const { plan } = buildEditPlan({ source_duration_sec: 30, editing_instructions: 'Remove dead air between takes' });
    expect(plan.actions.some(a => a.type === 'remove_silence')).toBe(true);
  });

  it('handles multi-line instructions', () => {
    const { plan } = buildEditPlan({
      source_duration_sec: 60,
      editing_instructions: 'cut 5 to 10\nadd captions\nremove pauses\nend card',
    });
    expect(plan.actions.some(a => a.type === 'cut')).toBe(true);
    expect(plan.actions.some(a => a.type === 'burn_captions')).toBe(true);
    expect(plan.actions.some(a => a.type === 'remove_silence')).toBe(true);
    expect(plan.actions.some(a => a.type === 'end_card')).toBe(true);
  });
});
