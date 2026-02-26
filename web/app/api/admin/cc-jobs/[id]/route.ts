/**
 * GET   /api/admin/cc-jobs/[id]  — get job + events
 * PATCH /api/admin/cc-jobs/[id]  — update job, auto-log status changes
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { UpdateCcJobSchema } from '@/lib/command-center/validators';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id } = await params;

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const [jobRes, eventsRes] = await Promise.all([
    supabaseAdmin.from('cc_jobs').select('*').eq('id', id).single(),
    supabaseAdmin.from('cc_job_events').select('*').eq('job_id', id).order('ts', { ascending: false }),
  ]);

  if (jobRes.error) {
    if (jobRes.error.code === 'PGRST116') {
      return createApiErrorResponse('NOT_FOUND', 'Job not found', 404, correlationId);
    }
    return createApiErrorResponse('DB_ERROR', jobRes.error.message, 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: {
      ...jobRes.data,
      events: eventsRes.data || [],
    },
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id } = await params;

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = UpdateCcJobSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  // Fetch current job to detect status change
  let oldStatus: string | null = null;
  if (parsed.data.status) {
    const { data: current } = await supabaseAdmin.from('cc_jobs').select('status').eq('id', id).single();
    oldStatus = current?.status ?? null;
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.source_url !== undefined) updates.source_url = parsed.data.source_url;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.platform !== undefined) updates.platform = parsed.data.platform;
  if (parsed.data.hourly_rate !== undefined) updates.hourly_rate = parsed.data.hourly_rate;
  if (parsed.data.budget !== undefined) updates.budget = parsed.data.budget;
  if (parsed.data.contact !== undefined) updates.contact = parsed.data.contact;

  const { data, error } = await supabaseAdmin
    .from('cc_jobs')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Log status change event
  if (parsed.data.status && oldStatus && parsed.data.status !== oldStatus) {
    await supabaseAdmin.from('cc_job_events').insert({
      job_id: id,
      event_type: 'status_change',
      from_status: oldStatus,
      to_status: parsed.data.status,
      payload: { updated_by: auth.user.email },
    });
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
