/**
 * Skit Character Presets
 *
 * Internal fictional character archetypes for consistent skit generation.
 * These are NOT real people - they are comedic archetypes owned by the platform.
 *
 * IMPORTANT: Never imitate real celebrities, influencers, or public figures.
 * All characters are original fictional creations.
 */

export interface SkitPreset {
  id: string;
  name: string;
  description: string;
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
  {
    id: "NONE",
    name: "No Character",
    description: "Plain friendly narrator, no specific persona",
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
    id: "DR_PICKLE",
    name: "Dr. Pickle",
    description: "Quirky lab hobbyist who gets excited about discoveries (NOT a medical authority)",
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
    id: "ABSURD_BUDDY",
    name: "Absurd Buddy",
    description: "Silly friend who takes everything to ridiculous extremes",
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
    id: "DEADPAN_OFFICE",
    name: "Deadpan Office",
    description: "Dry corporate worker who treats mundane things as earth-shattering",
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
    id: "INFOMERCIAL_CHAOS",
    name: "Infomercial Chaos",
    description: "Self-aware parody host where everything hilariously goes wrong",
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
    id: "STREET_INTERVIEW",
    name: "Street Interview",
    description: "Quick person-on-the-street Q&A format with genuine reactions",
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
  {
    id: "MOM_REVIEW",
    name: "Mom Review",
    description: "Practical skeptic who needs convincing but gives honest takes",
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
export function getAllSkitPresets(): Pick<SkitPreset, "id" | "name" | "description">[] {
  return SKIT_PRESETS.map(({ id, name, description }) => ({ id, name, description }));
}

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
CHARACTER: ${preset.name}
${preset.description}

CHARACTER RULES:
${rulesText}

IMPORTANT: This is a FICTIONAL character archetype. Do NOT imitate any real celebrities, influencers, or public figures. Stay in character but keep it original.
`;
}
