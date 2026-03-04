/**
 * OpenClaw Adapter – bridge between external LLM calls and Command Center ingestion.
 *
 * Wraps trackUsage, recordAgentRunStart, and recordAgentRunFinish for
 * easy integration into any service that calls LLM APIs.
 *
 * Usage:
 *   import { ingestUsageEvent, ingestAgentRunStart, ingestAgentRunFinish } from '@/lib/command-center/openclaw-adapter';
 *
 *   // After an LLM call completes:
 *   await ingestUsageEvent({
 *     provider: 'anthropic',
 *     model: 'claude-3.5-sonnet',
 *     agent_id: 'tom-dev',
 *     input_tokens: 5000,
 *     output_tokens: 2000,
 *   });
 *
 *   // For tracked agent runs:
 *   const run = await ingestAgentRunStart({
 *     agent_id: 'brett-growth',
 *     action: 'research',
 *     related_type: 'idea',
 *     related_id: ideaId,
 *   });
 *   // ... do work ...
 *   await ingestAgentRunFinish({
 *     run_id: run.id,
 *     status: 'completed',
 *     tokens_in: 8000,
 *     tokens_out: 3000,
 *   });
 */

import { trackUsage } from './ingest';
import type { TrackUsageParams } from './ingest';
import { recordAgentRunStart, recordAgentRunFinish } from './agent-runs';
import type { AgentRunStartParams, AgentRunFinishParams } from './agent-runs';
import { isOpenClawEnabled, openclawSkipLog } from '../openclaw-gate';

/**
 * Ingest a single LLM usage event into Command Center.
 * Cost is auto-computed from the pricing map if not provided.
 *
 * Returns the event ID or null on failure.
 */
export async function ingestUsageEvent(
  params: TrackUsageParams,
): Promise<{ id: string } | null> {
  if (!isOpenClawEnabled()) {
    openclawSkipLog('ingestUsageEvent');
    return null;
  }
  try {
    return await trackUsage(params);
  } catch (err) {
    console.error('[openclaw-adapter] ingestUsageEvent error:', err);
    return null;
  }
}

/**
 * Start tracking an agent run. Returns { id } of the created run.
 */
export async function ingestAgentRunStart(
  params: AgentRunStartParams,
): Promise<{ id: string }> {
  if (!isOpenClawEnabled()) {
    openclawSkipLog('ingestAgentRunStart');
    return { id: '00000000-0000-0000-0000-000000000000' };
  }
  try {
    return await recordAgentRunStart(params);
  } catch (err) {
    console.error('[openclaw-adapter] ingestAgentRunStart error:', err);
    return { id: '00000000-0000-0000-0000-000000000000' };
  }
}

/**
 * Finish an agent run with final stats.
 */
export async function ingestAgentRunFinish(
  params: AgentRunFinishParams,
): Promise<void> {
  if (!isOpenClawEnabled()) {
    openclawSkipLog('ingestAgentRunFinish');
    return;
  }
  try {
    await recordAgentRunFinish(params);
  } catch (err) {
    console.error('[openclaw-adapter] ingestAgentRunFinish error:', err);
  }
}
