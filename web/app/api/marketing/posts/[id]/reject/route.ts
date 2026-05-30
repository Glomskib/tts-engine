/**
 * POST /api/marketing/posts/:id/reject
 *
 * Marks a pending marketing_posts row as cancelled. Use this to kill a
 * post Brandon doesn't want to ship — the opposite of approve.
 *
 * Auth: owner session OR Bearer MISSION_CONTROL_TOKEN.
 *
 * Idempotent: re-rejecting an already-cancelled post is a no-op success.
 * Refuses to reject a row that already shipped (status='published' or
 * 'scheduled' with late_post_id set — those need to be killed via Late
 * directly).
 *
 * Body (optional):
 *   approver  string — who rejected (default "brandon")
 *   reason    string — short reason, recorded in error + meta
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireOwner } from '@/lib/command-center/owner-guard';

export const runtime = 'nodejs';

async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
  const serviceToken = process.env.MISSION_CONTROL_TOKEN;
  if (serviceToken) {
    const authHeader = request.headers.get('authorization');
    const serviceAuth =
      request.headers.get('x-service-token') || request.headers.get('x-mc-token');
    if (authHeader === `Bearer ${serviceToken}` || serviceAuth === serviceToken) {
      return null;
    }
  }
  return requireOwner(request);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'post id required in path' }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      body = await request.json();
    }
  } catch {
    // empty body is fine
  }
  const approver = typeof body.approver === 'string' && body.approver.trim()
    ? body.approver.trim()
    : 'brandon';
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : 'rejected by brandon';

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('marketing_posts')
    .select('id, status, meta, late_post_id')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: `post ${id} not found` }, { status: 404 });

  if (existing.status === 'cancelled') {
    return NextResponse.json({
      ok: true,
      already_cancelled: true,
      post_id: existing.id,
      status: 'cancelled',
    });
  }

  if (existing.status === 'published' || existing.late_post_id) {
    return NextResponse.json(
      {
        ok: false,
        error: `post is already at status="${existing.status}" (late_post_id=${existing.late_post_id || 'none'}). Cancel directly in Late.dev.`,
      },
      { status: 409 },
    );
  }

  const rejectedAt = new Date().toISOString();
  const existingMeta = (existing.meta as Record<string, unknown> | null) || {};
  const newMeta = {
    ...existingMeta,
    rejected: true,
    rejected_at: rejectedAt,
    rejected_by: approver,
    rejection_reason: reason,
    // Clear any prior approval so it can't sneak through.
    approved: false,
  };

  const { error: updateErr } = await supabaseAdmin
    .from('marketing_posts')
    .update({
      status: 'cancelled',
      error: reason,
      meta: newMeta,
      updated_at: rejectedAt,
    })
    .eq('id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  console.log(`[marketing/reject] post=${id} rejected_by=${approver} reason="${reason}"`);

  return NextResponse.json({
    ok: true,
    post_id: id,
    status: 'cancelled',
    rejected_at: rejectedAt,
    rejected_by: approver,
    reason,
  });
}
