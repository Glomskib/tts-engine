/**
 * GET  /api/admin/crm/deals — list deals (filter by pipeline/stage/contact)
 * POST /api/admin/crm/deals — create deal
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CreateDealSchema } from '@/lib/command-center/crm-validators';

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
  const pipelineId = searchParams.get('pipeline_id');
  const stageKey = searchParams.get('stage_key');
  const contactId = searchParams.get('contact_id');
  const limitParam = parseInt(searchParams.get('limit') || '200', 10);
  const limit = Math.min(Math.max(1, limitParam), 500);

  let query = supabaseAdmin
    .from('crm_deals')
    .select('*, crm_contacts(id, name, email, company)')
    .order('sort_order', { ascending: true })
    .limit(limit);

  if (pipelineId) query = query.eq('pipeline_id', pipelineId);
  if (stageKey) query = query.eq('stage_key', stageKey);
  if (contactId) query = query.eq('contact_id', contactId);

  const { data, error } = await query;

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: data || [],
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

  const parsed = CreateDealSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  // Calculate sort_order: place at end of target stage
  const { data: lastDeal } = await supabaseAdmin
    .from('crm_deals')
    .select('sort_order')
    .eq('pipeline_id', parsed.data.pipeline_id)
    .eq('stage_key', parsed.data.stage_key)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const sortOrder = lastDeal ? lastDeal.sort_order + 1 : 0;

  const { data, error } = await supabaseAdmin
    .from('crm_deals')
    .insert({ ...parsed.data, sort_order: sortOrder })
    .select('*, crm_contacts(id, name, email, company)')
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data,
  }, { status: 201 });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
