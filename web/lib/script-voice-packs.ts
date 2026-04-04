/**
 * Script Voice Packs
 *
 * Rich persona definitions for script generation.
 * Each voice pack includes speaking style, vocabulary, rhythm,
 * attitude, anti-patterns, example phrasing, and CTA style.
 *
 * These replace the thin one-liner PERSONAS from script-expander.ts.
 * The original PERSONAS/pickPersona exports remain untouched for
 * backward compatibility — this module provides the richer prompt
 * context for generateUnifiedScript.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoicePack {
  id: string;
  name: string;
  /** How this persona talks — cadence, energy, formality */
  speakingStyle: string;
  /** Words/phrases this persona naturally uses */
  vocabularyTendencies: string[];
  /** Rhythm patterns — sentence structure tendencies */
  rhythmNotes: string;
  /** Filler words and verbal tics */
  fillerTendencies: string[];
  /** Core attitude toward the product/viewer */
  attitude: string;
  /** What this persona would NEVER say */
  avoids: string[];
  /** 3-4 example phrasing patterns (not exact scripts — structural patterns) */
  examplePatterns: string[];
  /** How this persona closes / does CTAs */
  ctaStyle: string;
  /** Best structural patterns for this persona */
  preferredStructures: string[];
}

// ---------------------------------------------------------------------------
// Voice Packs
// ---------------------------------------------------------------------------

export const VOICE_PACKS: VoicePack[] = [
  {
    id: 'honest_reviewer',
    name: 'The Honest Reviewer',
    speakingStyle: 'Measured, unhurried, deliberate. Speaks like someone who has tested dozens of products and is genuinely surprised when something works. Not excited — impressed. Calm authority with occasional dry humor.',
    vocabularyTendencies: [
      'actually', 'genuinely', 'and I mean that', 'for real',
      'I was skeptical', 'here\'s the thing though', 'in my experience',
      'after [time period]', 'the difference is', 'what surprised me',
    ],
    rhythmNotes: 'Medium-length sentences. Occasional pause for emphasis. Builds credibility before the recommendation. Not afraid of silence.',
    fillerTendencies: ['honestly', 'look', 'and I\'ll be straight with you', 'real talk'],
    attitude: 'Earned trust. Not trying to sell — trying to share a conclusion they arrived at through experience. Slightly protective of their credibility.',
    avoids: [
      'OMG', 'literally dying', 'obsessed', 'life changing',
      'you NEED this', 'best thing ever', 'game changer',
      'exclamation-heavy language', 'hype without substance',
    ],
    examplePatterns: [
      'I\'ve gone through [number] of these and this is the first one that [specific result]',
      '[Acknowledgment of downside]. That said, [specific benefit] makes it worth it',
      'After [timeframe] of using this, here\'s what I noticed that nobody talks about',
      'The reason I keep coming back to this over [competitor] is [specific detail]',
    ],
    ctaStyle: 'Low-pressure, informational. "I linked it if you want to check it out" or "It\'s in the shop tab — do what you want with that info." Never pushy.',
    preferredStructures: ['objection_reversal', 'confession_proof', 'cold_open_payoff'],
  },
  {
    id: 'skeptic_convert',
    name: 'The Skeptic Convert',
    speakingStyle: 'Starts dismissive or eye-rolling, gradually shifts to reluctant admission, ends genuinely convinced. Energy builds throughout. The conversion moment is raw and unguarded.',
    vocabularyTendencies: [
      'I thought this was', 'my friend wouldn\'t shut up about',
      'I finally caved', 'okay fine', 'I hate admitting this but',
      'I was wrong', 'it actually', 'three weeks in',
      'I didn\'t expect', 'the thing that got me was',
    ],
    rhythmNotes: 'Short dismissive sentences at the start. Sentences get longer and more detailed as conviction builds. The turn is a single short sentence.',
    fillerTendencies: ['like', 'whatever', 'fine', 'I guess', 'okay but'],
    attitude: 'Reluctantly impressed. Doesn\'t want to be seen as someone who falls for products. The recommendation carries weight because it was hard-won.',
    avoids: [
      'instant believer language', 'first-try enthusiasm',
      'brand-speak', 'unboxing excitement', 'too-smooth delivery',
      'sounding like they were paid to say this',
    ],
    examplePatterns: [
      'My [person] has been on my case about this for [time]. I finally tried it and... okay',
      'I rolled my eyes at this for months. Then I [specific experience]',
      'Not gonna pretend I wasn\'t the biggest hater. But [specific result] changed my mind',
      '[Dismissive statement]. [Time skip]. [Reluctant admission with specific evidence]',
    ],
    ctaStyle: 'Grudging endorsement. "I hate that I\'m saying this but the link is right there" or "Don\'t come at me but it\'s in the basket." Maintains skeptic identity.',
    preferredStructures: ['objection_reversal', 'story_twist', 'pain_agitation_fix'],
  },
  {
    id: 'educator',
    name: 'The Educator',
    speakingStyle: 'Confident but not condescending. Drops a fact or insight early to establish authority, then makes it practical. Speaks with the energy of someone who actually cares about the topic, not just the product.',
    vocabularyTendencies: [
      'here\'s what most people get wrong', 'the reason this works is',
      'what the research shows', 'think about it this way',
      'the ingredient that matters here', 'most brands skip this',
      'fun fact', 'the difference between', 'what actually happens is',
    ],
    rhythmNotes: 'Alternates between explanatory sentences and punchy takeaways. Uses the "setup → reveal" pattern frequently. Pauses before key facts for emphasis.',
    fillerTendencies: ['so', 'right', 'here\'s the thing', 'think of it like'],
    attitude: 'Genuinely wants the viewer to understand something. The product is the proof, not the point. Teaching first, selling second.',
    avoids: [
      'dumbing down too much', 'being preachy', 'sounding like a textbook',
      'using jargon without explaining', 'empty authority claims',
      'your doctor won\'t tell you', 'they don\'t want you to know',
    ],
    examplePatterns: [
      '[Common misconception]. Actually, [corrected fact]. That\'s why [product connection]',
      'Most [product category] does [common thing]. This one does [different thing] because [reason]',
      'The ingredient you should be looking for is [specific]. Here\'s why it matters for [audience]',
      '[Question the viewer probably has]. Short answer: [answer]. Here\'s what that means for you',
    ],
    ctaStyle: 'Knowledge-empowered. "Now you know what to look for — I linked the one I use" or "Check the ingredients on yours and compare." Positions the viewer as smart.',
    preferredStructures: ['demo_explain', 'cold_open_payoff', 'objection_reversal'],
  },
  {
    id: 'storyteller',
    name: 'The Storyteller',
    speakingStyle: 'Narrative-driven, grounded in specific moments and timelines. Opens in the middle of a scene, not at the beginning. Sensory details. Makes the viewer feel like they\'re in the moment.',
    vocabularyTendencies: [
      'three weeks ago', 'I was standing in', 'that\'s when',
      'the moment I realized', 'fast forward to', 'here\'s the part nobody knows',
      'I remember', 'and then', 'the thing is',
    ],
    rhythmNotes: 'Longer flowing sentences for scene-setting, sharp short sentences for turning points. Uses time jumps strategically. Builds tension before the payoff.',
    fillerTendencies: ['so', 'and honestly', 'I kid you not', 'not even joking'],
    attitude: 'Sharing something personal that happens to involve a product. The story is the point — the product is the tool that made it possible.',
    avoids: [
      'starting from the very beginning', 'vague timelines',
      'telling instead of showing', 'skipping the specific details that make it real',
      'forced happy endings', 'stories that sound made up',
    ],
    examplePatterns: [
      '[Specific moment in time + location]. I had no idea [product] was about to [change]',
      'Rewind to [time period]. I was [specific situation]. That\'s when [discovery]',
      'The text from my [person] said [specific quote]. [Time] later, [result]',
      '[Sensory detail about the problem]. [Time skip]. [Sensory detail about the solution]',
    ],
    ctaStyle: 'Story continuation. "If you want the same chapter I got, link\'s in the basket" or "Your version of this starts right there." Invites the viewer into their own story.',
    preferredStructures: ['story_twist', 'confession_proof', 'cold_open_payoff'],
  },
  {
    id: 'hype_man',
    name: 'The Hype Man',
    speakingStyle: 'High energy, rapid delivery, genuine excitement that borders on disbelief. Speaks fast but clearly. Not performing — actually can\'t contain themselves. Emphasis through repetition and volume shifts.',
    vocabularyTendencies: [
      'bro', 'no because', 'wait wait wait', 'look at this',
      'I\'m not even done', 'and THEN', 'you\'re not ready for this',
      'this right here', 'dead serious', 'I said what I said',
    ],
    rhythmNotes: 'Rapid-fire short sentences. Occasional ALL CAPS energy in key words. Builds momentum — each line should feel faster than the last. Brief pauses only for dramatic effect.',
    fillerTendencies: ['yo', 'no literally', 'I\'m telling you', 'dead serious', 'fam'],
    attitude: 'Infectious enthusiasm about a genuine discovery. Not salesy — just can\'t shut up about something good. The energy IS the persuasion.',
    avoids: [
      'calm measured delivery', 'long explanations', 'nuanced pros and cons',
      'anything that slows momentum', 'corporate enthusiasm',
      'fake surprise', 'scripted excitement',
    ],
    examplePatterns: [
      '[Exclamation about product]. No because [specific thing]. AND [another specific thing]',
      'You know what I\'m tired of? [Common frustration]. THIS [product] right here though',
      '[Shows product] This. Right. Here. [Lists 2-3 rapid benefits]',
      'I\'ve shown this to [number] people this week and every single one of them [reaction]',
    ],
    ctaStyle: 'Urgent and direct. "Yellow basket. Right now. Before they sell out again" or "Go. Go go go. Link right there." Short commanding sentences.',
    preferredStructures: ['demo_explain', 'pain_agitation_fix', 'cold_open_payoff'],
  },
  {
    id: 'relatable_friend',
    name: 'The Relatable Friend',
    speakingStyle: 'Casual, meandering, like a voice note to their best friend. Comfortable silence. Thinks out loud. Not performing for an audience — just sharing. Grammar is optional.',
    vocabularyTendencies: [
      'okay so', 'you know how', 'I\'m not even lying',
      'lowkey', 'highkey', 'the thing is right',
      'I put you guys onto', 'hear me — ', 'it just hits different',
      'it\'s giving', 'no thoughts just',
    ],
    rhythmNotes: 'Uneven sentence lengths. Starts sentences and restarts them. Uses dashes and ellipses naturally. Thoughts tumble out. Not polished — authentic.',
    fillerTendencies: ['like', 'honestly', 'literally', 'idk', 'or whatever', 'you know'],
    attitude: 'Zero sales pressure. Just sharing something they use because they genuinely like it. Would feel weird making it a "thing." The recommendation is offhand.',
    avoids: [
      'structured pitches', 'too-organized delivery', 'sounding rehearsed',
      'formal vocabulary', 'marketing frameworks', 'anything that sounds like an ad',
      'perfectly parallel sentences',
    ],
    examplePatterns: [
      'Okay wait — you know how [relatable situation]? [Product mention] and honestly... yeah',
      'Nobody asked but I\'m telling you anyway — [casual product mention with specific detail]',
      '[Mundane moment]. [Product naturally enters the scene]. [Casual observation about it working]',
      'I wasn\'t even gonna post this but [specific result] and I felt like I had to',
    ],
    ctaStyle: 'Offhand mention. "It\'s linked or whatever" or "Shop tab if you\'re curious, no pressure" or "I\'ll drop the link — do with it what you will." Maximum casual.',
    preferredStructures: ['confession_proof', 'story_twist', 'demo_explain'],
  },
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const VOICE_PACK_MAP = new Map(VOICE_PACKS.map(v => [v.id, v]));

/** Get the rich voice pack for a persona ID. Falls back to relatable_friend. */
export function getVoicePack(personaId: string): VoicePack {
  return VOICE_PACK_MAP.get(personaId) || VOICE_PACKS[5]; // relatable_friend default
}

/** Build the persona prompt section from a voice pack. */
export function buildVoicePackPrompt(pack: VoicePack): string {
  const lines = [
    `=== CREATOR VOICE: ${pack.name} ===`,
    '',
    `SPEAKING STYLE: ${pack.speakingStyle}`,
    '',
    `VOCABULARY — words/phrases this person naturally uses:`,
    ...pack.vocabularyTendencies.map(v => `  "${v}"`),
    '',
    `RHYTHM: ${pack.rhythmNotes}`,
    '',
    `NATURAL FILLERS: ${pack.fillerTendencies.join(', ')}`,
    '',
    `ATTITUDE: ${pack.attitude}`,
    '',
    `THIS PERSONA NEVER:`,
    ...pack.avoids.map(a => `  - ${a}`),
    '',
    `EXAMPLE PHRASING PATTERNS (study the structure, not the words):`,
    ...pack.examplePatterns.map(e => `  • ${e}`),
    '',
    `CTA STYLE: ${pack.ctaStyle}`,
    '===',
  ];
  return lines.join('\n');
}
