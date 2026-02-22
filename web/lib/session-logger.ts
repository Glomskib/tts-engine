/**
 * Session validity logger and TTL logic.
 * Writes to Supabase ff_session_status table and provides TTL checks.
 *
 * Used by:
 * - auto-post cron to log Content API token health
 * - browser-service (via its own Supabase client) for TikTok Studio session checks
 * - Mission Control queries via /api/session-status
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

const SESSION_TTL_HOURS = parseInt(process.env.SESSION_TTL_HOURS || '24', 10);

export interface SessionValidityResult {
  isValid: boolean;
  reason: string;
  detectedAt: string;
}

export interface SessionStatusRow {
  id: string;
  node_name: string;
  platform: string;
  account_id: string | null;
  is_valid: boolean;
  reason: string | null;
  last_validated_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Log session validity to ff_session_status.
 * Upserts by (node_name, platform, account_id) so each combo has exactly one row.
 */
export async function logSessionValidity(params: {
  nodeName: string;
  platform: string;
  isValid: boolean;
  reason: string;
  accountId?: string | null;
}): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  try {
    const { error } = await supabaseAdmin
      .from('ff_session_status')
      .upsert(
        {
          node_name: params.nodeName,
          platform: params.platform,
          account_id: params.accountId || null,
          is_valid: params.isValid,
          reason: params.reason,
          last_validated_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        },
        {
          onConflict: 'node_name,platform',
          ignoreDuplicates: false,
        }
      );

    if (error) {
      console.error('[session-logger] Supabase error:', error.message);
    }
  } catch (err) {
    console.error('[session-logger] Exception:', err);
  }
}

/**
 * Check if the cached session status is still within TTL (not expired).
 * Returns the cached row if valid and within TTL, otherwise null.
 */
export async function getSessionIfWithinTTL(params: {
  nodeName: string;
  platform: string;
  accountId?: string | null;
}): Promise<SessionStatusRow | null> {
  try {
    let query = supabaseAdmin
      .from('ff_session_status')
      .select('*')
      .eq('node_name', params.nodeName)
      .eq('platform', params.platform);

    if (params.accountId) {
      query = query.eq('account_id', params.accountId);
    }

    const { data, error } = await query.single();

    if (error || !data) return null;

    const row = data as SessionStatusRow;
    const now = new Date();
    const expiresAt = new Date(row.expires_at);

    // Within TTL and was valid → return cached
    if (row.is_valid && now < expiresAt) {
      return row;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get all session statuses for a platform (used by Mission Control API).
 */
export async function getAllSessionStatuses(platform?: string): Promise<SessionStatusRow[]> {
  try {
    let query = supabaseAdmin
      .from('ff_session_status')
      .select('*')
      .order('updated_at', { ascending: false });

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[session-logger] Query error:', error.message);
      return [];
    }

    return (data || []) as SessionStatusRow[];
  } catch {
    return [];
  }
}
