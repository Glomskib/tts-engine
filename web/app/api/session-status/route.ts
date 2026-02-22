/**
 * GET /api/session-status
 *
 * Returns current session validity for all nodes/platforms.
 * Used by Mission Control to monitor TikTok session health.
 *
 * Query params:
 *   ?platform=tiktok  — filter by platform
 *
 * No auth required (read-only health status).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllSessionStatuses } from '@/lib/session-logger';

export async function GET(request: NextRequest) {
  const platform = request.nextUrl.searchParams.get('platform') || undefined;

  const statuses = await getAllSessionStatuses(platform);

  // Annotate each row with computed TTL state
  const now = new Date();
  const enriched = statuses.map((s) => ({
    ...s,
    is_within_ttl: s.is_valid && new Date(s.expires_at) > now,
    ttl_remaining_hours: Math.max(
      0,
      Math.round(
        (new Date(s.expires_at).getTime() - now.getTime()) / (1000 * 60 * 60) * 10
      ) / 10
    ),
  }));

  return NextResponse.json({
    ok: true,
    count: enriched.length,
    statuses: enriched,
    queried_at: now.toISOString(),
  });
}
