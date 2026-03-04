import { describe, it, expect } from 'vitest';
import {
  PostmortemJSONSchema,
  safeValidatePostmortem,
  postmortemToMarkdown,
  type PostmortemJSON,
} from './generatePostmortem';

const VALID_POSTMORTEM: PostmortemJSON = {
  summary: 'Strong performance driven by curiosity hook and product reveal timing.',
  what_worked: ['Physical reveal hook created strong scroll-stop', 'Authentic reaction built trust'],
  what_failed: ['CTA was too early, missed peak engagement window'],
  hook_analysis: {
    hook_strength: 8,
    pattern_detected: 'physical reveal',
    scroll_stop_rating: 9,
    improvement: 'Add a verbal teaser before the reveal',
  },
  engagement_analysis: {
    engagement_rate: 6.2,
    comment_sentiment: 'positive',
    share_driver: 'Relatable product experience',
    save_driver: 'Useful product information',
  },
  next_ideas: ['Try question opener variant with same product', 'Test controversy lead for higher comment rate'],
  winner_candidate: true,
};

describe('PostmortemJSONSchema', () => {
  it('validates a correct postmortem object', () => {
    const result = PostmortemJSONSchema.safeParse(VALID_POSTMORTEM);
    expect(result.success).toBe(true);
  });

  it('requires at least 1 what_worked item', () => {
    const invalid = { ...VALID_POSTMORTEM, what_worked: [] };
    const result = PostmortemJSONSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('requires at least 1 next_ideas item', () => {
    const invalid = { ...VALID_POSTMORTEM, next_ideas: [] };
    const result = PostmortemJSONSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('allows empty what_failed array', () => {
    const valid = { ...VALID_POSTMORTEM, what_failed: [] };
    const result = PostmortemJSONSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('validates hook_strength range 0-10', () => {
    const tooHigh = {
      ...VALID_POSTMORTEM,
      hook_analysis: { ...VALID_POSTMORTEM.hook_analysis, hook_strength: 11 },
    };
    expect(PostmortemJSONSchema.safeParse(tooHigh).success).toBe(false);

    const tooLow = {
      ...VALID_POSTMORTEM,
      hook_analysis: { ...VALID_POSTMORTEM.hook_analysis, hook_strength: -1 },
    };
    expect(PostmortemJSONSchema.safeParse(tooLow).success).toBe(false);
  });

  it('validates scroll_stop_rating range 0-10', () => {
    const tooHigh = {
      ...VALID_POSTMORTEM,
      hook_analysis: { ...VALID_POSTMORTEM.hook_analysis, scroll_stop_rating: 15 },
    };
    expect(PostmortemJSONSchema.safeParse(tooHigh).success).toBe(false);
  });

  it('validates comment_sentiment enum', () => {
    const invalid = {
      ...VALID_POSTMORTEM,
      engagement_analysis: { ...VALID_POSTMORTEM.engagement_analysis, comment_sentiment: 'angry' },
    };
    expect(PostmortemJSONSchema.safeParse(invalid).success).toBe(false);
  });

  it('requires winner_candidate boolean', () => {
    const invalid = { ...VALID_POSTMORTEM, winner_candidate: 'yes' };
    expect(PostmortemJSONSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('safeValidatePostmortem', () => {
  it('returns ok: true for valid data', () => {
    const result = safeValidatePostmortem(VALID_POSTMORTEM);
    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.winner_candidate).toBe(true);
  });

  it('returns ok: false with error message for invalid data', () => {
    const result = safeValidatePostmortem({ summary: 'only summary' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.length).toBeGreaterThan(0);
  });
});

describe('postmortemToMarkdown', () => {
  it('generates markdown with all sections', () => {
    const md = postmortemToMarkdown(VALID_POSTMORTEM);
    expect(md).toContain('## AI Postmortem');
    expect(md).toContain('What Worked');
    expect(md).toContain("What Didn't Work");
    expect(md).toContain('Hook Analysis');
    expect(md).toContain('8/10');
    expect(md).toContain('physical reveal');
    expect(md).toContain('Engagement');
    expect(md).toContain('6.2%');
    expect(md).toContain('Next Ideas');
    expect(md).toContain('Winner Candidate');
  });

  it('omits what_failed section when empty', () => {
    const pm = { ...VALID_POSTMORTEM, what_failed: [] };
    const md = postmortemToMarkdown(pm);
    expect(md).not.toContain("What Didn't Work");
  });

  it('omits winner badge when not a winner', () => {
    const pm = { ...VALID_POSTMORTEM, winner_candidate: false };
    const md = postmortemToMarkdown(pm);
    expect(md).not.toContain('Winner Candidate');
  });
});
