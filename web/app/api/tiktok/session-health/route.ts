/**
 * GET /api/tiktok/session-health
 *
 * Lightweight pre-flight check for TikTok Studio session validity.
 * Combines the DB-backed ff_session_status with local lockfile/profile checks.
 *
 * Response:
 *   { valid: boolean, expires_in_hours: number, cooldown_active: boolean }
 *
 * No auth required (read-only health check, same pattern as /api/session-status).
 */

import { NextResponse } from 'next/server';
import * as os from 'os';
import { getSessionIfWithinTTL } from '@/lib/session-logger';
import { getLocalSessionHealth } from '@/lib/tiktok/session';

export async function GET() {
  const nodeName = os.hostname();
  const platform = 'tiktok_studio';

  // 1. Check DB-backed session status
  const dbRow = await getSessionIfWithinTTL({ nodeName, platform });

  // 2. Check local lockfile / profile
  const local = getLocalSessionHealth();

  // 3. Compute expires_in_hours from DB row
  let expiresInHours = 0;
  if (dbRow?.expires_at) {
    const diffMs = new Date(dbRow.expires_at).getTime() - Date.now();
    expiresInHours = Math.max(0, Math.round((diffMs / 3_600_000) * 10) / 10);
  }

  // 4. valid = DB row says valid AND within TTL AND no cooldown
  const valid = !!(dbRow?.is_valid) && !local.cooldown_active;

  return NextResponse.json({
    valid,
    expires_in_hours: expiresInHours,
    cooldown_active: local.cooldown_active,
  });
}
