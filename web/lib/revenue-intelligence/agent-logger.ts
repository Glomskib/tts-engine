/**
 * Revenue Intelligence – Agent Logger
 *
 * Writes structured audit logs to ri_agent_logs.
 * Every service action flows through this logger.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { RiAgentLogInsert } from './types';

const TAG = '[ri:logger]';

export async function logAgentAction(
  entry: RiAgentLogInsert,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('ri_agent_logs')
      .insert(entry);

    if (error) {
      console.error(`${TAG} Failed to write agent log:`, error.message);
    }
  } catch (err) {
    // Never throw from logger — it's fire-and-forget
    console.error(`${TAG} Agent log exception:`, err);
  }
}

export function logAndTime(
  actionType: string,
  userId: string | null,
): { finish: (details: Record<string, unknown>, error?: string) => Promise<void> } {
  const start = Date.now();
  return {
    async finish(details: Record<string, unknown>, error?: string) {
      await logAgentAction({
        user_id: userId,
        action_type: actionType,
        details,
        error: error ?? null,
        duration_ms: Date.now() - start,
      });
    },
  };
}
