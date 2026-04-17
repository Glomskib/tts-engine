import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { shotstackRequest } from '@/lib/shotstack';
import type {
  EnqueueRenderInput,
  EnqueueRenderResult,
  RenderJob,
  OutputSpec,
} from './types';

const DEFAULT_OUTPUT: OutputSpec = {
  format: 'mp4',
  resolution: 'hd',
  aspectRatio: '9:16',
  fps: 30,
};

const HEARTBEAT_FRESHNESS_MS = 2 * 60 * 1000;

export async function getOnlineWorkerCount(): Promise<number> {
  const cutoff = new Date(Date.now() - HEARTBEAT_FRESHNESS_MS).toISOString();
  const { count, error } = await supabaseAdmin
    .from('ff_render_workers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'online')
    .gte('last_heartbeat_at', cutoff);
  if (error) {
    console.error('[render-dispatch] worker count failed:', error.message);
    return 0;
  }
  return count ?? 0;
}

function shouldUseLocalFleet(): boolean {
  return process.env.RENDER_FLEET_ENABLED !== 'false';
}

export async function enqueueRender(input: EnqueueRenderInput): Promise<EnqueueRenderResult> {
  const output = { ...DEFAULT_OUTPUT, ...(input.output || {}) };

  // Capability gate: local Mac-mini fleet can ONLY process clip_render jobs.
  // Timeline renders (overlays/captions/CTA) require Shotstack's video-asset
  // feature and would fail on-worker with "unsupported_feature: asset type 'video'".
  // This check is the single source of truth for render routing.
  const kind = input.kind || 'shotstack_timeline';
  const canUseLocal = kind === 'clip_render';

  if (canUseLocal && shouldUseLocalFleet()) {
    const onlineWorkers = await getOnlineWorkerCount();
    if (onlineWorkers > 0) {
      const { data, error } = await supabaseAdmin
        .from('ff_render_jobs')
        .insert({
          user_id: input.userId || null,
          correlation_id: input.correlationId || null,
          kind: input.kind || 'shotstack_timeline',
          priority: input.priority ?? 100,
          timeline: input.timeline,
          output_spec: output,
        })
        .select('id, status')
        .single();

      if (!error && data) {
        return { jobId: data.id, provider: 'local', status: data.status };
      }
      console.error('[render-dispatch] enqueue failed, falling back to Shotstack:', error?.message);
    }
  }

  const response = await shotstackRequest('/render', {
    method: 'POST',
    body: JSON.stringify({ timeline: input.timeline, output }),
  });
  const renderId: string = response.response?.id || response.id;

  const { data: job } = await supabaseAdmin
    .from('ff_render_jobs')
    .insert({
      user_id: input.userId || null,
      correlation_id: input.correlationId || null,
      kind: input.kind || 'shotstack_timeline',
      timeline: input.timeline,
      output_spec: output,
      status: 'fallback_shotstack',
      shotstack_render_id: renderId,
    })
    .select('id')
    .single();

  return {
    jobId: job?.id || renderId,
    provider: 'shotstack',
    status: 'fallback_shotstack',
    shotstackRenderId: renderId,
  };
}

export async function getRenderStatus(jobId: string): Promise<RenderJob | null> {
  const { data, error } = await supabaseAdmin
    .from('ff_render_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error || !data) return null;
  const job = data as RenderJob;

  if (job.status === 'fallback_shotstack' && job.shotstack_render_id && !job.output_url) {
    try {
      const status = await shotstackRequest(`/render/${job.shotstack_render_id}`);
      const ssStatus: string = status.response?.status || status.status;
      const ssUrl: string | undefined = status.response?.url || status.url;

      if (ssStatus === 'done' && ssUrl) {
        await supabaseAdmin
          .from('ff_render_jobs')
          .update({
            status: 'done',
            output_url: ssUrl,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
        job.status = 'done';
        job.output_url = ssUrl;
      } else if (ssStatus === 'failed') {
        await supabaseAdmin
          .from('ff_render_jobs')
          .update({
            status: 'failed',
            error: status.response?.error || 'Shotstack render failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
        job.status = 'failed';
      }
    } catch (err) {
      console.error('[render-dispatch] shotstack status check failed:', err);
    }
  }

  return job;
}
