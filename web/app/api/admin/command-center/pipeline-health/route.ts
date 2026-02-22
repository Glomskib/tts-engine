/**
 * GET /api/admin/command-center/pipeline-health
 *
 * Owner-only server-side proxy to Mission Control pipeline health.
 * Keeps MC_API_TOKEN server-side (never exposed to client).
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { fetchMCPipelineHealth } from '@/lib/flashflow/mission-control';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  const result = await fetchMCPipelineHealth();

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      queued_count: result.queued_count,
      executing_count: result.executing_count,
      blocked_count: result.blocked_count,
      last_updated: result.last_updated,
    },
  });
}
