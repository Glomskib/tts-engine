/**
 * Maps product brands to their target persona names in audience_personas.
 * Used by batch-generate to auto-target the right persona per brand.
 */
export const BRAND_PERSONA_MAP: Record<string, string> = {
  'OxyEnergy': 'The Skeptic',
  'Hop Water': 'The Sober Curious',
  'Snap Supplements': 'The Chronic Warrior',
};
