/**
 * Revenue Intelligence – Run State Service
 *
 * Tracks when the last ingestion ran per user so we can count
 * "new since last run" comments for digest alerts.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { SIM_COMMENT_PATTERN } from './simulation-filter';

const TAG = '[ri:run-state]';

export interface RunState {
  last_ingested_at: string;
}

/** Get the run state for a user, or null if first run. */
export async function getRunState(userId: string): Promise<RunState | null> {
  const { data, error } = await supabaseAdmin
    .from('ri_run_state')
    .select('last_ingested_at')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return { last_ingested_at: data.last_ingested_at };
}

/** Upsert run state — sets last_ingested_at = NOW(). */
export async function updateRunState(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('ri_run_state')
    .upsert(
      { user_id: userId, last_ingested_at: now, updated_at: now },
      { onConflict: 'user_id' },
    );

  if (error) {
    console.error(`${TAG} Failed to upsert run state for ${userId}:`, error.message);
  }
}

/** Count comments ingested after `since` for a user (excludes simulation). */
export async function countNewSince(userId: string, since: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('ri_comments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gt('ingested_at', since)
    .not('platform_comment_id', 'like', SIM_COMMENT_PATTERN);

  if (error) {
    console.error(`${TAG} countNewSince failed:`, error.message);
    return 0;
  }

  return count ?? 0;
}
