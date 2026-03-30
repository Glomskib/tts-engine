/**
 * Tests for build-edit-plan.ts and validate-edit-plan.ts
 *
 * Critical path: buildEditPlan is the source of truth for what the render
 * engine will do to the raw video. Wrong plans = broken renders.
 */

import { describe, it, expect } from 'vitest';
import { buildEditPlan } from './build-edit-plan';
import { validateEditPlan } from './validate-edit-plan';
import type { EditorNotesJSON } from '../content-items/editor-notes-schema';

// ── Helpers ──────────────────────────────────────────────────────────────────

function types(plan: ReturnType<typeof buildEditPlan>['plan']) {
  return plan.actions.map(a => a.type);
}

/** Cast a partial notes object to EditorNotesJSON for test purposes. */
function notes(partial: Partial<EditorNotesJSON>): EditorNotesJSON {
  return partial as unknown as EditorNotesJSON;
}

// ── buildEditPlan ─────────────────────────────────────────────────────────────

describe('buildEditPlan', () => {
  describe('defaults', () => {
    it('produces a valid plan with minimal input', () => {
      const { plan, warnings } = buildEditPlan({ source_duration_sec: 60 });
      expect(plan.version).toBe(1);
      expect(plan.source_duration_sec).toBe(60);
      expect(plan.actions.length).toBeGreaterThan(0);
      expect(plan.output.format).toBe('mp4');
      expect(plan.output.resolution).toBe('1080x1920');
      expect(plan.output.fps).toBe(30);
      expect(warnings).toEqual([]);
    });

    it('adds normalize_audio by default', () => {
      const { plan } = buildEditPlan({ source_duration_sec: 30 });
      expect(types(plan)).toContain('normalize_audio');
    });

    it('adds keep action covering full duration when no instructions', () => {
      const { plan } = buildEditPlan({ source_duration_sec: 45 });
      const keep = plan.actions.find(a => a.type === 'keep') as { start_sec: number; end_sec: number } | undefined;
      expect(keep).toBeDefined();
      expect(keep!.start_sec).toBe(0);
      expect(keep!.end_sec).toBe(45);
    });

    it('does NOT add end_card when no cta_text or brand_handle', () => {
      const { plan } = buildEditPlan({ source_duration_sec: 30 });
      expect(types(plan)).not.toContain('end_card');
    });

    it('adds end_card when cta_text provided', () => {
      const { plan } = buildEditPlan({ source_duration_sec: 30, cta_text: 'Follow for more!' });
      expect(types(plan)).toContain('end_card');
      const card = plan.actions.find(a => a.type === 'end_card') as { text?: string } | undefined;
      expect(card!.text).toBe('Follow for more!');
    });

    it('adds end_card when brand_handle provided', () => {
      const { plan } = buildEditPlan({ source_duration_sec: 30, brand_handle: '@mybrand' });
      const card = plan.actions.find(a => a.type === 'end_card') as { subtext?: string } | undefined;
      expect(card!.subtext).toBe('@mybrand');
    });
  });

  describe('primary_hook text overlay', () => {
    it('adds text_overlay at 0s for primary_hook', () => {
      const { plan } = buildEditPlan({ source_duration_sec: 60, primary_hook: 'This will change your life' });
      const overlay = plan.actions.find(a => a.type === 'text_overlay') as { start_sec: number; text: string; position: string } | undefined;
      expect(overlay).toBeDefined();
      expect(overlay!.start_sec).toBe(0);
      expect(overlay!.text).toBe('This will change your life');
      expect(overlay!.position).toBe('center');
    });

    it('does NOT add hook overlay when editor_notes already has a text_overlay before 3s', () => {
      const { plan } = buildEditPlan({
        source_duration_sec: 60,
        primary_hook: 'Hook text',
        editor_notes_json: notes({
          timeline: [{ label: 'text', start_sec: 0, end_sec: 3, note: '', on_screen_text: 'Existing overlay', broll: null }],
        }),
      });
      const overlays = plan.actions.filter(a => a.type === 'text_overlay');
      expect(overlays.length).toBe(1); // only the one from editor_notes
    });

    it('caps hook overlay end_sec at min(4, source_duration)', () => {
      const { plan } = buildEditPlan({ source_duration_sec: 2, primary_hook: 'Hook' });
      const overlay = plan.actions.find(a => a.type === 'text_overlay') as { end_sec: number } | undefined;
      expect(overlay!.end_sec).toBe(2); // capped at source_duration
    });
  });

  describe('normalize_audio suppression', () => {
    for (const phrase of ['no normalize', 'skip audio', 'raw audio']) {
      it(`skips normalize when instructions contain "${phrase}"`, () => {
        const { plan } = buildEditPlan({ source_duration_sec: 30, editing_instructions: phrase });
        expect(types(plan)).not.toContain('normalize_audio');
      });
    }
  });

  describe('editing_instructions parsing', () => {
    it('parses cut instruction', () => {
      const { plan, warnings } = buildEditPlan({
        source_duration_sec: 60,
        editing_instructions: 'cut from 10 to 15',
      });
      const cut = plan.actions.find(a => a.type === 'cut') as { start_sec: number; end_sec: number } | undefined;
      expect(cut).toBeDefined();
      expect(cut!.start_sec).toBe(10);
      expect(cut!.end_sec).toBe(15);
      expect(warnings).toEqual([]);
    });

    it('parses keep instruction', () => {
      const { plan } = buildEditPlan({
        source_duration_sec: 60,
        editing_instructions: 'keep from 5 to 50',
      });
      const keep = plan.actions.find(a => a.type === 'keep') as { start_sec: number; end_sec: number } | undefined;
      expect(keep!.start_sec).toBe(5);
      expect(keep!.end_sec).toBe(50);
    });

    it('parses cut with decimal seconds', () => {
      const { plan } = buildEditPlan({
        source_duration_sec: 60,
        editing_instructions: 'cut 12.5 - 14.5',
      });
      const cut = plan.actions.find(a => a.type === 'cut') as { start_sec: number; end_sec: number } | undefined;
      expect(cut!.start_sec).toBe(12.5);
      expect(cut!.end_sec).toBe(14.5);
    });

    it('warns on out-of-bounds cut', () => {
      const { warnings } = buildEditPlan({
        source_duration_sec: 30,
        editing_instructions: 'cut from 5 to 99',
      });
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('invalid or out of bounds');
    });

    it('adds remove_silence on "remove pauses"', () => {
      const { plan } = buildEditPlan({
        source_duration_sec: 60,
        editing_instructions: 'remove pauses',
      });
      expect(types(plan)).toContain('remove_silence');
    });

    it('adds remove_silence on "tight edit"', () => {
      const { plan } = buildEditPlan({
        source_duration_sec: 60,
        editing_instructions: 'tight edit',
      });
      const rs = plan.actions.find(a => a.type === 'remove_silence') as { threshold_db: number } | undefined;
      expect(rs).toBeDefined();
      expect(rs!.threshold_db).toBe(-30); // tighter threshold for "tight edit"
    });

    it('adds burn_captions on "add captions"', () => {
      const { plan } = buildEditPlan({
        source_duration_sec: 60,
        editing_instructions: 'add captions',
      });
      expect(types(plan)).toContain('burn_captions');
    });

    it('does not add duplicate remove_silence', () => {
      const { plan } = buildEditPlan({
        source_duration_sec: 60,
        editing_instructions: 'remove pauses\ntight edit',
      });
      const removals = plan.actions.filter(a => a.type === 'remove_silence');
      expect(removals.length).toBe(1);
    });

    it('emits warning for unrecognized instructions', () => {
      const { warnings } = buildEditPlan({
        source_duration_sec: 60,
        editing_instructions: 'do something completely unrecognizable here',
      });
      expect(warnings.some(w => w.includes('Could not parse'))).toBe(true);
    });

    it('adds square aspect ratio warning', () => {
      const { warnings } = buildEditPlan({
        source_duration_sec: 60,
        editing_instructions: 'square format please',
      });
      expect(warnings.some(w => w.includes('square'))).toBe(true);
    });
  });

  describe('editor_notes_json', () => {
    it('converts timeline cuts to cut actions', () => {
      const { plan } = buildEditPlan({
        source_duration_sec: 60,
        editor_notes_json: notes({
          timeline: [{ label: 'cut', start_sec: 5, end_sec: 10, note: 'filler', broll: null, on_screen_text: null }],
        }),
      });
      const cut = plan.actions.find(a => a.type === 'cut') as { start_sec: number; end_sec: number } | undefined;
      expect(cut!.start_sec).toBe(5);
      expect(cut!.end_sec).toBe(10);
    });

    it('converts timeline keeps', () => {
      const { plan } = buildEditPlan({
        source_duration_sec: 60,
        editor_notes_json: notes({
          timeline: [{ label: 'keep', start_sec: 0, end_sec: 55, note: '', broll: null, on_screen_text: null }],
        }),
      });
      const keep = plan.actions.find(a => a.type === 'keep') as { start_sec: number; end_sec: number } | undefined;
      expect(keep!.start_sec).toBe(0);
      expect(keep!.end_sec).toBe(55);
    });

    it('converts broll pack to broll actions', () => {
      const { plan } = buildEditPlan({
        source_duration_sec: 60,
        editor_notes_json: notes({
          broll_pack: [{ at_sec: 10, type: 'lifestyle', prompt: 'cityscape at sunset' }],
        }),
      });
      const broll = plan.actions.find(a => a.type === 'broll') as { start_sec: number; end_sec: number; prompt?: string } | undefined;
      expect(broll!.start_sec).toBe(10);
      expect(broll!.end_sec).toBe(13); // at_sec + 3
      expect(broll!.prompt).toBe('cityscape at sunset');
    });
  });

  describe('no double-add safeguards', () => {
    it('does not add default keep when editor_notes already has keep', () => {
      const { plan } = buildEditPlan({
        source_duration_sec: 60,
        editor_notes_json: notes({
          timeline: [{ label: 'keep', start_sec: 0, end_sec: 60, note: '', broll: null, on_screen_text: null }],
        }),
      });
      const keeps = plan.actions.filter(a => a.type === 'keep');
      expect(keeps.length).toBe(1);
    });
  });
});

// ── validateEditPlan ──────────────────────────────────────────────────────────

describe('validateEditPlan', () => {
  it('accepts a valid plan from buildEditPlan', () => {
    const { plan } = buildEditPlan({ source_duration_sec: 60 });
    const result = validateEditPlan(plan);
    expect(result.ok).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('rejects null/undefined', () => {
    expect(validateEditPlan(null).ok).toBe(false);
    expect(validateEditPlan(undefined).ok).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = validateEditPlan({ version: 1, actions: [] });
    expect(result.ok).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('rejects actions array with zero items', () => {
    const result = validateEditPlan({
      version: 1,
      source_duration_sec: 60,
      actions: [],
      output: { format: 'mp4', resolution: '1080x1920', fps: 30 },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects action with end_sec beyond source_duration + 0.5', () => {
    const result = validateEditPlan({
      version: 1,
      source_duration_sec: 30,
      actions: [{ type: 'keep', start_sec: 0, end_sec: 35 }],
      output: { format: 'mp4', resolution: '1080x1920', fps: 30 },
    });
    expect(result.ok).toBe(false);
    expect(result.errors!.some(e => e.includes('exceeds source duration'))).toBe(true);
  });

  it('allows action with end_sec at source_duration + 0.5 (tolerance)', () => {
    const result = validateEditPlan({
      version: 1,
      source_duration_sec: 30,
      actions: [{ type: 'keep', start_sec: 0, end_sec: 30.5 }],
      output: { format: 'mp4', resolution: '1080x1920', fps: 30 },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects action with negative start_sec', () => {
    const result = validateEditPlan({
      version: 1,
      source_duration_sec: 30,
      actions: [{ type: 'cut', start_sec: -1, end_sec: 5 }],
      output: { format: 'mp4', resolution: '1080x1920', fps: 30 },
    });
    expect(result.ok).toBe(false);
    expect(result.errors!.some(e => e.includes('negative start_sec'))).toBe(true);
  });

  it('rejects action with end_sec <= start_sec', () => {
    const result = validateEditPlan({
      version: 1,
      source_duration_sec: 30,
      actions: [{ type: 'keep', start_sec: 10, end_sec: 5 }],
      output: { format: 'mp4', resolution: '1080x1920', fps: 30 },
    });
    expect(result.ok).toBe(false);
    expect(result.errors!.some(e => e.includes('end_sec') && e.includes('start_sec'))).toBe(true);
  });

  it('rejects overlapping keep segments', () => {
    const result = validateEditPlan({
      version: 1,
      source_duration_sec: 60,
      actions: [
        { type: 'keep', start_sec: 0, end_sec: 20 },
        { type: 'keep', start_sec: 15, end_sec: 40 }, // overlaps with previous
      ],
      output: { format: 'mp4', resolution: '1080x1920', fps: 30 },
    });
    expect(result.ok).toBe(false);
    expect(result.errors!.some(e => e.includes('Overlapping keep'))).toBe(true);
  });

  it('does NOT check overlap for broll (can overlay)', () => {
    const result = validateEditPlan({
      version: 1,
      source_duration_sec: 60,
      actions: [
        { type: 'keep', start_sec: 0, end_sec: 60 },
        { type: 'broll', start_sec: 5, end_sec: 10, asset_url: null },
        { type: 'broll', start_sec: 8, end_sec: 13, asset_url: null }, // overlaps, ok for broll
      ],
      output: { format: 'mp4', resolution: '1080x1920', fps: 30 },
    });
    expect(result.ok).toBe(true);
  });

  it('validates normalize_audio action (untimed — no time checks)', () => {
    const result = validateEditPlan({
      version: 1,
      source_duration_sec: 30,
      actions: [
        { type: 'keep', start_sec: 0, end_sec: 30 },
        { type: 'normalize_audio', target_lufs: -14, enabled: true },
      ],
      output: { format: 'mp4', resolution: '1080x1920', fps: 30 },
    });
    expect(result.ok).toBe(true);
  });

  it('returns parsed data on success', () => {
    const { plan } = buildEditPlan({ source_duration_sec: 60 });
    const result = validateEditPlan(plan);
    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.version).toBe(1);
  });
});
