import { PERSONAS } from '@/lib/script-expander';

/**
 * Customer archetypes for script rewriting.
 * Maps to specific voice styles and audience mindsets.
 */
export const CUSTOMER_ARCHETYPES: Record<string, { name: string; voice: string }> = {
  skeptic: {
    name: 'The Skeptic',
    voice: 'Starts doubtful, ends convinced. Uses "I thought this was BS" or "my friend kept telling me to try this". Relatable because everyone has been skeptical. The conversion moment is the emotional peak.',
  },
  sober_curious: {
    name: 'Sober Curious',
    voice: 'Exploring alternatives to alcohol with genuine curiosity. Speaks about wellness journeys without preaching. Uses "I decided to try something different" and "honestly, I didn\'t expect to feel this good". Open-minded, non-judgmental, discovery-focused.',
  },
  chronic_warrior: {
    name: 'Chronic Warrior',
    voice: 'Living with chronic pain or conditions, tough but hopeful. Uses "I\'ve tried everything the doctors gave me" and "some days are harder than others but...". Raw, honest about the struggle, celebrates small wins. Never victim energy — always fighter energy.',
  },
  honest_reviewer: {
    name: 'The Honest Reviewer',
    voice: 'Calm, measured, trustworthy. Speaks like someone who has tried dozens of products and finally found one worth recommending. Uses phrases like "I\'ve tried everything" and "here\'s the truth". Balanced — acknowledges downsides.',
  },
  educator: {
    name: 'The Educator',
    voice: 'Confident, knowledgeable but not condescending. Drops science or facts early. "Here\'s what 90% of people don\'t know..." or "Your doctor won\'t tell you this". Makes the viewer feel smarter.',
  },
  storyteller: {
    name: 'The Storyteller',
    voice: 'Narrative-driven, personal. Starts with a specific moment or timeline. "3 weeks ago I could barely..." or "Last month I was scrolling and...". Draws the viewer into a journey with a payoff.',
  },
  hype_man: {
    name: 'The Hype Man',
    voice: 'High energy, excited, almost disbelief. "BRO you need to see this" or "I literally can\'t stop talking about this". Unboxing energy. Infectious enthusiasm, lots of emphasis and repetition.',
  },
  relatable_friend: {
    name: 'The Relatable Friend',
    voice: 'Casual, low-key, talking to camera like texting a friend. Uses filler words naturally ("honestly", "like", "lowkey"). No hard sell — just sharing something they genuinely use. "Okay so I have to put you guys onto something".',
  },
};

export const VOICE_TONES: Record<string, { name: string; description: string }> = {
  conversational: {
    name: 'Conversational',
    description: 'Like talking to a friend. Casual, warm, natural pauses and filler words.',
  },
  authoritative: {
    name: 'Authoritative',
    description: 'Expert confidence. Facts-first, decisive, backed by knowledge.',
  },
  empathetic: {
    name: 'Empathetic',
    description: 'Understanding and warm. Validates feelings, shares vulnerability.',
  },
  high_energy: {
    name: 'High Energy',
    description: 'Excited, enthusiastic, fast-paced. Lots of emphasis and exclamation.',
  },
  educational: {
    name: 'Educational',
    description: 'Clear, informative, teaches something. "Did you know..." energy.',
  },
  raw_authentic: {
    name: 'Raw & Authentic',
    description: 'Unfiltered real talk. No polish, no script feel. Stream of consciousness.',
  },
};

/**
 * Resolve persona name and voice from a persona key.
 * Falls back to script-expander PERSONAS if not found in archetypes.
 */
export function resolvePersona(
  persona: string,
  customText?: string
): { name: string; voice: string } | null {
  if (persona === 'custom' && customText) {
    return { name: 'Custom', voice: customText };
  }

  const archetype = CUSTOMER_ARCHETYPES[persona];
  if (archetype) {
    return { name: archetype.name, voice: archetype.voice };
  }

  const expanderPersona = PERSONAS.find((p) => p.id === persona);
  if (expanderPersona) {
    return { name: expanderPersona.name, voice: expanderPersona.voice };
  }

  return null;
}
