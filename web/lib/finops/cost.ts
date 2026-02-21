/**
 * FinOps Cost Calculator
 *
 * Central pricing map + cost computation for all LLM providers.
 * Extends llm-pricing.ts with cache token support and newer models.
 *
 * Update PRICING_MAP when model pricing changes — this is the
 * single source of truth for cost computation across FlashFlow.
 */

export interface ModelPricing {
  /** Cost per 1M input tokens */
  input_per_m: number;
  /** Cost per 1M output tokens */
  output_per_m: number;
  /** Cost per 1M cache read tokens (if supported) */
  cache_read_per_m?: number;
  /** Cost per 1M cache write tokens (if supported) */
  cache_write_per_m?: number;
}

/**
 * Pricing keyed by "provider/model".
 * Partial model names supported — lookup tries exact match first,
 * then prefix match, then provider wildcard (provider/any).
 *
 * Placeholder values marked with // PLACEHOLDER — update when pricing is published.
 */
const PRICING_MAP: Record<string, ModelPricing> = {
  // ── Anthropic ────────────────────────────────────────────────
  'anthropic/claude-opus-4':         { input_per_m: 15.0,  output_per_m: 75.0, cache_read_per_m: 1.5, cache_write_per_m: 18.75 },
  'anthropic/claude-opus-4-6':       { input_per_m: 15.0,  output_per_m: 75.0, cache_read_per_m: 1.5, cache_write_per_m: 18.75 },
  'anthropic/claude-sonnet-4':       { input_per_m: 3.0,   output_per_m: 15.0, cache_read_per_m: 0.3, cache_write_per_m: 3.75 },
  'anthropic/claude-sonnet-4-5':     { input_per_m: 3.0,   output_per_m: 15.0, cache_read_per_m: 0.3, cache_write_per_m: 3.75 },
  'anthropic/claude-sonnet-4-6':     { input_per_m: 3.0,   output_per_m: 15.0, cache_read_per_m: 0.3, cache_write_per_m: 3.75 },
  'anthropic/claude-3.5-sonnet':     { input_per_m: 3.0,   output_per_m: 15.0, cache_read_per_m: 0.3, cache_write_per_m: 3.75 },
  'anthropic/claude-3.5-haiku':      { input_per_m: 0.8,   output_per_m: 4.0,  cache_read_per_m: 0.08, cache_write_per_m: 1.0 },
  'anthropic/claude-haiku-4-5':      { input_per_m: 0.8,   output_per_m: 4.0,  cache_read_per_m: 0.08, cache_write_per_m: 1.0 },
  'anthropic/claude-3-haiku':        { input_per_m: 0.25,  output_per_m: 1.25 },

  // ── OpenAI ───────────────────────────────────────────────────
  'openai/gpt-5.1-codex':    { input_per_m: 5.0,   output_per_m: 20.0 },   // PLACEHOLDER
  'openai/gpt-4.1':          { input_per_m: 2.5,   output_per_m: 10.0 },   // PLACEHOLDER
  'openai/gpt-4.1-mini':     { input_per_m: 0.4,   output_per_m: 1.6 },    // PLACEHOLDER
  'openai/gpt-4.1-nano':     { input_per_m: 0.1,   output_per_m: 0.4 },    // PLACEHOLDER
  'openai/gpt-4o':           { input_per_m: 2.5,   output_per_m: 10.0 },
  'openai/gpt-4o-mini':      { input_per_m: 0.15,  output_per_m: 0.6 },
  'openai/gpt-4-turbo':      { input_per_m: 10.0,  output_per_m: 30.0 },
  'openai/gpt-4':            { input_per_m: 30.0,  output_per_m: 60.0 },
  'openai/gpt-3.5-turbo':    { input_per_m: 0.5,   output_per_m: 1.5 },
  'openai/o1':               { input_per_m: 15.0,  output_per_m: 60.0 },
  'openai/o1-mini':          { input_per_m: 3.0,   output_per_m: 12.0 },
  'openai/o3-mini':          { input_per_m: 1.1,   output_per_m: 4.4 },

  // ── DeepSeek ─────────────────────────────────────────────────
  'deepseek/deepseek-chat':     { input_per_m: 0.27, output_per_m: 1.1 },
  'deepseek/deepseek-reasoner': { input_per_m: 0.55, output_per_m: 2.19 },

  // ── Google ───────────────────────────────────────────────────
  'google/gemini-2.0-flash': { input_per_m: 0.1,   output_per_m: 0.4 },
  'google/gemini-1.5-pro':   { input_per_m: 1.25,  output_per_m: 5.0 },
  'google/gemini-1.5-flash': { input_per_m: 0.075, output_per_m: 0.3 },

  // ── Local / Free ─────────────────────────────────────────────
  'ollama/any': { input_per_m: 0, output_per_m: 0 },

  // ── Non-LLM providers (token cost = 0; reconciled via metadata) ──
  'elevenlabs/any': { input_per_m: 0, output_per_m: 0 },
  'heygen/any':     { input_per_m: 0, output_per_m: 0 },
  'runway/any':     { input_per_m: 0, output_per_m: 0 },
  'replicate/any':  { input_per_m: 0, output_per_m: 0 },
};

/**
 * Look up pricing for a provider/model combo.
 * Tries exact "provider/model" → prefix match → provider wildcard.
 */
function lookupPricing(provider: string, model: string): ModelPricing | null {
  const key = `${provider}/${model}`;

  if (PRICING_MAP[key]) return PRICING_MAP[key];

  for (const [mapKey, pricing] of Object.entries(PRICING_MAP)) {
    if (key.startsWith(mapKey)) return pricing;
  }

  const wildcard = `${provider}/any`;
  if (PRICING_MAP[wildcard]) return PRICING_MAP[wildcard];

  return null;
}

export interface CostFromUsageInput {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
}

/**
 * Compute cost in USD for a given token usage, including cache tokens.
 * Returns 0 if pricing is not found (unknown model).
 */
export function costFromUsage(input: CostFromUsageInput): number {
  const pricing = lookupPricing(input.provider, input.model);
  if (!pricing) return 0;

  const inputCost = (input.input_tokens / 1_000_000) * pricing.input_per_m;
  const outputCost = (input.output_tokens / 1_000_000) * pricing.output_per_m;

  const cacheReadCost = input.cache_read_tokens && pricing.cache_read_per_m
    ? (input.cache_read_tokens / 1_000_000) * pricing.cache_read_per_m
    : 0;
  const cacheWriteCost = input.cache_write_tokens && pricing.cache_write_per_m
    ? (input.cache_write_tokens / 1_000_000) * pricing.cache_write_per_m
    : 0;

  const total = inputCost + outputCost + cacheReadCost + cacheWriteCost;
  return Math.round(total * 1_000_000) / 1_000_000;
}

/**
 * Check if pricing exists for a provider/model.
 */
export function hasPricing(provider: string, model: string): boolean {
  return lookupPricing(provider, model) !== null;
}

/**
 * Get all pricing entries (for admin display / debugging).
 */
export function getAllPricing(): Record<string, ModelPricing> {
  return { ...PRICING_MAP };
}
