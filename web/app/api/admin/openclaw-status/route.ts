/**
 * GET /api/admin/openclaw-status
 *
 * Returns OpenClaw feature gate status, last heartbeat (usage event),
 * and MC connectivity state.
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { isOpenClawEnabled, FEATURE_REGISTRY, isFeatureRequired } from '@/lib/openclaw-gate';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getMCDebugState } from '@/lib/flashflow/mission-control';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  const enabled = isOpenClawEnabled();

  // Last openclaw usage event (heartbeat proxy)
  let lastHeartbeat: string | null = null;
  let lastError: string | null = null;
  try {
    const { data } = await supabaseAdmin
      .from('ff_usage_events')
      .select('created_at')
      .eq('source', 'openclaw')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    lastHeartbeat = data?.created_at ?? null;
  } catch {
    lastError = 'Failed to query ff_usage_events';
  }

  // Last agent run
  let lastAgentRun: { agent_id: string; status: string; ended_at: string } | null = null;
  try {
    const { data } = await supabaseAdmin
      .from('agent_runs')
      .select('agent_id, status, ended_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (data) {
      lastAgentRun = {
        agent_id: data.agent_id,
        status: data.status,
        ended_at: data.ended_at,
      };
    }
  } catch {
    // table may not have rows
  }

  // MC debug state (reads env vars, no HTTP call)
  const mcDebug = getMCDebugState();

  // Feature gates
  const requiredFeaturesRaw = process.env.OPENCLAW_REQUIRED_FEATURES ?? '';
  const features = FEATURE_REGISTRY.map((f) => ({
    key: f.key,
    description: f.description,
    route: f.route,
    required: isFeatureRequired(f.key),
    would_block: !enabled && isFeatureRequired(f.key),
  }));

  return NextResponse.json({
    ok: true,
    openclaw_enabled: enabled,
    env_var: process.env.OPENCLAW_ENABLED ?? '(not set — defaults to true)',
    required_features_env: requiredFeaturesRaw || '(not set — all optional)',
    features,
    last_heartbeat: lastHeartbeat,
    last_agent_run: lastAgentRun,
    mission_control: {
      base_url: mcDebug.baseUrl,
      token_source: mcDebug.tokenEnvVar,
      tokens_present: mcDebug.envVarsPresent,
      last_auth_check: mcDebug.lastAuthCheck,
    },
    last_error: lastError,
  });
}
