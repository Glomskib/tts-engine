/**
 * LLM Pricing Map – central source of truth for cost computation.
 *
 * Prices are in USD per 1 million tokens.
 * Update this file when model pricing changes.
 */

interface ModelPricing {
  input_per_m: number;
  output_per_m: number;
}

/**
 * Pricing keyed by "provider/model".
 * Partial model names are also supported – the lookup will try exact match first,
 * then prefix match (e.g., "claude-3.5-sonnet" matches "anthropic/claude-3.5-sonnet-*").
 */
const PRICING_MAP: Record<string, ModelPricing> = {
  // ── Anthropic ────────────────────────────────────────────────
  'anthropic/claude-opus-4': { input_per_m: 15.0, output_per_m: 75.0 },
  'anthropic/claude-sonnet-4': { input_per_m: 3.0, output_per_m: 15.0 },
  'anthropic/claude-3.5-sonnet': { input_per_m: 3.0, output_per_m: 15.0 },
  'anthropic/claude-3.5-haiku': { input_per_m: 0.8, output_per_m: 4.0 },
  'anthropic/claude-3-haiku': { input_per_m: 0.25, output_per_m: 1.25 },

  // ── OpenAI ───────────────────────────────────────────────────
  'openai/gpt-4o': { input_per_m: 2.5, output_per_m: 10.0 },
  'openai/gpt-4o-mini': { input_per_m: 0.15, output_per_m: 0.6 },
  'openai/gpt-4-turbo': { input_per_m: 10.0, output_per_m: 30.0 },
  'openai/gpt-4': { input_per_m: 30.0, output_per_m: 60.0 },
  'openai/gpt-3.5-turbo': { input_per_m: 0.5, output_per_m: 1.5 },
  'openai/o1': { input_per_m: 15.0, output_per_m: 60.0 },
  'openai/o1-mini': { input_per_m: 3.0, output_per_m: 12.0 },
  'openai/o3-mini': { input_per_m: 1.1, output_per_m: 4.4 },

  // ── DeepSeek ─────────────────────────────────────────────────
  'deepseek/deepseek-chat': { input_per_m: 0.27, output_per_m: 1.1 },
  'deepseek/deepseek-reasoner': { input_per_m: 0.55, output_per_m: 2.19 },

  // ── Google ───────────────────────────────────────────────────
  'google/gemini-2.0-flash': { input_per_m: 0.1, output_per_m: 0.4 },
  'google/gemini-1.5-pro': { input_per_m: 1.25, output_per_m: 5.0 },
  'google/gemini-1.5-flash': { input_per_m: 0.075, output_per_m: 0.3 },

  // ── Local / Free ─────────────────────────────────────────────
  'ollama/any': { input_per_m: 0, output_per_m: 0 },

  // ── Non-LLM providers (tokens=0; cost tracked via meta) ─────
  // Set to 0 here — actual cost is reconciled from meta fields.
  'elevenlabs/any': { input_per_m: 0, output_per_m: 0 },
  'heygen/any': { input_per_m: 0, output_per_m: 0 },
  'runway/any': { input_per_m: 0, output_per_m: 0 },
  'replicate/any': { input_per_m: 0, output_per_m: 0 },
};

/**
 * Look up pricing for a provider/model combo.
 * Tries exact "provider/model" first, then prefix match on model name.
 */
function lookupPricing(provider: string, model: string): ModelPricing | null {
  const key = `${provider}/${model}`;

  // Exact match
  if (PRICING_MAP[key]) return PRICING_MAP[key];

  // Prefix match (e.g., "claude-3.5-sonnet-20241022" → "claude-3.5-sonnet")
  for (const [mapKey, pricing] of Object.entries(PRICING_MAP)) {
    if (key.startsWith(mapKey)) return pricing;
  }

  // Provider wildcard (e.g., "ollama/any" covers all ollama models)
  const wildcard = `${provider}/any`;
  if (PRICING_MAP[wildcard]) return PRICING_MAP[wildcard];

  return null;
}

/**
 * Compute cost in USD for a given token usage.
 * Returns 0 if pricing is not found (unknown model).
 */
export function computeCost(
  inputTokens: number,
  outputTokens: number,
  provider: string,
  model: string
): number {
  const pricing = lookupPricing(provider, model);
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.input_per_m;
  const outputCost = (outputTokens / 1_000_000) * pricing.output_per_m;

  // Round to 6 decimal places to match numeric(12,6)
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

/**
 * Check if we have pricing info for a model.
 */
export function hasPricing(provider: string, model: string): boolean {
  return lookupPricing(provider, model) !== null;
}

/**
 * Get all known pricing entries (for admin display).
 */
export function getAllPricing(): Record<string, ModelPricing> {
  return { ...PRICING_MAP };
}
