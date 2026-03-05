/**
 * Job Queue — Enqueue helper
 *
 * Use this to schedule background work from API routes.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { JobType } from './types';

export async function enqueueJob(
  workspaceId: string,
  type: JobType,
  payload: Record<string, unknown> = {},
  maxAttempts = 3,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .insert({
      workspace_id: workspaceId,
      type,
      payload,
      max_attempts: maxAttempts,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[enqueueJob] Insert failed:', error);
    return null;
  }

  return data?.id ?? null;
}
