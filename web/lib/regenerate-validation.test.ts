import { describe, it, expect } from 'vitest';
import {
  extractOutline,
  buildOutlinePrompt,
  extractCtaKeywords,
  validateRegeneration,
} from './regenerate-validation';

const SAMPLE_SCRIPT = `[Looking at camera, casual vibe]
Okay so I have to put you guys onto something.

I've been dealing with back pain for like two years now. Tried everything — heating pads, stretches, even those sketchy Amazon gadgets.

Then my friend told me about this CBD balm from GreenLeaf. I was like, yeah right, another one of those.

But honestly? After three days I could actually sleep through the night again.

[Holds up product]
It's not a miracle cure, but for $35 it's the best thing I've found. Link in bio if you want to try it.`;

const SAMPLE_CTA = 'Link in bio if you want to try it';

const GOOD_VARIANT = `[Looking at camera, relaxed energy]
So real talk — I need to share something with you guys.

My back has been wrecked for almost two years. I tried everything under the sun — the patches, the exercises, random stuff off Amazon.

A buddy of mine kept pushing this CBD balm from GreenLeaf on me. I honestly thought it was gonna be trash.

But no joke? Three days later I was sleeping all night without waking up once.

[Shows the product]
Look, it's not gonna fix everything, but at $35 it's hands down the best option I've tried. Link in bio to check it out.`;

const BAD_VARIANT_DIFFERENT_TOPIC = `[Sitting at desk]
Let me tell you about the best protein powder I've ever tried.

I've been lifting for five years and nothing compares to MuscleMax. The chocolate flavor is insane.

Mix it with almond milk and you've got yourself a perfect post-workout shake.

[Flexing]
Use code GAINS20 for 20% off your first order.`;

describe('extractOutline', () => {
  it('splits script into sections on double newlines', () => {
    const sections = extractOutline(SAMPLE_SCRIPT);
    expect(sections.length).toBeGreaterThanOrEqual(4);
    expect(sections[0]).toContain('put you guys onto something');
  });

  it('handles single-paragraph scripts by splitting on newlines', () => {
    const single = 'Line one\nLine two\nLine three';
    const sections = extractOutline(single);
    expect(sections).toHaveLength(3);
  });
});

describe('buildOutlinePrompt', () => {
  it('returns numbered outline', () => {
    const outline = buildOutlinePrompt(SAMPLE_SCRIPT);
    expect(outline).toContain('1.');
    expect(outline).toContain('2.');
  });
});

describe('extractCtaKeywords', () => {
  it('extracts meaningful keywords from CTA', () => {
    const kw = extractCtaKeywords(SAMPLE_CTA);
    expect(kw).toContain('link');
    expect(kw).toContain('bio');
    expect(kw).toContain('try');
    // Should not contain stop words
    expect(kw).not.toContain('if');
    expect(kw).not.toContain('you');
  });

  it('returns empty array for empty CTA', () => {
    expect(extractCtaKeywords('')).toEqual([]);
  });
});

describe('validateRegeneration', () => {
  it('passes for a good variant of the same script', () => {
    const result = validateRegeneration(
      SAMPLE_SCRIPT,
      SAMPLE_CTA,
      GOOD_VARIANT,
      'Link in bio to check it out'
    );
    expect(result.passed).toBe(true);
    expect(result.sectionCountOk).toBe(true);
    expect(result.ctaKeywordsOk).toBe(true);
    expect(result.lengthOk).toBe(true);
  });

  it('fails for a completely different script', () => {
    const result = validateRegeneration(
      SAMPLE_SCRIPT,
      SAMPLE_CTA,
      BAD_VARIANT_DIFFERENT_TOPIC,
      'Use code GAINS20 for 20% off your first order'
    );
    // Should fail on CTA keywords and/or section count and/or length
    expect(result.passed).toBe(false);
  });

  it('fails when length is wildly different', () => {
    const shortScript = 'Hey check out this CBD balm. Link in bio.';
    const result = validateRegeneration(
      SAMPLE_SCRIPT,
      SAMPLE_CTA,
      shortScript,
      'Link in bio'
    );
    expect(result.lengthOk).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('reports details on failure', () => {
    const result = validateRegeneration(
      SAMPLE_SCRIPT,
      SAMPLE_CTA,
      BAD_VARIANT_DIFFERENT_TOPIC,
      'Use code GAINS20'
    );
    expect(result.details).not.toBe('All checks passed');
  });
});
