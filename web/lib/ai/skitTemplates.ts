/**
 * Skit Templates Library
 *
 * Provides deterministic structure templates for skit generation.
 * Each template defines the expected beat count, overlay count, and b-roll count
 * to ensure consistent output regardless of AI variability.
 */

export interface SkitTemplate {
  id: string;
  name: string;
  description: string;
  beatsCount: number;
  overlayCount: number;
  brollCount: number;
  /** Prompt instructions specific to this template structure */
  structureGuidelines: string;
}

/**
 * All available skit templates
 */
export const SKIT_TEMPLATES: SkitTemplate[] = [
  {
    id: "argument-reveal",
    name: "Argument & Reveal",
    description: "Two people argue about a problem, then one reveals the product as the solution",
    beatsCount: 4,
    overlayCount: 2,
    brollCount: 2,
    structureGuidelines: `
STRUCTURE: Argument & Reveal (4 beats)
Beat 1 (0:00-0:05): Person A complains about a problem
Beat 2 (0:05-0:12): Person B argues back, escalating
Beat 3 (0:12-0:22): Person A reveals product as solution
Beat 4 (0:22-0:30): Both react positively, CTA
Overlays: Problem statement (beat 1), Product name (beat 3)
B-roll: Close-up of problem, Product in use
    `,
  },
  {
    id: "office-deadpan",
    name: "Office Deadpan",
    description: "Monotone office worker discovers product, delivers dry humor throughout",
    beatsCount: 5,
    overlayCount: 3,
    brollCount: 2,
    structureGuidelines: `
STRUCTURE: Office Deadpan (5 beats)
Beat 1 (0:00-0:04): Deadpan intro about mundane office life
Beat 2 (0:04-0:10): The "before" moment - suffering in monotone
Beat 3 (0:10-0:18): Discovery of product, slight eyebrow raise
Beat 4 (0:18-0:25): Deadpan enthusiasm about product benefits
Beat 5 (0:25-0:32): Unexpectedly sincere closing, CTA
Overlays: "Monday." (beat 1), Product highlight (beat 3), CTA (beat 5)
B-roll: Sad desk moment, Product glamour shot
    `,
  },
  {
    id: "infomercial-chaos",
    name: "Infomercial Chaos",
    description: "Self-aware parody where demonstrator fails at simple tasks until product saves them",
    beatsCount: 5,
    overlayCount: 3,
    brollCount: 3,
    structureGuidelines: `
STRUCTURE: Infomercial Chaos Parody (5 beats)
Beat 1 (0:00-0:05): "Are you tired of [simple task]?" with exaggerated struggle
Beat 2 (0:05-0:12): More comedic failures, things getting worse
Beat 3 (0:12-0:18): "But WAIT!" - product introduction
Beat 4 (0:18-0:25): Suddenly everything works perfectly (contrast)
Beat 5 (0:25-0:30): Cheesy thumbs up, self-aware wink, CTA
Overlays: "THERE HAS TO BE A BETTER WAY" (beat 2), Product name (beat 3), Price/CTA (beat 5)
B-roll: Struggle montage, Product hero shot, Happy ending
    `,
  },
  {
    id: "myth-vs-fact",
    name: "Myth vs Fact",
    description: "Debunk common misconceptions then reveal the product truth",
    beatsCount: 4,
    overlayCount: 4,
    brollCount: 2,
    structureGuidelines: `
STRUCTURE: Myth vs Fact (4 beats)
Beat 1 (0:00-0:07): State the myth/misconception with dramatic pause
Beat 2 (0:07-0:15): "Actually..." - debunk with facts
Beat 3 (0:15-0:23): Introduce product as the real solution
Beat 4 (0:23-0:30): Quick recap and CTA
Overlays: "MYTH:" (beat 1), "FACT:" (beat 2), Product name (beat 3), CTA (beat 4)
B-roll: Visual of myth scenario, Product demonstration
    `,
  },
  {
    id: "before-after-split",
    name: "Before/After Split",
    description: "Split-screen style comparison showing transformation",
    beatsCount: 4,
    overlayCount: 2,
    brollCount: 3,
    structureGuidelines: `
STRUCTURE: Before/After Split (4 beats)
Beat 1 (0:00-0:08): "Before" scenario - the struggle is real
Beat 2 (0:08-0:12): Transition moment - discovering product
Beat 3 (0:12-0:22): "After" scenario - life transformed
Beat 4 (0:22-0:28): Side-by-side comparison moment, CTA
Overlays: "BEFORE" (beat 1), "AFTER" (beat 3)
B-roll: Before struggle shot, Product shot, After success shot
    `,
  },
  {
    id: "confessional",
    name: "Confessional",
    description: "Direct-to-camera confession style, intimate and relatable",
    beatsCount: 4,
    overlayCount: 2,
    brollCount: 2,
    structureGuidelines: `
STRUCTURE: Confessional (4 beats)
Beat 1 (0:00-0:07): "Okay so I have to tell you something..." - build intrigue
Beat 2 (0:07-0:15): The confession - a relatable problem or secret
Beat 3 (0:15-0:23): The solution reveal - product introduction
Beat 4 (0:23-0:30): Genuine recommendation, whispered CTA
Overlays: Hook text (beat 1), CTA (beat 4)
B-roll: Reaction shot, Product close-up
    `,
  },
  {
    id: "fake-news-anchor",
    name: "Fake News Anchor",
    description: "Parody news broadcast reporting on the product as breaking news",
    beatsCount: 5,
    overlayCount: 3,
    brollCount: 2,
    structureGuidelines: `
STRUCTURE: Fake News Anchor (5 beats)
Beat 1 (0:00-0:05): "BREAKING NEWS" intro with serious face
Beat 2 (0:05-0:12): Report on the "problem epidemic" sweeping the nation
Beat 3 (0:12-0:20): "Experts have found a solution" - product reveal
Beat 4 (0:20-0:27): "Field reporter" testimonial or demo
Beat 5 (0:27-0:32): Back to anchor for serious CTA, slight smile break
Overlays: "BREAKING" (beat 1), "[LOCATION] - LIVE" (beat 4), CTA ticker (beat 5)
B-roll: News-style graphics, Product demonstration
    `,
  },
  {
    id: "speed-run-review",
    name: "Speed Run Review",
    description: "Fast-paced review hitting all key points in rapid succession",
    beatsCount: 6,
    overlayCount: 4,
    brollCount: 3,
    structureGuidelines: `
STRUCTURE: Speed Run Review (6 beats)
Beat 1 (0:00-0:03): "60 second review GO" - high energy start
Beat 2 (0:03-0:08): What it is (quick product intro)
Beat 3 (0:08-0:13): What's good (rapid-fire positives)
Beat 4 (0:13-0:18): What's mid (honest minor critique)
Beat 5 (0:18-0:23): Who it's for (target audience)
Beat 6 (0:23-0:28): Final verdict + CTA
Overlays: Timer graphic, "GOOD" (beat 3), "MEH" (beat 4), "VERDICT" (beat 6)
B-roll: Product unboxing, In-use shot, Close-up details
    `,
  },
  {
    id: "best-friend-roast",
    name: "Best Friend Roast",
    description: "Friend playfully roasts you then admits the product is actually good",
    beatsCount: 4,
    overlayCount: 2,
    brollCount: 2,
    structureGuidelines: `
STRUCTURE: Best Friend Roast (4 beats)
Beat 1 (0:00-0:07): Friend notices product, starts roasting
Beat 2 (0:07-0:15): Escalating jokes, playful teasing
Beat 3 (0:15-0:23): Friend tries product, reluctant admission it's good
Beat 4 (0:23-0:30): "Okay fine, where do I get one?" - CTA
Overlays: Friend's reaction (beat 3), CTA (beat 4)
B-roll: Skeptical face, Product in action
    `,
  },
  {
    id: "overheard-store",
    name: "Overheard at the Store",
    description: "Pretend to overhear/witness a conversation about the product",
    beatsCount: 4,
    overlayCount: 2,
    brollCount: 2,
    structureGuidelines: `
STRUCTURE: Overheard at the Store (4 beats)
Beat 1 (0:00-0:06): "POV: You're at [store] and you hear..." - setup
Beat 2 (0:06-0:14): The overheard conversation (someone raving about product)
Beat 3 (0:14-0:22): Your reaction - curiosity, then checking it out
Beat 4 (0:22-0:28): Conclusion - you're now a believer, CTA
Overlays: "POV:" (beat 1), CTA (beat 4)
B-roll: Store aisle shot, Product on shelf
    `,
  },
];

/**
 * Get a template by ID
 */
export function getSkitTemplate(templateId: string): SkitTemplate | null {
  return SKIT_TEMPLATES.find((t) => t.id === templateId) || null;
}

/**
 * Get all templates for UI display
 */
export function getAllSkitTemplates(): Pick<SkitTemplate, "id" | "name" | "description">[] {
  return SKIT_TEMPLATES.map(({ id, name, description }) => ({ id, name, description }));
}

/**
 * Validate that a skit matches template constraints
 */
export interface TemplateValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateSkitAgainstTemplate(
  skit: { beats?: unknown[]; overlays?: unknown[]; b_roll?: unknown[] },
  template: SkitTemplate
): TemplateValidationResult {
  const issues: string[] = [];

  const beatsCount = Array.isArray(skit.beats) ? skit.beats.length : 0;
  const overlaysCount = Array.isArray(skit.overlays) ? skit.overlays.length : 0;
  const brollCount = Array.isArray(skit.b_roll) ? skit.b_roll.length : 0;

  if (beatsCount !== template.beatsCount) {
    issues.push(`Expected ${template.beatsCount} beats, got ${beatsCount}`);
  }

  if (overlaysCount !== template.overlayCount) {
    issues.push(`Expected ${template.overlayCount} overlays, got ${overlaysCount}`);
  }

  if (brollCount !== template.brollCount) {
    issues.push(`Expected ${template.brollCount} b-roll items, got ${brollCount}`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Build template-specific prompt section
 */
export function buildTemplatePromptSection(template: SkitTemplate): string {
  return `
TEMPLATE: ${template.name}
${template.description}

${template.structureGuidelines}

IMPORTANT: You MUST output exactly:
- ${template.beatsCount} beats
- ${template.overlayCount} overlays
- ${template.brollCount} b-roll items

Do not deviate from these counts.
`;
}
