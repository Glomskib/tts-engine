/**
 * Agent Runs – record + finish LLM agent executions.
 *
 * Usage:
 *   import { recordAgentRunStart, recordAgentRunFinish } from '@/lib/command-center/agent-runs';
 *
 *   const run = await recordAgentRunStart({
 *     agent_id: 'tom-dev',
 *     related_type: 'idea',
 *     related_id: ideaId,
 *     action: 'research',
 *     model_primary: 'claude-3.5-sonnet',
 *   });
 *
 *   // ... do work ...
 *
 *   await recordAgentRunFinish({
 *     run_id: run.id,
 *     status: 'completed',
 *     tokens_in: 5000,
 *     tokens_out: 2000,
 *     cost_usd: 0.025,
 *     model_used: 'claude-3.5-sonnet-20241022',
 *   });
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { computeCost } from '@/lib/llm-pricing';

export interface AgentRunStartParams {
  agent_id: string;
  related_type?: string | null; // initiative, project, task, idea
  related_id?: string | null;
  action: string;
  model_primary?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AgentRunFinishParams {
  run_id: string;
  status: 'completed' | 'failed';
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number; // auto-computed if model_used + tokens provided
  model_used?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAgentRunStart(params: AgentRunStartParams): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from('agent_runs')
    .insert({
      agent_id: params.agent_id,
      related_type: params.related_type ?? null,
      related_id: params.related_id ?? null,
      action: params.action,
      status: 'running',
      started_at: new Date().toISOString(),
      model_primary: params.model_primary ?? null,
      metadata: params.metadata ?? {},
    })
    .select('id')
    .single();

  if (error) {
    console.error('[agent-runs] recordAgentRunStart failed:', error.message);
    // Return a placeholder so callers don't crash
    return { id: '00000000-0000-0000-0000-000000000000' };
  }

  return { id: data.id };
}

export async function recordAgentRunFinish(params: AgentRunFinishParams): Promise<void> {
  const tokensIn = params.tokens_in ?? 0;
  const tokensOut = params.tokens_out ?? 0;

  // Auto-compute cost if not provided
  let cost = params.cost_usd;
  if (cost === undefined && params.model_used) {
    // Try to parse provider from model_used (e.g., "anthropic/claude-3.5-sonnet" or just "claude-3.5-sonnet")
    const parts = params.model_used.split('/');
    const provider = parts.length > 1 ? parts[0] : 'anthropic'; // default to anthropic
    const model = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
    cost = computeCost(tokensIn, tokensOut, provider, model);
  }

  const updates: Record<string, unknown> = {
    status: params.status,
    ended_at: new Date().toISOString(),
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: cost ?? 0,
  };
  if (params.model_used) updates.model_used = params.model_used;
  if (params.metadata) {
    // Merge metadata
    const { data: existing } = await supabaseAdmin
      .from('agent_runs')
      .select('metadata')
      .eq('id', params.run_id)
      .single();
    updates.metadata = { ...(existing?.metadata as Record<string, unknown> ?? {}), ...params.metadata };
  }

  const { error } = await supabaseAdmin
    .from('agent_runs')
    .update(updates)
    .eq('id', params.run_id);

  if (error) {
    console.error('[agent-runs] recordAgentRunFinish failed:', error.message);
  }
}
