/**
 * Persona Delivery Configuration
 *
 * Maps every audience persona to a specific avatar, voice, and delivery style.
 * This is the single source of truth for persona → delivery mapping.
 *
 * Voice IDs reference ElevenLabs stock voices:
 *   Brian   (nPczCjzI2devNBz1zQrb) — Deep, Resonant, Comforting (male, social_media)
 *   Eric    (cjVigY5qzO86Huf0OWal) — Smooth, Trustworthy (male, conversational)
 *   Liam    (TX3LPaxmHKxFdv7VOQHJ) — Energetic, Social Media Creator (male, social_media)
 *   Jessica (cgSgspJ2msm6clMCkdW9) — Playful, Bright, Warm (female, conversational)
 *   Sarah   (EXAVITQu4vr4xnSDxMaL) — Mature, Reassuring, Confident (female, entertainment_tv)
 *   Matilda (XrExE9yKIg1WjnnlVkGX) — Knowledgable, Professional (female, informative_educational)
 *   Laura   (FGY2WhTYpPnrIDTdsKH5) — Enthusiast, Quirky Attitude (female, social_media)
 */

export interface PersonaDelivery {
  heygen_avatar: string;
  elevenlabs_voice: string;
  voice_name: string;
  voice_settings: {
    stability: number;
    similarity_boost: number;
  };
  delivery_notes: string;
}

export const PERSONA_DELIVERY: Record<string, PersonaDelivery> = {
  'The Skeptic': {
    heygen_avatar: 'Aditya_public_1',
    elevenlabs_voice: 'nPczCjzI2devNBz1zQrb', // Brian — Deep, Resonant
    voice_name: 'Brian',
    voice_settings: { stability: 0.6, similarity_boost: 0.8 },
    delivery_notes: 'Slightly faster pace, confident, "prove it to me" energy',
  },
  'The Sober Curious': {
    heygen_avatar: 'Abigail_expressive_2024112501',
    elevenlabs_voice: 'cgSgspJ2msm6clMCkdW9', // Jessica — Playful, Bright, Warm
    voice_name: 'Jessica',
    voice_settings: { stability: 0.5, similarity_boost: 0.7 },
    delivery_notes: 'Warm, conversational, relatable',
  },
  'The Chronic Warrior': {
    heygen_avatar: 'Abigail_expressive_2024112501',
    elevenlabs_voice: 'EXAVITQu4vr4xnSDxMaL', // Sarah — Mature, Reassuring, Confident
    voice_name: 'Sarah',
    voice_settings: { stability: 0.65, similarity_boost: 0.7 },
    delivery_notes: 'Empathetic, understanding, gentle authority',
  },
  'The Honest Reviewer': {
    heygen_avatar: 'Abigail_expressive_2024112501',
    elevenlabs_voice: 'XrExE9yKIg1WjnnlVkGX', // Matilda — Knowledgable, Professional
    voice_name: 'Matilda',
    voice_settings: { stability: 0.7, similarity_boost: 0.8 },
    delivery_notes: 'Calm, measured, trustworthy',
  },
  'The Educator': {
    heygen_avatar: 'Aditya_public_1',
    elevenlabs_voice: 'cjVigY5qzO86Huf0OWal', // Eric — Smooth, Trustworthy
    voice_name: 'Eric',
    voice_settings: { stability: 0.6, similarity_boost: 0.75 },
    delivery_notes: 'Confident, knowledgeable, drops facts',
  },
  'The Hype Man': {
    heygen_avatar: 'Aditya_public_1',
    elevenlabs_voice: 'TX3LPaxmHKxFdv7VOQHJ', // Liam — Energetic, Social Media Creator
    voice_name: 'Liam',
    voice_settings: { stability: 0.3, similarity_boost: 0.9 },
    delivery_notes: 'High energy, excited, infectious enthusiasm',
  },
  'The Relatable Friend': {
    heygen_avatar: 'Abigail_expressive_2024112501',
    elevenlabs_voice: 'FGY2WhTYpPnrIDTdsKH5', // Laura — Enthusiast, Quirky Attitude
    voice_name: 'Laura',
    voice_settings: { stability: 0.4, similarity_boost: 0.6 },
    delivery_notes: 'Casual, low-key, like texting a friend',
  },
};

/**
 * Resolve delivery config by persona name. Returns undefined if no match.
 */
export function getDeliveryConfig(personaName: string): PersonaDelivery | undefined {
  return PERSONA_DELIVERY[personaName];
}

/**
 * All known persona names.
 */
export const PERSONA_NAMES = Object.keys(PERSONA_DELIVERY);
