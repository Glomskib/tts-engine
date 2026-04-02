export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export async function POST(req: NextRequest) {
  const correlationId = generateCorrelationId();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = await getApiAuthContext(req);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { item_ids?: string[]; mode?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — defaults applied below
  }

  const mode: string = body.mode === 'post' ? 'post' : 'draft';
  let itemIds: string[] = Array.isArray(body.item_ids) ? body.item_ids : [];

  // ── If no item_ids provided, queue all ready_to_post items for this user ──
  if (itemIds.length === 0) {
    const { data: items, error: fetchErr } = await supabaseAdmin
      .from('content_items')
      .select('id')
      .eq('status', 'ready_to_post')
      .not('final_video_url', 'is', null);

    if (fetchErr) {
      return createApiErrorResponse(
        'DB_ERROR',
        `Failed to fetch ready items: ${fetchErr.message}`,
        500,
        correlationId,
      );
    }

    itemIds = (items ?? []).map((r: { id: string }) => r.id);
  }

  if (itemIds.length === 0) {
    return NextResponse.json({ ok: true, queued: 0, job_dispatched: false, item_ids: [] });
  }

  // ── Mark items as queued ──────────────────────────────────────────────────
  const { error: updateErr } = await supabaseAdmin
    .from('content_items')
    .update({
      tiktok_draft_status: 'queued',
      tiktok_draft_requested_at: new Date().toISOString(),
    })
    .in('id', itemIds);

  if (updateErr) {
    return createApiErrorResponse(
      'DB_ERROR',
      `Failed to queue items: ${updateErr.message}`,
      500,
      correlationId,
    );
  }

  // ── Dispatch to command center ────────────────────────────────────────────
  let jobDispatched = false;
  const missionControlToken = process.env.MISSION_CONTROL_TOKEN;

  if (missionControlToken) {
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

      const dispatchRes = await fetch(`${baseUrl}/api/admin/command-center/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${missionControlToken}`,
        },
        body: JSON.stringify({
          job_type: 'content_item_draft',
          mode,
          item_ids: itemIds,
        }),
      });

      jobDispatched = dispatchRes.ok;
    } catch {
      // Non-fatal: items are already queued, dispatch failure is logged implicitly
      jobDispatched = false;
    }
  }

  return NextResponse.json({
    ok: true,
    queued: itemIds.length,
    job_dispatched: jobDispatched,
    item_ids: itemIds,
  });
}
