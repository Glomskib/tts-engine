/**
 * POST /api/render-jobs/heartbeat
 *
 * Render nodes ping this every 30s to register presence.
 * We track last_seen per node in a lightweight in-memory + DB record.
 *
 * Authenticated via RENDER_NODE_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

const RENDER_NODE_SECRET = process.env.RENDER_NODE_SECRET;

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();

  const secret = request.headers.get('x-render-node-secret');
  if (!RENDER_NODE_SECRET || secret !== RENDER_NODE_SECRET) {
    return createApiErrorResponse('UNAUTHORIZED', 'Invalid render node secret', 401, correlationId);
  }

  let body: { node_id: string; current_job_id?: string | null; ffmpeg_version?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  // Upsert node record (non-fatal if table doesn't exist yet)
  try {
    await supabaseAdmin
      .from('render_nodes')
      .upsert({
        node_id: body.node_id,
        last_seen: new Date().toISOString(),
        current_job_id: body.current_job_id || null,
        ffmpeg_version: body.ffmpeg_version || null,
        platform: body.platform || null,
      }, { onConflict: 'node_id' });
  } catch {
    // Table may not exist yet — non-fatal
  }

  return NextResponse.json({ ok: true, correlation_id: correlationId });
}

/**
 * GET /api/render-jobs/heartbeat
 * Returns list of known render nodes and their status (admin use).
 */
export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();

  const secret = request.headers.get('x-render-node-secret');
  const isNodeRequest = RENDER_NODE_SECRET && secret === RENDER_NODE_SECRET;

  if (!isNodeRequest) {
    // Fall back to admin session auth
    const { getApiAuthContext } = await import('@/lib/supabase/api-auth');
    const authCtx = await getApiAuthContext(request);
    if (!authCtx.user || !authCtx.isAdmin) {
      return createApiErrorResponse('UNAUTHORIZED', 'Admin access required', 401, correlationId);
    }
  }

  const { data: nodes } = await supabaseAdmin
    .from('render_nodes')
    .select('*')
    .order('last_seen', { ascending: false });

  // Mark nodes as online/offline (online = seen in last 90 seconds)
  const now = Date.now();
  const enriched = (nodes || []).map((n: any) => ({
    ...n,
    online: now - new Date(n.last_seen).getTime() < 90_000,
  }));

  // Get queued job count
  const { count: queued } = await supabaseAdmin
    .from('render_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'queued');

  const { count: processing } = await supabaseAdmin
    .from('render_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'processing');

  return NextResponse.json({
    ok: true,
    data: {
      nodes: enriched,
      queue: { queued: queued || 0, processing: processing || 0 },
    },
    correlation_id: correlationId,
  });
}
