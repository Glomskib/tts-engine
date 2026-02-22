/**
 * Centralized Anthropic API wrapper with automatic usage tracking.
 *
 * Replaces scattered inline `fetch("https://api.anthropic.com/...")` calls.
 * Every successful call logs a usage_events row via trackUsage().
 *
 * Usage:
 *   import { callAnthropicAPI } from '@/lib/ai/anthropic';
 *   const { text, usage } = await callAnthropicAPI(prompt, { correlationId });
 */

import { trackUsage } from '@/lib/command-center/ingest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CallAnthropicOptions {
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  /** Correlation ID for the request chain — stored in usage_events.meta */
  correlationId?: string;
  /** Categorizes the call: 'generation', 'chat', 'analysis', etc. */
  requestType?: string;
  /** Identifies the calling subsystem (e.g. 'generate-content', 'broll') */
  agentId?: string;
  /** Project UUID for cost attribution */
  projectId?: string | null;
  /** Abort signal for caller-controlled timeouts */
  signal?: AbortSignal;
}

export interface AnthropicResult {
  text: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  latency_ms: number;
}

// ---------------------------------------------------------------------------
// Default model
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Call the Anthropic Messages API with automatic usage tracking.
 *
 * On success, fires trackUsage() in the background (non-blocking).
 * On failure, throws with a descriptive error.
 */
export async function callAnthropicAPI(
  prompt: string,
  options?: CallAnthropicOptions,
): Promise<AnthropicResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const model = options?.model || DEFAULT_MODEL;
  const maxTokens = options?.maxTokens || 4096;
  const temperature = options?.temperature ?? 0.7;

  // Build messages — use system field when a system prompt is provided
  const messages: Array<{ role: string; content: string }> = [
    { role: 'user', content: prompt },
  ];

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages,
  };

  if (options?.systemPrompt) {
    body.system = options.systemPrompt;
  }

  const start = Date.now();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: options?.signal ?? AbortSignal.timeout(90_000),
  });

  const latencyMs = Date.now() - start;

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    // Fire-and-forget error tracking
    trackUsage({
      provider: 'anthropic',
      model,
      input_tokens: 0,
      output_tokens: 0,
      latency_ms: latencyMs,
      status: 'error',
      error_code: `HTTP_${response.status}`,
      request_type: options?.requestType ?? 'chat',
      agent_id: options?.agentId,
      project_id: options?.projectId,
      correlation_id: options?.correlationId,
      meta: { error_snippet: errText.slice(0, 200) },
    }).catch(() => {});
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const rawBody = await response.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawBody);
  } catch (parseErr) {
    console.error('[anthropic] Failed to parse API response body:', rawBody.slice(0, 500));
    throw new Error(`Anthropic API returned invalid JSON: ${parseErr instanceof Error ? parseErr.message : 'unknown'}`);
  }

  // Extract text from content blocks
  const textBlock = data.content?.find(
    (b: { type: string; text?: string }) => b.type === 'text',
  );
  const text = textBlock?.text || '';

  // Anthropic returns exact token counts in the response
  const usage = {
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
  };

  // Fire-and-forget usage tracking — never blocks the caller
  trackUsage({
    provider: 'anthropic',
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    latency_ms: latencyMs,
    status: 'ok',
    request_type: options?.requestType ?? 'chat',
    agent_id: options?.agentId,
    project_id: options?.projectId,
    correlation_id: options?.correlationId,
  }).catch((e) => console.error('[anthropic] usage tracking failed:', e));

  return { text, model, usage, latency_ms: latencyMs };
}

/**
 * Convenience: call Anthropic and extract JSON from the response.
 * Handles markdown code blocks and bare JSON objects.
 */
export async function callAnthropicJSON<T = unknown>(
  prompt: string,
  options?: CallAnthropicOptions,
): Promise<{ parsed: T; raw: AnthropicResult }> {
  const result = await callAnthropicAPI(prompt, options);

  let jsonStr = result.text;

  // Strip markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else {
    // Try bare JSON object/array
    const objectMatch = jsonStr.match(/[\[{][\s\S]*[\]}]/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }
  }

  const parsed = JSON.parse(jsonStr) as T;
  return { parsed, raw: result };
}
