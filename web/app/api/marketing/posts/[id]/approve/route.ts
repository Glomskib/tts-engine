/**
 * POST /api/marketing/posts/:id/approve
 *
 * Marks a marketing_posts row as approved by Brandon. The scheduler cron
 * only publishes posts with meta.approved=true (and MARKETING_AUTOPUBLISH=on).
 * This is the human-in-the-loop step that was missing — see the bleed-stop
 * commit 2026-05-30.
 *
 * Auth: owner session OR Bearer MISSION_CONTROL_TOKEN. Same model as
 *       /api/marketing/enqueue so mc-post, Telegram bots, and Mission
 *       Control can all call it.
 *
 * Idempotent: re-approving an already-approved post is a no-op success.
 * Refuses to approve a row whose status is published / failed / cancelled.
 *
 * Body (optional):
 *   approver  string — display name/handle that approved it (default "brandon")
 *   note      string — optional reason or context recorded in meta
 *
 * Returns: { ok, post_id, status, approved_at, approved_by }
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

const APPROVABLE_STATUSES = new Set(['pending']);

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
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : undefined;

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('marketing_posts')
    .select('id, status, meta, content, platforms')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: `post ${id} not found` }, { status: 404 });
  }

  if (!APPROVABLE_STATUSES.has(existing.status)) {
    return NextResponse.json(
      {
        ok: false,
        error: `cannot approve post in status="${existing.status}". Only 'pending' rows are approvable.`,
        post_id: existing.id,
        status: existing.status,
      },
      { status: 409 },
    );
  }

  const existingMeta = (existing.meta as Record<string, unknown> | null) || {};
  // Idempotent: short-circuit on re-approval.
  if (existingMeta.approved === true) {
    return NextResponse.json({
      ok: true,
      already_approved: true,
      post_id: existing.id,
      status: existing.status,
      approved_at: existingMeta.approved_at,
      approved_by: existingMeta.approved_by,
    });
  }

  const approvedAt = new Date().toISOString();
  const newMeta = {
    ...existingMeta,
    approved: true,
    approved_at: approvedAt,
    approved_by: approver,
    ...(note ? { approval_note: note } : {}),
  };

  const { error: updateErr } = await supabaseAdmin
    .from('marketing_posts')
    .update({
      meta: newMeta,
      updated_at: approvedAt,
    })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  console.log(`[marketing/approve] post=${id} approved_by=${approver} platforms=${JSON.stringify(existing.platforms)}`);

  return NextResponse.json({
    ok: true,
    post_id: id,
    status: existing.status,
    approved_at: approvedAt,
    approved_by: approver,
    next_step:
      process.env.MARKETING_AUTOPUBLISH === 'on'
        ? 'Next marketing-scheduler cron run (within 15 min) will ship this to Late.dev.'
        : 'Approved, but MARKETING_AUTOPUBLISH env is OFF. Set it to "on" in Vercel for this post to actually ship.',
  });
}
