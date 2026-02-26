/**
 * GET  /api/admin/cc-jobs         — list jobs (optional ?status, ?platform filters)
 * POST /api/admin/cc-jobs         — create job + log creation event
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CreateCcJobSchema } from '@/lib/command-center/validators';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');
  const platformFilter = searchParams.get('platform');

  let query = supabaseAdmin
    .from('cc_jobs')
    .select('*')
    .order('updated_at', { ascending: false });

  if (statusFilter) query = query.eq('status', statusFilter);
  if (platformFilter) query = query.eq('platform', platformFilter);

  const { data, error } = await query;

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: data || [],
    count: data?.length ?? 0,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

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

  const parsed = CreateCcJobSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { data, error } = await supabaseAdmin
    .from('cc_jobs')
    .insert({
      title: parsed.data.title,
      source_url: parsed.data.source_url ?? null,
      notes: parsed.data.notes,
      status: parsed.data.status,
      platform: parsed.data.platform,
      hourly_rate: parsed.data.hourly_rate ?? null,
      budget: parsed.data.budget ?? null,
      contact: parsed.data.contact,
      meta: parsed.data.meta ?? {},
    })
    .select('*')
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Log creation event
  await supabaseAdmin.from('cc_job_events').insert({
    job_id: data.id,
    event_type: 'created',
    to_status: parsed.data.status,
    payload: { created_by: auth.user.email },
  });

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data,
  }, { status: 201 });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
