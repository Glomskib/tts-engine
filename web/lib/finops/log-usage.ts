/**
 * FinOps Usage Logger
 *
 * Inserts usage events into ff_usage_events with auto-computed cost.
 * Use logUsageEvent() when you need the result, logUsageEventAsync()
 * for fire-and-forget (non-blocking).
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { costFromUsage } from './cost';

export interface LogUsageEventInput {
  source: 'flashflow' | 'openclaw' | 'manual';
  lane: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  cost_usd?: number;
  agent_id?: string;
  user_id?: string;
  request_id?: string;
  correlation_id?: string;
  endpoint?: string;
  template_key?: string;
  prompt_version_id?: string;
  generation_id?: string;
  task_id?: string;
  latency_ms?: number;
  estimated?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UsageEventRow {
  id: string;
  created_at: string;
  source: string;
  lane: string;
  cost_usd: number;
}

/**
 * Log a usage event to ff_usage_events.
 * Cost is auto-computed from the pricing map if not provided.
 * Returns the inserted row or null on failure.
 */
export async function logUsageEvent(
  input: LogUsageEventInput
): Promise<UsageEventRow | null> {
  const cost = input.cost_usd ?? costFromUsage({
    provider: input.provider,
    model: input.model,
    input_tokens: input.input_tokens,
    output_tokens: input.output_tokens,
    cache_read_tokens: input.cache_read_tokens,
    cache_write_tokens: input.cache_write_tokens,
  });

  try {
    const { data, error } = await supabaseAdmin
      .from('ff_usage_events')
      .insert({
        source: input.source,
        lane: input.lane,
        provider: input.provider,
        model: input.model,
        input_tokens: input.input_tokens,
        output_tokens: input.output_tokens,
        cache_read_tokens: input.cache_read_tokens ?? 0,
        cache_write_tokens: input.cache_write_tokens ?? 0,
        cost_usd: cost,
        agent_id: input.agent_id ?? null,
        user_id: input.user_id ?? null,
        request_id: input.request_id ?? null,
        correlation_id: input.correlation_id ?? null,
        endpoint: input.endpoint ?? null,
        template_key: input.template_key ?? null,
        prompt_version_id: input.prompt_version_id ?? null,
        generation_id: input.generation_id ?? null,
        task_id: input.task_id ?? null,
        latency_ms: input.latency_ms ?? null,
        estimated: input.estimated ?? false,
        metadata: input.metadata ?? {},
      })
      .select('id, created_at, source, lane, cost_usd')
      .single();

    if (error) {
      console.error('[finops/log-usage] Insert failed:', error.message);
      return null;
    }

    return data as UsageEventRow;
  } catch (err) {
    console.error('[finops/log-usage] Exception:', err);
    return null;
  }
}

/**
 * Fire-and-forget version — does not block the main request.
 */
export function logUsageEventAsync(input: LogUsageEventInput): void {
  logUsageEvent(input).catch(() => {});
}

/**
 * Best-effort token estimate from raw text (~4 chars per token).
 * Use when the API does not return token counts.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
