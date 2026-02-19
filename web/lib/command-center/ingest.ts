/**
 * Command Center – Event Ingestion SDK
 *
 * Drop-in helpers for the rest of the app to record usage events,
 * task events, and idea artifacts. All writes go through supabaseAdmin
 * so RLS is bypassed (service_role).
 *
 * Usage:
 *   import { trackUsage, logTaskEvent } from '@/lib/command-center/ingest';
 *   await trackUsage({ provider: 'anthropic', model: 'claude-3.5-sonnet', ... });
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { computeCost } from '@/lib/llm-pricing';

// ── Usage Events ───────────────────────────────────────────────

export interface TrackUsageParams {
  provider: string;
  model: string;
  agent_id?: string;
  project_id?: string | null;
  request_type?: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd?: number; // auto-computed if omitted
  latency_ms?: number | null;
  status?: 'ok' | 'error';
  error_code?: string | null;
  correlation_id?: string;
  meta?: Record<string, unknown>;
}

/**
 * Record a single LLM usage event.
 * Cost is auto-computed from the pricing map if not provided.
 */
export async function trackUsage(params: TrackUsageParams): Promise<{ id: string } | null> {
  const cost = params.cost_usd ?? computeCost(
    params.input_tokens,
    params.output_tokens,
    params.provider,
    params.model,
  );

  const meta: Record<string, unknown> = { ...(params.meta ?? {}) };
  if (params.correlation_id) meta.correlation_id = params.correlation_id;

  const { data, error } = await supabaseAdmin
    .from('usage_events')
    .insert({
      provider: params.provider,
      model: params.model,
      agent_id: params.agent_id ?? 'unknown',
      project_id: params.project_id ?? null,
      request_type: params.request_type ?? 'chat',
      input_tokens: params.input_tokens,
      output_tokens: params.output_tokens,
      cost_usd: cost,
      latency_ms: params.latency_ms ?? null,
      status: params.status ?? 'ok',
      error_code: params.error_code ?? null,
      meta,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[command-center/ingest] trackUsage failed:', error.message);
    return null;
  }

  return data;
}

/**
 * Record a batch of usage events. Returns count inserted.
 */
export async function trackUsageBatch(events: TrackUsageParams[]): Promise<number> {
  const rows = events.map((e) => {
    const meta: Record<string, unknown> = { ...(e.meta ?? {}) };
    if (e.correlation_id) meta.correlation_id = e.correlation_id;
    return {
      provider: e.provider,
      model: e.model,
      agent_id: e.agent_id ?? 'unknown',
      project_id: e.project_id ?? null,
      request_type: e.request_type ?? 'chat',
      input_tokens: e.input_tokens,
      output_tokens: e.output_tokens,
      cost_usd: e.cost_usd ?? computeCost(e.input_tokens, e.output_tokens, e.provider, e.model),
      latency_ms: e.latency_ms ?? null,
      status: e.status ?? 'ok',
      error_code: e.error_code ?? null,
      meta,
    };
  });

  const { data, error } = await supabaseAdmin
    .from('usage_events')
    .insert(rows)
    .select('id');

  if (error) {
    console.error('[command-center/ingest] trackUsageBatch failed:', error.message);
    return 0;
  }

  return data?.length ?? 0;
}

// ── Task Events ────────────────────────────────────────────────

export interface LogTaskEventParams {
  task_id: string;
  agent_id?: string;
  event_type: 'created' | 'claimed' | 'updated' | 'comment' | 'status_change' | 'output_link';
  payload?: Record<string, unknown>;
}

/**
 * Log an event against a project task and bump updated_at.
 */
export async function logTaskEvent(params: LogTaskEventParams): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('task_events')
    .insert({
      task_id: params.task_id,
      agent_id: params.agent_id ?? 'system',
      event_type: params.event_type,
      payload: params.payload ?? {},
    })
    .select('id')
    .single();

  if (error) {
    console.error('[command-center/ingest] logTaskEvent failed:', error.message);
    return null;
  }

  // Bump task updated_at
  await supabaseAdmin
    .from('project_tasks')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', params.task_id);

  return data;
}

// ── Idea Artifacts ─────────────────────────────────────────────

export interface SaveArtifactParams {
  idea_id: string;
  artifact_type: 'summary' | 'research' | 'links' | 'plan' | 'patch' | 'decision' | 'file' | 'analysis';
  content_md: string;
  meta?: Record<string, unknown>;
  // File artifact fields (only for artifact_type = 'file')
  label?: string;
  storage_path?: string;
  content_type?: string;
  extracted_text?: string;
  summary?: string;
}

/**
 * Save an artifact for an idea and update last_processed_at.
 */
export async function saveIdeaArtifact(params: SaveArtifactParams): Promise<{ id: string } | null> {
  const row: Record<string, unknown> = {
    idea_id: params.idea_id,
    artifact_type: params.artifact_type,
    content_md: params.content_md,
    meta: params.meta ?? {},
  };
  if (params.label !== undefined) row.label = params.label;
  if (params.storage_path !== undefined) row.storage_path = params.storage_path;
  if (params.content_type !== undefined) row.content_type = params.content_type;
  if (params.extracted_text !== undefined) row.extracted_text = params.extracted_text;
  if (params.summary !== undefined) row.summary = params.summary;

  const { data, error } = await supabaseAdmin
    .from('idea_artifacts')
    .insert(row)
    .select('id')
    .single();

  if (error) {
    console.error('[command-center/ingest] saveIdeaArtifact failed:', error.message);
    return null;
  }

  // Update idea timestamp
  await supabaseAdmin
    .from('ideas')
    .update({ last_processed_at: new Date().toISOString() })
    .eq('id', params.idea_id);

  return data;
}
