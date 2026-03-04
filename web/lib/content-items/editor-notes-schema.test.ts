import { describe, it, expect } from 'vitest';
import {
  validateEditorNotesJSON,
  safeValidateEditorNotesJSON,
  editorNotesToMarkdown,
  type EditorNotesJSON,
} from './editor-notes-schema';

const VALID_NOTES: EditorNotesJSON = {
  summary: 'A short video about product benefits',
  editing_style: {
    pace: 'fast',
    jump_cut_recommendation: 'Cut every 3-5 seconds for TikTok energy',
    music_sfx_notes: 'Upbeat lo-fi background, whoosh on transitions',
  },
  timeline: [
    {
      start_sec: 0,
      end_sec: 5,
      label: 'keep',
      note: 'Strong hook, keep as-is',
      broll: null,
      on_screen_text: 'POV: You discover this',
    },
    {
      start_sec: 5,
      end_sec: 15,
      label: 'tighten',
      note: 'Reduce dead air around 8s mark',
      broll: 'Product close-up shot',
      on_screen_text: null,
    },
    {
      start_sec: 15,
      end_sec: 30,
      label: 'cut',
      note: 'Retake of same section exists at 45s',
      broll: null,
      on_screen_text: null,
    },
  ],
  mistakes_retakes: [
    { at_sec: 18, issue: 'Stumbled on product name', fix: 'Use take from 45s instead' },
  ],
  broll_pack: [
    { at_sec: 10, type: 'product', prompt: 'Close-up of product packaging' },
    { at_sec: 25, type: 'lifestyle', prompt: 'Person using product in daily routine' },
  ],
  caption: {
    primary: 'This changed everything for me',
    alt: 'I was skeptical but now I get it',
  },
  hashtags: ['#product', '#review', '#honest', '#viral', '#fyp'],
  cta: { at_sec: 28, line: 'Link in bio for 20% off!' },
  comment_bait: {
    safe: ['Has anyone else tried this?', 'What do you think?'],
    spicy: ['Bet you cant name a better one', 'This beats the expensive version'],
    chaotic: ['My doctor said to stop but I cant', 'I replaced ALL my meals with this'],
  },
};

describe('EditorNotesJSON Schema', () => {
  it('validates a correct schema', () => {
    const result = validateEditorNotesJSON(VALID_NOTES);
    expect(result.summary).toBe('A short video about product benefits');
    expect(result.timeline).toHaveLength(3);
    expect(result.hashtags).toHaveLength(5);
    expect(result.comment_bait.safe).toHaveLength(2);
  });

  it('rejects missing summary', () => {
    const invalid = { ...VALID_NOTES, summary: undefined };
    const result = safeValidateEditorNotesJSON(invalid);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('summary');
  });

  it('rejects too few hashtags', () => {
    const invalid = { ...VALID_NOTES, hashtags: ['#one', '#two'] };
    const result = safeValidateEditorNotesJSON(invalid);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('hashtags');
  });

  it('rejects too many hashtags', () => {
    const invalid = {
      ...VALID_NOTES,
      hashtags: Array.from({ length: 15 }, (_, i) => `#tag${i}`),
    };
    const result = safeValidateEditorNotesJSON(invalid);
    expect(result.ok).toBe(false);
  });

  it('rejects too few comment bait per tier', () => {
    const invalid = {
      ...VALID_NOTES,
      comment_bait: { safe: ['one'], spicy: ['one', 'two'], chaotic: ['one', 'two'] },
    };
    const result = safeValidateEditorNotesJSON(invalid);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('safe');
  });

  it('rejects invalid timeline label', () => {
    const invalid = {
      ...VALID_NOTES,
      timeline: [{ start_sec: 0, end_sec: 5, label: 'invalid_label', note: 'test' }],
    };
    const result = safeValidateEditorNotesJSON(invalid);
    expect(result.ok).toBe(false);
  });

  it('rejects invalid broll_pack type', () => {
    const invalid = {
      ...VALID_NOTES,
      broll_pack: [{ at_sec: 10, type: 'invalid_type', prompt: 'test' }],
    };
    const result = safeValidateEditorNotesJSON(invalid);
    expect(result.ok).toBe(false);
  });

  it('accepts optional broll/on_screen_text as null', () => {
    const notes = {
      ...VALID_NOTES,
      timeline: [{
        start_sec: 0,
        end_sec: 10,
        label: 'keep' as const,
        note: 'Good section',
        broll: null,
        on_screen_text: null,
      }],
    };
    const result = safeValidateEditorNotesJSON(notes);
    expect(result.ok).toBe(true);
  });

  it('accepts broll/on_screen_text omitted entirely', () => {
    const notes = {
      ...VALID_NOTES,
      timeline: [{
        start_sec: 0,
        end_sec: 10,
        label: 'keep' as const,
        note: 'Good section',
      }],
    };
    const result = safeValidateEditorNotesJSON(notes);
    expect(result.ok).toBe(true);
    expect(result.data!.timeline[0].broll).toBeNull();
  });
});

describe('editorNotesToMarkdown', () => {
  it('produces markdown with all sections', () => {
    const md = editorNotesToMarkdown(VALID_NOTES);
    expect(md).toContain('## Editor Notes');
    expect(md).toContain('A short video about product benefits');
    expect(md).toContain('### Editing Style');
    expect(md).toContain('fast');
    expect(md).toContain('### Timeline');
    expect(md).toContain('keep');
    expect(md).toContain('### Mistakes / Retakes');
    expect(md).toContain('Stumbled');
    expect(md).toContain('### B-Roll Pack');
    expect(md).toContain('product');
    expect(md).toContain('### Caption');
    expect(md).toContain('This changed everything');
    expect(md).toContain('### Hashtags');
    expect(md).toContain('#product');
    expect(md).toContain('### CTA');
    expect(md).toContain('Link in bio');
    expect(md).toContain('### Comment Bait');
    expect(md).toContain('Safe');
    expect(md).toContain('Spicy');
    expect(md).toContain('Chaotic');
  });
});

describe('safeValidateEditorNotesJSON', () => {
  it('returns ok: true for valid data', () => {
    const result = safeValidateEditorNotesJSON(VALID_NOTES);
    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('returns ok: false with error string for invalid data', () => {
    const result = safeValidateEditorNotesJSON({});
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
  });
});
