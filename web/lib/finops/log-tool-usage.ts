/**
 * FinOps Tool Usage Logger
 *
 * Inserts non-LLM tool usage events into tool_usage_events.
 * Use logToolUsageEvent() when you need the result, logToolUsageEventAsync()
 * for fire-and-forget (non-blocking).
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface LogToolUsageEventInput {
  tool_name: string;
  lane: string;
  agent_id?: string;
  user_id?: string;
  run_id?: string;
  duration_ms?: number;
  success?: boolean;
  error_code?: string;
  cost_usd?: number;
  metadata?: Record<string, unknown>;
}

export interface ToolUsageEventRow {
  id: string;
  created_at: string;
  tool_name: string;
  lane: string;
  cost_usd: number;
}

/**
 * Log a tool usage event to tool_usage_events.
 * Returns the inserted row or null on failure.
 */
export async function logToolUsageEvent(
  input: LogToolUsageEventInput
): Promise<ToolUsageEventRow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('tool_usage_events')
      .insert({
        tool_name: input.tool_name,
        lane: input.lane,
        agent_id: input.agent_id ?? null,
        user_id: input.user_id ?? null,
        run_id: input.run_id ?? null,
        duration_ms: input.duration_ms ?? null,
        success: input.success ?? true,
        error_code: input.error_code ?? null,
        cost_usd: input.cost_usd ?? 0,
        metadata: input.metadata ?? {},
      })
      .select('id, created_at, tool_name, lane, cost_usd')
      .single();

    if (error) {
      console.error('[finops/log-tool-usage] Insert failed:', error.message);
      return null;
    }

    return data as ToolUsageEventRow;
  } catch (err) {
    console.error('[finops/log-tool-usage] Exception:', err);
    return null;
  }
}

/**
 * Fire-and-forget version — does not block the main request.
 */
export function logToolUsageEventAsync(input: LogToolUsageEventInput): void {
  logToolUsageEvent(input).catch(() => {});
}
