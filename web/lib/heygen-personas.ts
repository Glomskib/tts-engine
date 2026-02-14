/**
 * Persona-specific HeyGen delivery configurations.
 *
 * Each persona maps to a specific avatar, voice style, and delivery energy
 * tuned for the script's target audience.
 */

export interface PersonaConfig {
  id: string;
  label: string;
  avatarId: string;
  avatarStyle: 'normal' | 'closeUp' | 'circle';
  talkingStyle: 'stable' | 'expressive';
  expression: 'default' | 'happy';
  /** ElevenLabs voice ID for TTS */
  voiceId: string;
  /** ElevenLabs voice stability (0–1, lower = more expressive) */
  voiceStability: number;
  /** ElevenLabs similarity boost (0–1) */
  voiceSimilarityBoost: number;
  /** Avatar scale (0.0–5.0) */
  scale: number;
  /** Avatar position offset {x, y} — y>0 pushes down */
  offset: { x: number; y: number };
}

/**
 * The Skeptic — Aditya (male)
 * Confident, slightly fast, "prove it to me" energy.
 * Used for scripts that challenge claims and demand evidence.
 */
const SKEPTIC: PersonaConfig = {
  id: 'skeptic',
  label: 'The Skeptic',
  avatarId: 'Aditya_public_1',        // Blue blazer — professional, authoritative
  avatarStyle: 'normal',
  talkingStyle: 'expressive',
  expression: 'default',               // Neutral fits skeptical tone
  voiceId: 'TX3LPaxmHKxFdv7VOQHJ',   // Liam — Energetic Social Media Creator
  voiceStability: 0.35,                // Low stability = more dynamic delivery
  voiceSimilarityBoost: 0.8,
  scale: 1.0,
  offset: { x: 0, y: 0.25 },          // Lower third positioning
};

/**
 * Sober Curious — Abigail (female)
 * Warm, conversational, relatable "best friend" energy.
 * Used for lifestyle/wellness scripts aimed at the sober-curious audience.
 */
const SOBER_CURIOUS: PersonaConfig = {
  id: 'sober_curious',
  label: 'Sober Curious',
  avatarId: 'Abigail_expressive_2024112501', // Upper body — casual, approachable
  avatarStyle: 'normal',
  talkingStyle: 'expressive',
  expression: 'happy',                 // Warm, inviting
  voiceId: 'TX3LPaxmHKxFdv7VOQHJ',   // Liam — swap to female voice when available
  voiceStability: 0.5,                 // Balanced — conversational but consistent
  voiceSimilarityBoost: 0.75,
  scale: 1.0,
  offset: { x: 0, y: 0.25 },
};

/**
 * Chronic Warrior — Abigail (female)
 * Empathetic, understanding, gentle authority.
 * Used for health/supplement scripts targeting chronic pain/fatigue audience.
 */
const CHRONIC_WARRIOR: PersonaConfig = {
  id: 'chronic_warrior',
  label: 'Chronic Warrior',
  avatarId: 'Abigail_expressive_2024112501',
  avatarStyle: 'normal',
  talkingStyle: 'expressive',
  expression: 'default',               // Calm, empathetic baseline
  voiceId: 'TX3LPaxmHKxFdv7VOQHJ',
  voiceStability: 0.6,                 // Higher stability = gentler, steadier
  voiceSimilarityBoost: 0.75,
  scale: 1.0,
  offset: { x: 0, y: 0.25 },
};

/**
 * Default — Abigail (female)
 * General-purpose delivery for scripts that don't match a specific persona.
 */
const DEFAULT: PersonaConfig = {
  id: 'default',
  label: 'Default',
  avatarId: 'Abigail_expressive_2024112501',
  avatarStyle: 'normal',
  talkingStyle: 'expressive',
  expression: 'happy',
  voiceId: 'TX3LPaxmHKxFdv7VOQHJ',
  voiceStability: 0.5,
  voiceSimilarityBoost: 0.75,
  scale: 1.0,
  offset: { x: 0, y: 0.25 },
};

export const PERSONAS: Record<string, PersonaConfig> = {
  skeptic: SKEPTIC,
  sober_curious: SOBER_CURIOUS,
  chronic_warrior: CHRONIC_WARRIOR,
  default: DEFAULT,
};

/**
 * Resolve a persona config by ID. Falls back to default.
 */
export function getPersona(personaId?: string): PersonaConfig {
  if (!personaId) return DEFAULT;
  return PERSONAS[personaId] ?? DEFAULT;
}
