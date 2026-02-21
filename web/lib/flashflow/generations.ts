/**
 * @module flashflow/generations
 *
 * Helper for logging AI generations into ff_generations.
 * Call `logGeneration()` from any endpoint that produces AI output
 * (hooks, scripts, briefs, etc.) to feed the self-improvement loop.
 *
 * Usage:
 *   import { logGeneration } from '@/lib/flashflow/generations';
 *   const gen = await logGeneration({
 *     user_id: auth.user.id,
 *     template_id: 'hook_v3',
 *     prompt_version: '1.2.0',
 *     inputs_json: { product, platform },
 *     output_text: generatedHook,
 *   });
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface LogGenerationInput {
  user_id: string;
  template_id: string;
  prompt_version?: string;
  inputs_json?: Record<string, unknown>;
  output_text?: string;
  output_json?: Record<string, unknown>;
  model?: string;
  latency_ms?: number;
  token_count?: number;
  prompt_version_id?: string;
  status?: 'pending' | 'completed' | 'failed' | 'rejected';
  correlation_id?: string;
}

export interface GenerationRow {
  id: string;
  user_id: string;
  template_id: string | null;
  prompt_version: string | null;
  inputs_json: Record<string, unknown>;
  output_text: string | null;
  output_json: Record<string, unknown> | null;
  model: string | null;
  latency_ms: number | null;
  token_count: number | null;
  prompt_version_id: string | null;
  status: string;
  correlation_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Log a generation to ff_generations. Non-throwing — logs errors to console.
 * Returns the inserted row or null on failure.
 */
export async function logGeneration(
  input: LogGenerationInput
): Promise<GenerationRow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ff_generations')
      .insert({
        user_id: input.user_id,
        template_id: input.template_id,
        prompt_version: input.prompt_version ?? null,
        inputs_json: input.inputs_json ?? {},
        output_text: input.output_text ?? null,
        output_json: input.output_json ?? null,
        model: input.model ?? null,
        latency_ms: input.latency_ms ?? null,
        token_count: input.token_count ?? null,
        prompt_version_id: input.prompt_version_id ?? null,
        status: input.status ?? 'completed',
        correlation_id: input.correlation_id ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('[ff:generations] Insert failed:', error.message);
      return null;
    }

    return data as GenerationRow;
  } catch (err) {
    console.error('[ff:generations] Exception:', err);
    return null;
  }
}

/**
 * Fire-and-forget version. Use when you don't need the returned row.
 */
export function logGenerationAsync(input: LogGenerationInput): void {
  logGeneration(input).catch(() => {});
}

/**
 * Update a generation row (e.g., to set status=rejected or add output after streaming).
 */
export async function updateGeneration(
  id: string,
  fields: Partial<Pick<GenerationRow, 'status' | 'output_text' | 'output_json' | 'latency_ms' | 'token_count'>>
): Promise<GenerationRow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ff_generations')
      .update(fields)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[ff:generations] Update failed:', error.message);
      return null;
    }

    return data as GenerationRow;
  } catch (err) {
    console.error('[ff:generations] Update exception:', err);
    return null;
  }
}
