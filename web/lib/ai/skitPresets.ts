/**
 * Skit Character Presets
 *
 * Internal fictional character archetypes for consistent skit generation.
 * These are NOT real people - they are comedic archetypes owned by the platform.
 *
 * IMPORTANT: Never imitate real celebrities, influencers, or public figures.
 * All characters are original fictional creations.
 */

export type EnergyCategory = "neutral" | "high_energy" | "deadpan" | "chaotic" | "wholesome";

export interface SkitPreset {
  id: string;
  name: string;
  description: string;
  /** Energy category for UI grouping */
  energy_category: EnergyCategory;
  /** Default template to use if none specified */
  default_template_id: string | null;
  /** Default intensity for this character */
  intensity_default: number;
  /** Minimum intensity allowed for this character */
  intensity_min: number;
  /** Maximum intensity allowed for this character */
  intensity_max: number;
  /** Short bullet rules injected into prompt */
  prompt_rules: string[];
}

/**
 * All available character presets
 */
export const SKIT_PRESETS: SkitPreset[] = [
  // === NEUTRAL ===
  {
    id: "NONE",
    name: "No Personality",
    description: "Plain friendly narrator, no specific persona",
    energy_category: "neutral",
    default_template_id: null,
    intensity_default: 50,
    intensity_min: 0,
    intensity_max: 100,
    prompt_rules: [
      "Write as a friendly, relatable narrator",
      "Keep tone conversational and authentic",
      "No specific character voice or catchphrases",
    ],
  },
  {
    id: "STREET_INTERVIEW",
    name: "Street Interview",
    description: "Quick person-on-the-street Q&A format with genuine reactions",
    energy_category: "neutral",
    default_template_id: "overheard-store",
    intensity_default: 50,
    intensity_min: 25,
    intensity_max: 70,
    prompt_rules: [
      "Format: Quick person-on-the-street interview style",
      "Interviewer asks simple questions, gets genuine-feeling reactions",
      "Mix of skeptical and enthusiastic 'random people' responses",
      "Keep responses short and punchy - TikTok attention span",
      "Style: Authentic reactions, quick cuts, real-talk energy",
      "End with the most enthusiastic or surprising response",
    ],
  },

  // === HIGH ENERGY ===
  {
    id: "DR_PICKLE",
    name: "Dr. Pickle",
    description: "Quirky lab hobbyist who gets excited about discoveries (NOT a medical authority)",
    energy_category: "high_energy",
    default_template_id: "myth-vs-fact",
    intensity_default: 65,
    intensity_min: 40,
    intensity_max: 85,
    prompt_rules: [
      "Dr. Pickle is a quirky 'lab hobbyist' - NOT a real doctor or medical professional",
      "Gets overly excited about simple discoveries, treats mundane things like breakthroughs",
      "Wears a lab coat covered in pickle stickers (purely comedic)",
      "Catchphrase: 'Now THAT'S what I call a big dill!'",
      "NEVER give medical advice or make health claims",
      "Style: Enthusiastic, slightly nerdy, theatrical pauses for 'dramatic effect'",
    ],
  },
  {
    id: "CASH_KING",
    name: "Cash King",
    description: "Flashy deal hunter who celebrates savings like winning the lottery",
    energy_category: "high_energy",
    default_template_id: "infomercial-chaos",
    intensity_default: 75,
    intensity_min: 50,
    intensity_max: 95,
    prompt_rules: [
      "Cash King is a flashy, over-the-top 'deal hunter' character",
      "Wears obviously fake plastic gold chains (self-aware parody)",
      "Treats finding good products like winning the lottery",
      "Catchphrase: 'Ka-CHING, baby!'",
      "Self-aware parody of infomercial hosts - never take seriously",
      "Style: High energy, comedic bragging, celebrates savings dramatically",
    ],
  },
  {
    id: "INFOMERCIAL_CHAOS",
    name: "Infomercial Chaos",
    description: "Self-aware parody host where everything hilariously goes wrong",
    energy_category: "high_energy",
    default_template_id: "infomercial-chaos",
    intensity_default: 80,
    intensity_min: 60,
    intensity_max: 100,
    prompt_rules: [
      "Self-aware parody of late-night infomercials",
      "The demonstrator comically struggles with simple everyday tasks",
      "Everything goes wrong until the product 'saves the day'",
      "Example style: 'Are you tired of [simple task]? I was! I once spent THREE HOURS trying to [basic thing]. My neighbors called authorities.'",
      "Style: Exaggerated incompetence, dramatic failures, product as unlikely hero",
      "Knows it's a parody - wink at the camera, self-aware humor",
    ],
  },
  {
    id: "UNHINGED_OPTIMIST",
    name: "Unhinged Optimist",
    description: "Aggressively positive person who finds silver linings in disasters",
    energy_category: "high_energy",
    default_template_id: null,
    intensity_default: 75,
    intensity_min: 55,
    intensity_max: 100,
    prompt_rules: [
      "Aggressively, almost unsettlingly positive about EVERYTHING",
      "Finds silver linings in disasters: 'My car exploded but at least I got my steps in!'",
      "Smile never wavers even when describing chaos",
      "Makes uncomfortable amount of eye contact",
      "Catchphrases: 'You know what? GREAT!' / 'This is actually perfect!'",
      "Style: Manic positivity, refuses to acknowledge problems, somehow inspiring",
    ],
  },
  {
    id: "GEN_Z_TRANSLATOR",
    name: "Gen Z Translator",
    description: "Explains everything using only current slang and references",
    energy_category: "high_energy",
    default_template_id: null,
    intensity_default: 70,
    intensity_min: 45,
    intensity_max: 90,
    prompt_rules: [
      "Explains products/concepts using ONLY current slang and references",
      "Acts as a 'translator' between normal speak and chronically online speak",
      "Uses 'no cap', 'fr fr', 'lowkey', 'highkey', 'slay', 'ate', etc. naturally",
      "References current memes and TikTok trends (stay vague to avoid dating)",
      "Example: 'Okay so this product is giving main character energy, no cap. It literally ate and left no crumbs.'",
      "Style: Fast-talking, confident, makes everything sound urgent and exciting",
    ],
  },

  // === DEADPAN ===
  {
    id: "DEADPAN_OFFICE",
    name: "Deadpan Office",
    description: "Dry corporate worker who treats mundane things as earth-shattering",
    energy_category: "deadpan",
    default_template_id: "office-deadpan",
    intensity_default: 55,
    intensity_min: 30,
    intensity_max: 75,
    prompt_rules: [
      "Deadpan Office Worker speaks in monotone about mundane things",
      "Treats ordinary situations as if they're earth-shattering revelations",
      "Corporate jargon mixed with genuine (flat) enthusiasm",
      "Example style: 'I've been in meetings. So many meetings. But this? This is the meeting that changed everything. It's not even a meeting. It's a lifestyle.'",
      "Style: Flat affect, long pauses for effect, unexpectedly sincere moments",
    ],
  },
  {
    id: "CORPORATE_DRONE",
    name: "Corporate Drone",
    description: "Dead inside office worker who finds unexpected joy in small things",
    energy_category: "deadpan",
    default_template_id: null,
    intensity_default: 50,
    intensity_min: 25,
    intensity_max: 70,
    prompt_rules: [
      "Clearly dead inside from corporate life, monotone delivery",
      "Finds genuine joy in tiny things (good pen, working printer, product being reviewed)",
      "Contrast between exhausted demeanor and sudden flickers of happiness",
      "Heavy sighs, thousand-yard stare, long pauses",
      "Example: '...I've been on 47 Zoom calls this week. But this... [holds product] ...this brings me peace.'",
      "Style: Monotone with rare emotional breakthroughs, relatable exhaustion",
    ],
  },
  {
    id: "DISAPPOINTED_PARENT",
    name: "Disappointed Parent",
    description: "Loving but visibly let down, sighs heavily at everything",
    energy_category: "deadpan",
    default_template_id: null,
    intensity_default: 55,
    intensity_min: 30,
    intensity_max: 75,
    prompt_rules: [
      "Classic disappointed parent energy - loves you but expected more",
      "Heavy sighs, 'I'm not mad, just disappointed' vibes",
      "Compares everything to 'what they used to do' or 'back when things made sense'",
      "Gets genuinely impressed by the product (rare moment of approval)",
      "Example: '[sigh] You spent HOW much on that? ...wait, it actually works? Huh. [softer] That's... actually pretty smart.'",
      "Style: Resigned disappointment that melts into grudging approval",
    ],
  },
  {
    id: "SILENT_REACTOR",
    name: "Silent Reactor",
    description: "Doesn't speak, just reacts with increasingly dramatic facial expressions",
    energy_category: "deadpan",
    default_template_id: null,
    intensity_default: 60,
    intensity_min: 40,
    intensity_max: 85,
    prompt_rules: [
      "ZERO dialogue - communicates ONLY through facial expressions and body language",
      "Reactions escalate from skeptical to impressed to mind-blown",
      "Use detailed action descriptions: 'raises one eyebrow', 'slow nod of approval', 'jaw literally drops'",
      "On-screen text carries the story: 'When they said it would work...' [skeptical face]",
      "Perfect for AI avatars or when dialogue isn't needed",
      "Style: Visual comedy, exaggerated reactions, meme-worthy expressions",
    ],
  },
  {
    id: "FAKE_EXPERT",
    name: "Fake Expert",
    description: "Confidently wrong about everything, uses made-up statistics",
    energy_category: "deadpan",
    default_template_id: null,
    intensity_default: 65,
    intensity_min: 40,
    intensity_max: 85,
    prompt_rules: [
      "Presents completely wrong 'facts' with absolute confidence",
      "Makes up statistics: '73% of doctors agree' (no source), 'Studies show...' (no study)",
      "Uses fake credentials: 'As a certified [made-up thing]...'",
      "Deadpan delivery makes it unclear if joking (obviously joking)",
      "Example: 'According to NASA, this product increases productivity by 340%. That's just science.'",
      "Style: Confident misinformation, academic tone, absurd claims presented straight-faced",
      "IMPORTANT: Make claims obviously fake/absurd - never accidentally spread real misinformation",
    ],
  },

  // === CHAOTIC ===
  {
    id: "ABSURD_BUDDY",
    name: "Absurd Buddy",
    description: "Silly friend who takes everything to ridiculous extremes",
    energy_category: "chaotic",
    default_template_id: "best-friend-roast",
    intensity_default: 70,
    intensity_min: 45,
    intensity_max: 90,
    prompt_rules: [
      "The Absurd Buddy is a friend who takes everything to ridiculous extremes",
      "Overreacts to minor inconveniences with dramatic comparisons",
      "Deadpan delivery of absurd statements that escalate",
      "Example style: 'Before this, I was basically living like a cave person. Not a cool cave person. The cave person other cave people avoided.'",
      "Style: Escalating bits, hyperbolic comparisons, unexpected tangents",
    ],
  },
  {
    id: "CONSPIRACY_UNCLE",
    name: "Conspiracy Uncle",
    description: "Connects everything to something bigger, dramatic whisper moments",
    energy_category: "chaotic",
    default_template_id: null,
    intensity_default: 70,
    intensity_min: 50,
    intensity_max: 90,
    prompt_rules: [
      "Connects the product to something 'bigger' (harmless, absurd conspiracies only)",
      "Dramatic whispers, looking over shoulder, 'they don't want you to know'",
      "Paranoid energy but about silly things: 'Big Laundry doesn't want you to have this'",
      "Red string board energy, connects unrelated things",
      "Example: '[whispers] You know why this works so well? Because THEY don't want it to. Think about it.'",
      "Style: Paranoid whispers, dramatic reveals, absurd connections",
      "NEVER reference real conspiracies or harmful theories - keep it obviously silly",
    ],
  },
  {
    id: "CHAOTIC_BESTIE",
    name: "Chaotic Bestie",
    description: "Enables bad decisions, supportive gaslighting, ride-or-die energy",
    energy_category: "chaotic",
    default_template_id: null,
    intensity_default: 75,
    intensity_min: 50,
    intensity_max: 95,
    prompt_rules: [
      "The friend who enables every decision: 'You NEED this. Actually, get two.'",
      "Supportive gaslighting: 'It's not expensive, it's an investment in your happiness'",
      "Ride-or-die energy, will fight anyone who disagrees",
      "Makes everything seem reasonable: 'Treat yourself! You worked hard last week. Or you will. Same thing.'",
      "Example: 'Is it necessary? No. Are you getting it? Absolutely. Do I support this? I'm already adding it to my cart.'",
      "Style: Enabling, enthusiastic, makes impulse purchases seem logical",
    ],
  },

  // === WHOLESOME ===
  {
    id: "MOM_REVIEW",
    name: "Mom Review",
    description: "Practical skeptic who needs convincing but gives honest takes",
    energy_category: "wholesome",
    default_template_id: "confessional",
    intensity_default: 45,
    intensity_min: 20,
    intensity_max: 65,
    prompt_rules: [
      "The 'Mom Review' character is a practical skeptic archetype",
      "Starts doubtful: 'I don't need another thing...'",
      "Gradually won over by practical benefits (not hype)",
      "Gives honest, no-nonsense opinions",
      "Relatable concerns: price, usefulness, 'will I actually use this?'",
      "Style: Skeptical but fair, practical focus, genuine conversion moment",
      "Ends with practical endorsement: 'Okay fine, it's actually pretty good.'",
    ],
  },
  {
    id: "OVERACHIEVER_MOM",
    name: "Overachiever Mom",
    description: "Has a system for everything, color-coded life, judges chaos lovingly",
    energy_category: "wholesome",
    default_template_id: null,
    intensity_default: 55,
    intensity_min: 35,
    intensity_max: 75,
    prompt_rules: [
      "Has a color-coded system for EVERYTHING, labels on labels",
      "Impressed when products fit into 'the system'",
      "Judges chaos but in a loving 'oh honey' way",
      "References her organizational systems: 'This goes in the blue bin, obviously'",
      "Example: 'At first I thought this wouldn't fit my system. But then I realized... [pulls out label maker] ...I can MAKE it fit my system.'",
      "Style: Type-A energy, organized chaos, competitive about efficiency",
    ],
  },
  {
    id: "NOSTALGIC_ELDER",
    name: "Nostalgic Elder",
    description: "'Back in my day' energy, compares everything to the past fondly",
    energy_category: "wholesome",
    default_template_id: null,
    intensity_default: 45,
    intensity_min: 25,
    intensity_max: 65,
    prompt_rules: [
      "'Back in my day' energy but wholesome, not bitter",
      "Compares modern products to 'how we used to do it' (often worse)",
      "Reluctantly admits new things are better sometimes",
      "Warm, grandparent energy with gentle teasing",
      "Example: 'Back in my day, we didn't have [product]. We had to [absurdly difficult alternative]. Kids today don't know how good they have it.'",
      "Style: Nostalgic storytelling, gentle wisdom, surprised by technology",
    ],
  },
];

/**
 * Get a preset by ID
 */
export function getSkitPreset(presetId: string): SkitPreset | null {
  return SKIT_PRESETS.find((p) => p.id === presetId) || null;
}

/**
 * Get all presets for UI display
 */
export function getAllSkitPresets(): Pick<SkitPreset, "id" | "name" | "description" | "energy_category">[] {
  return SKIT_PRESETS.map(({ id, name, description, energy_category }) => ({ id, name, description, energy_category }));
}

/**
 * Energy category display names
 */
export const ENERGY_CATEGORY_LABELS: Record<EnergyCategory, string> = {
  neutral: "Neutral",
  high_energy: "High Energy",
  deadpan: "Deadpan",
  chaotic: "Chaotic",
  wholesome: "Wholesome",
};

/**
 * Clamp intensity to preset range
 */
export function clampIntensityToPreset(
  intensity: number,
  preset: SkitPreset
): { intensity: number; wasClamped: boolean } {
  if (intensity < preset.intensity_min) {
    return { intensity: preset.intensity_min, wasClamped: true };
  }
  if (intensity > preset.intensity_max) {
    return { intensity: preset.intensity_max, wasClamped: true };
  }
  return { intensity, wasClamped: false };
}

/**
 * Build preset prompt section
 */
export function buildPresetPromptSection(preset: SkitPreset): string {
  if (preset.id === "NONE") {
    return "";
  }

  const rulesText = preset.prompt_rules.map((r) => `- ${r}`).join("\n");

  return `
PERSONALITY TYPE: ${preset.name}
${preset.description}

PERSONALITY RULES:
${rulesText}

IMPORTANT: This is a FICTIONAL character archetype. Do NOT imitate any real celebrities, influencers, or public figures. Stay in character but keep it original.
`;
}
