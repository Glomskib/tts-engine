/**
 * Persona-specific HeyGen delivery configurations.
 *
 * Each persona maps to a specific avatar, voice, and delivery energy
 * tuned for the script's target audience. Voice/avatar assignments
 * come from lib/persona-delivery-config.ts.
 */

import { PERSONA_DELIVERY, type PersonaDelivery } from './persona-delivery-config';

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
  /** Human-readable delivery notes for logging */
  deliveryNotes?: string;
}

// Helper to build a PersonaConfig from the delivery config
function fromDelivery(
  id: string,
  label: string,
  delivery: PersonaDelivery,
  overrides?: Partial<PersonaConfig>
): PersonaConfig {
  const isMale = delivery.heygen_avatar.startsWith('Aditya');
  return {
    id,
    label,
    avatarId: delivery.heygen_avatar,
    avatarStyle: 'normal',
    talkingStyle: 'expressive',
    expression: isMale ? 'default' : 'happy',
    voiceId: delivery.elevenlabs_voice,
    voiceStability: delivery.voice_settings.stability,
    voiceSimilarityBoost: delivery.voice_settings.similarity_boost,
    scale: 1.0,
    offset: { x: 0, y: 0.25 },
    deliveryNotes: delivery.delivery_notes,
    ...overrides,
  };
}

// ============================================================================
// Persona Definitions
// ============================================================================

const SKEPTIC = fromDelivery('skeptic', 'The Skeptic', PERSONA_DELIVERY['The Skeptic'], {
  expression: 'default', // Neutral fits skeptical tone
});

const SOBER_CURIOUS = fromDelivery('sober_curious', 'The Sober Curious', PERSONA_DELIVERY['The Sober Curious']);

const CHRONIC_WARRIOR = fromDelivery('chronic_warrior', 'The Chronic Warrior', PERSONA_DELIVERY['The Chronic Warrior'], {
  expression: 'default', // Calm, empathetic baseline
});

const HONEST_REVIEWER = fromDelivery('honest_reviewer', 'The Honest Reviewer', PERSONA_DELIVERY['The Honest Reviewer'], {
  expression: 'default', // Measured, neutral
});

const EDUCATOR = fromDelivery('educator', 'The Educator', PERSONA_DELIVERY['The Educator'], {
  expression: 'default', // Professional authority
});

const HYPE_MAN = fromDelivery('hype_man', 'The Hype Man', PERSONA_DELIVERY['The Hype Man'], {
  expression: 'happy', // Excited, animated
});

const RELATABLE_FRIEND = fromDelivery('relatable_friend', 'The Relatable Friend', PERSONA_DELIVERY['The Relatable Friend']);

const DEFAULT = fromDelivery('default', 'Default', PERSONA_DELIVERY['The Sober Curious'], {
  id: 'default',
  label: 'Default',
});

// ============================================================================
// Exports
// ============================================================================

export const PERSONAS: Record<string, PersonaConfig> = {
  skeptic: SKEPTIC,
  sober_curious: SOBER_CURIOUS,
  chronic_warrior: CHRONIC_WARRIOR,
  honest_reviewer: HONEST_REVIEWER,
  educator: EDUCATOR,
  hype_man: HYPE_MAN,
  relatable_friend: RELATABLE_FRIEND,
  default: DEFAULT,
};

/**
 * Resolve a persona config by ID. Falls back to default.
 */
export function getPersona(personaId?: string): PersonaConfig {
  if (!personaId) return DEFAULT;
  return PERSONAS[personaId] ?? DEFAULT;
}

/**
 * Map audience persona names (from audience_personas table) to persona config IDs.
 */
const PERSONA_NAME_TO_ID: Record<string, string> = {
  'The Skeptic': 'skeptic',
  'The Sober Curious': 'sober_curious',
  'The Chronic Warrior': 'chronic_warrior',
  'The Honest Reviewer': 'honest_reviewer',
  'The Educator': 'educator',
  'The Hype Man': 'hype_man',
  'The Relatable Friend': 'relatable_friend',
};

/**
 * Resolve a persona config by audience persona name. Falls back to default.
 */
export function getPersonaByName(personaName?: string | null): PersonaConfig {
  if (!personaName) return DEFAULT;
  const configId = PERSONA_NAME_TO_ID[personaName];
  return configId ? (PERSONAS[configId] ?? DEFAULT) : DEFAULT;
}
