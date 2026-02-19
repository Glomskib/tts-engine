import { trackUsage } from '@/lib/command-center/ingest';

const RUNWAY_BASE_URL = 'https://api.dev.runwayml.com';
const RUNWAY_API_VERSION = '2024-11-06';

export type RunwayModel = 'gen3a_turbo' | 'gen4.5' | 'veo3' | 'veo3.1' | 'veo3.1_fast';

export function getRunwayConfig() {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) throw new Error('Missing RUNWAY_API_KEY environment variable');
  return { apiKey };
}

export async function runwayRequest(path: string, options: RequestInit = {}) {
  const config = getRunwayConfig();
  const url = `${RUNWAY_BASE_URL}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      'X-Runway-Version': RUNWAY_API_VERSION,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Runway ${response.status}: ${error}`);
  }

  return response.json();
}

export async function createTextToVideo(
  prompt: string,
  model: RunwayModel = 'gen4.5',
  duration?: number,
  ratio = '720:1280',
  trackingOptions?: { correlationId?: string; agentId?: string },
) {
  const body: Record<string, unknown> = {
    model,
    promptText: prompt,
    ratio,
  };
  if (duration) body.duration = duration;

  const start = Date.now();
  const result = await runwayRequest('/v1/text_to_video', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  trackUsage({
    provider: 'runway',
    model,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    latency_ms: Date.now() - start,
    request_type: 'text_to_video',
    agent_id: trackingOptions?.agentId,
    correlation_id: trackingOptions?.correlationId,
    meta: {
      runway_task_id: result?.id,
      duration_seconds: duration,
      ratio,
      note: 'cost depends on Runway plan; reconcile after completion',
    },
  }).catch((e) => console.error('[runway] usage tracking failed:', e));

  return result;
}

export async function createImageToVideo(
  imageUrl: string,
  prompt: string,
  model: RunwayModel = 'gen4.5',
  duration?: number,
  ratio = '720:1280',
  trackingOptions?: { correlationId?: string; agentId?: string },
) {
  const body: Record<string, unknown> = {
    model,
    promptImage: imageUrl,
    promptText: prompt,
    ratio,
  };
  if (duration) body.duration = duration;

  const start = Date.now();
  const result = await runwayRequest('/v1/image_to_video', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  trackUsage({
    provider: 'runway',
    model,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    latency_ms: Date.now() - start,
    request_type: 'image_to_video',
    agent_id: trackingOptions?.agentId,
    correlation_id: trackingOptions?.correlationId,
    meta: {
      runway_task_id: result?.id,
      duration_seconds: duration,
      ratio,
      note: 'cost depends on Runway plan; reconcile after completion',
    },
  }).catch((e) => console.error('[runway] usage tracking failed:', e));

  return result;
}

export async function getTaskStatus(taskId: string) {
  return runwayRequest(`/v1/tasks/${taskId}`);
}
