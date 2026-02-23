/**
 * GET   /api/admin/command-center/feedback/:id — single item detail
 * PATCH /api/admin/command-center/feedback/:id — update status/priority/assignee/tags
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { UpdateFeedbackItemSchema } from '@/lib/command-center/feedback-validators';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  const { id } = await context.params;

  const { data, error } = await supabaseAdmin
    .from('ff_feedback_items')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data });
}

export async function PATCH(request: Request, context: RouteContext) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = UpdateFeedbackItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: 'Validation error',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.assignee !== undefined) updates.assignee = parsed.data.assignee;
  if (parsed.data.tags !== undefined) updates.tags = parsed.data.tags;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('ff_feedback_items')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
