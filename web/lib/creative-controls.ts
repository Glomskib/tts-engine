/**
 * Creative Controls Configuration
 * Human-friendly names and descriptions for all creative levers
 */

// Content Edge (formerly Risk Tier)
export const CONTENT_EDGE_OPTIONS = [
  { value: 'SAFE', label: 'Safe & Steady', description: 'Family-friendly, brand-safe content', desc: 'Family-friendly, brand-safe' },
  { value: 'BALANCED', label: 'Slightly Edgy', description: 'Light humor, mild takes', desc: 'Light humor, mild takes' },
  { value: 'SPICY', label: 'Bold Takes', description: 'Stronger opinions, edgier humor', desc: 'Stronger opinions, edgier' },
] as const;

export type ContentEdge = typeof CONTENT_EDGE_OPTIONS[number]['value'];

// Unpredictability (formerly Chaos Level) - Now 1-5 scale
export const UNPREDICTABILITY_OPTIONS = [
  { value: 1, label: 'Structured', description: 'Follows a clear, predictable format' },
  { value: 2, label: 'Mostly Structured', description: 'Some surprises, mostly predictable' },
  { value: 3, label: 'Balanced', description: 'Mix of expected and unexpected' },
  { value: 4, label: 'Spontaneous', description: 'Frequent surprises and pivots' },
  { value: 5, label: 'Wild Card', description: 'Completely unpredictable, chaotic energy' },
] as const;

// Humor Level (formerly Comedy/Intensity)
export const HUMOR_LEVEL_OPTIONS = [
  { value: 1, label: 'Serious', description: 'No humor, straight information' },
  { value: 2, label: 'Light Touch', description: 'Occasional smile moments' },
  { value: 3, label: 'Casual Fun', description: 'Regularly entertaining' },
  { value: 4, label: 'Comedy Focus', description: 'Humor is a main element' },
  { value: 5, label: 'Full Comedy', description: 'Maximum laughs, entertainment first' },
] as const;

// Pacing
export const PACING_OPTIONS = [
  { value: 'slow', label: 'Slow Build', description: 'Takes time, builds tension' },
  { value: 'moderate', label: 'Conversational', description: 'Natural talking pace' },
  { value: 'fast', label: 'Quick Cuts', description: 'Fast, punchy delivery' },
  { value: 'rapid', label: 'Rapid Fire', description: 'Maximum speed, high energy' },
] as const;

export type Pacing = typeof PACING_OPTIONS[number]['value'];

// Hook Strength
export const HOOK_STRENGTH_OPTIONS = [
  { value: 'soft', label: 'Soft Open', description: 'Gentle, eases viewer in' },
  { value: 'standard', label: 'Standard Hook', description: 'Clear value proposition' },
  { value: 'strong', label: 'Strong Hook', description: 'Immediate attention grab' },
  { value: 'extreme', label: 'Pattern Interrupt', description: 'Shocking or unexpected open' },
] as const;

export type HookStrength = typeof HOOK_STRENGTH_OPTIONS[number]['value'];

// Authenticity Feel
export const AUTHENTICITY_OPTIONS = [
  { value: 'polished', label: 'Polished', description: 'Professional, scripted feel' },
  { value: 'balanced', label: 'Balanced', description: 'Professional but natural' },
  { value: 'casual', label: 'Casual', description: 'Feels like talking to a friend' },
  { value: 'raw', label: 'Raw/UGC', description: 'Unfiltered, very authentic' },
] as const;

export type Authenticity = typeof AUTHENTICITY_OPTIONS[number]['value'];

// Helper functions
export function getContentEdgeLabel(value: string): string {
  const option = CONTENT_EDGE_OPTIONS.find(o => o.value === value);
  return option?.label || value;
}

export function getUnpredictabilityLabel(value: number): string {
  const option = UNPREDICTABILITY_OPTIONS.find(o => o.value === value);
  return option?.label || `Level ${value}`;
}

export function getHumorLevelLabel(value: number): string {
  const option = HUMOR_LEVEL_OPTIONS.find(o => o.value === value);
  return option?.label || `Level ${value}`;
}

// Convert old chaos level (0-100) to new scale (1-5)
export function chaosToUnpredictability(chaosLevel: number): number {
  if (chaosLevel <= 20) return 1;
  if (chaosLevel <= 40) return 2;
  if (chaosLevel <= 60) return 3;
  if (chaosLevel <= 80) return 4;
  return 5;
}

// Convert new unpredictability (1-5) back to chaos level for API compatibility
export function unpredictabilityToChaos(unpredictability: number): number {
  const mapping: Record<number, number> = {
    1: 10,
    2: 30,
    3: 50,
    4: 70,
    5: 90,
  };
  return mapping[unpredictability] || 50;
}

// Convert old intensity (0-100) to humor level (1-5)
export function intensityToHumorLevel(intensity: number): number {
  if (intensity <= 20) return 1;
  if (intensity <= 40) return 2;
  if (intensity <= 60) return 3;
  if (intensity <= 80) return 4;
  return 5;
}

// Convert humor level (1-5) back to intensity for API compatibility
export function humorLevelToIntensity(humorLevel: number): number {
  const mapping: Record<number, number> = {
    1: 10,
    2: 30,
    3: 50,
    4: 70,
    5: 90,
  };
  return mapping[humorLevel] || 50;
}

// Unified CREATIVE_CONTROLS object for easy UI consumption
export const CREATIVE_CONTROLS = {
  contentEdge: {
    label: 'Content Edge',
    description: 'How boundary-pushing the content is',
    options: CONTENT_EDGE_OPTIONS,
  },
  unpredictability: {
    label: 'Unpredictability',
    description: 'How random or surprising the content is',
    options: UNPREDICTABILITY_OPTIONS,
  },
  humorLevel: {
    label: 'Humor Level',
    description: 'How funny or comedic the content is',
    options: HUMOR_LEVEL_OPTIONS,
  },
  pacing: {
    label: 'Pacing',
    description: 'How fast the content moves',
    options: PACING_OPTIONS,
  },
  hookStrength: {
    label: 'Hook Strength',
    description: 'How attention-grabbing the opening is',
    options: HOOK_STRENGTH_OPTIONS,
  },
  authenticity: {
    label: 'Authenticity Feel',
    description: 'How polished vs raw the content feels',
    options: AUTHENTICITY_OPTIONS,
  },
} as const;

// Presentation styles with human-friendly names
export const PRESENTATION_STYLES = [
  { value: 'direct_pitch', label: 'Straight Sell', desc: 'Direct product pitch' },
  { value: 'storytelling', label: 'Story Time', desc: 'Narrative-driven content' },
  { value: 'problem_solution', label: 'Problem → Solution', desc: 'Classic pain point format' },
  { value: 'demonstration', label: 'Show Don\'t Tell', desc: 'Product in action' },
  { value: 'testimonial', label: 'Real Talk', desc: 'Testimonial/review style' },
  { value: 'comparison', label: 'Side by Side', desc: 'Comparison format' },
  { value: 'tutorial', label: 'How To', desc: 'Educational/tutorial' },
  { value: 'unboxing', label: 'First Look', desc: 'Unboxing/reveal' },
  { value: 'day_in_life', label: 'Day in My Life', desc: 'Lifestyle integration' },
  { value: 'trending', label: 'Trend Jacking', desc: 'Uses current trends' },
] as const;
