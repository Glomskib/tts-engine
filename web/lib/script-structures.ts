/**
 * Script Structure Patterns
 *
 * Defines multiple structural patterns for scripts beyond the rigid
 * hook → setup → body → CTA. The system selects a structure based on
 * persona, content type, vibe, and randomization.
 *
 * Each structure maps to the same JSON output fields (hook, setup, body, cta)
 * but gives the AI a different narrative arc to follow.
 */

export interface ScriptStructure {
  id: string;
  name: string;
  /** One-line description of the narrative arc */
  arc: string;
  /** What goes in each output field for this structure */
  fieldGuide: {
    hook: string;
    setup: string;
    body: string;
    cta: string;
  };
  /** Content types this works well with */
  bestFor: string[];
}

export const SCRIPT_STRUCTURES: ScriptStructure[] = [
  {
    id: 'classic',
    name: 'Hook → Setup → Body → CTA',
    arc: 'Traditional short-form structure. Grab attention, establish context, deliver the pitch, close with action.',
    fieldGuide: {
      hook: 'Scroll-stopping opening line — the first 3 seconds',
      setup: 'Problem or context that draws them in (5-10 seconds)',
      body: 'Main pitch with product specifics, demo, or proof (15-30 seconds)',
      cta: 'Natural call to action (3-5 seconds)',
    },
    bestFor: ['educational', 'how-to', 'comparison'],
  },
  {
    id: 'cold_open_payoff',
    name: 'Cold Open → Payoff',
    arc: 'Start with a striking result, reaction, or claim with ZERO context. Let curiosity build. Then explain how you got there. The product is the reveal.',
    fieldGuide: {
      hook: 'The result, reaction, or bold claim — no context, no setup. Drop the viewer into the middle',
      setup: 'Brief rewind — the 10-second backstory that makes the hook make sense',
      body: 'The product reveal + how it connects to the opening moment. Specifics and proof',
      cta: 'Ride the payoff energy into the close',
    },
    bestFor: ['testimonial', 'transformation', 'unboxing'],
  },
  {
    id: 'objection_reversal',
    name: 'Objection → Reversal → Reveal',
    arc: 'Start with the viewer\'s skepticism or objection. Voice it for them. Then systematically dismantle it with specific evidence. End with the product as the proof.',
    fieldGuide: {
      hook: 'The objection or skepticism voiced directly — "I know what you\'re thinking..."',
      setup: 'Acknowledge why the skepticism is valid. Show you get it',
      body: 'The reversal — specific evidence, personal experience, or data that changes the conclusion',
      cta: 'Confident close that lets the evidence speak',
    },
    bestFor: ['educational', 'myth-busting', 'comparison'],
  },
  {
    id: 'demo_explain',
    name: 'Demo First → Explanation Second',
    arc: 'Show the product doing its thing IMMEDIATELY. No talking, no setup. Let the visual hook. Then explain what they just saw and why it matters.',
    fieldGuide: {
      hook: 'Pure visual action — the product working, the result happening. Stage direction for the demo',
      setup: 'First words spoken — react to what you just showed. "See that?" energy',
      body: 'Now explain what they saw, why it works, what makes this different',
      cta: 'Quick close while the demo is still fresh in their mind',
    },
    bestFor: ['how-to', 'transformation', 'unboxing', 'trend'],
  },
  {
    id: 'confession_proof',
    name: 'Confession → Proof → CTA',
    arc: 'Start with a personal admission that creates vulnerability and trust. Then back it up with undeniable proof or results. The confession makes the proof land harder.',
    fieldGuide: {
      hook: 'The confession — something slightly embarrassing, surprising, or vulnerable about your relationship with this product/problem',
      setup: 'Lean into the confession — make it specific and human',
      body: 'The proof that justifies the confession. Results, timeline, specifics. The "but here\'s what happened" moment',
      cta: 'Close from a place of earned trust',
    },
    bestFor: ['testimonial', 'comedy', 'trend'],
  },
  {
    id: 'story_twist',
    name: 'Story → Twist → Recommendation',
    arc: 'Tell a short, specific story with a genuine turning point. The twist is the discovery of the product or result. Recommendation comes from lived experience, not sales.',
    fieldGuide: {
      hook: 'Drop into the story mid-scene. A specific moment, place, or conversation',
      setup: 'Build the story — enough detail to make it feel real, not enough to bore',
      body: 'The twist — the unexpected discovery, result, or realization. Product enters naturally',
      cta: 'Recommendation as a continuation of the story, not a separate sales pitch',
    },
    bestFor: ['testimonial', 'comedy', 'transformation'],
  },
  {
    id: 'pain_agitation_fix',
    name: 'Pain → Agitation → Fix → Close',
    arc: 'Name the pain. Make it worse by describing all the failed solutions. Then present the fix that actually worked. Fast, direct, no fluff.',
    fieldGuide: {
      hook: 'The pain — specific, visceral, relatable. Make them feel it immediately',
      setup: 'Agitation — everything they\'ve already tried that didn\'t work. Stack the frustration',
      body: 'The fix — this specific product, this specific result, this specific timeline',
      cta: 'Direct close. No dancing around it',
    },
    bestFor: ['educational', 'how-to', 'comparison'],
  },
];

const STRUCTURE_MAP = new Map(SCRIPT_STRUCTURES.map(s => [s.id, s]));

/**
 * Select a script structure based on persona, content type, and optional vibe.
 */
export function selectStructure(
  personaId: string,
  contentType?: string,
  preferredIds?: string[],
): ScriptStructure {
  // If persona has preferred structures, weight toward those
  const candidates = preferredIds && preferredIds.length > 0
    ? preferredIds.map(id => STRUCTURE_MAP.get(id)).filter(Boolean) as ScriptStructure[]
    : SCRIPT_STRUCTURES;

  // If content type matches, prefer those structures
  if (contentType) {
    const contentMatches = candidates.filter(s =>
      s.bestFor.some(b => contentType.toLowerCase().includes(b))
    );
    if (contentMatches.length > 0) {
      return contentMatches[Math.floor(Math.random() * contentMatches.length)];
    }
  }

  // Random from candidates
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Build the structure prompt section. */
export function buildStructurePrompt(structure: ScriptStructure): string {
  return [
    `=== SCRIPT STRUCTURE: ${structure.name} ===`,
    `Arc: ${structure.arc}`,
    '',
    `What goes in each field:`,
    `  "hook": ${structure.fieldGuide.hook}`,
    `  "setup": ${structure.fieldGuide.setup}`,
    `  "body": ${structure.fieldGuide.body}`,
    `  "cta": ${structure.fieldGuide.cta}`,
    '===',
  ].join('\n');
}
