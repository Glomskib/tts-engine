/**
 * GET    /api/admin/crm/deals/:id — deal detail with activities
 * PATCH  /api/admin/crm/deals/:id — update deal (stage move triggers moveDealStage)
 * DELETE /api/admin/crm/deals/:id — delete deal
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { UpdateDealSchema } from '@/lib/command-center/crm-validators';
import { moveDealStage } from '@/lib/command-center/crm-ingest';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id } = await context.params;

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const [dealRes, activitiesRes] = await Promise.all([
    supabaseAdmin.from('crm_deals').select('*, crm_contacts(id, name, email, company)').eq('id', id).single(),
    supabaseAdmin.from('crm_activities').select('*').eq('deal_id', id).order('ts', { ascending: false }).limit(50),
  ]);

  if (dealRes.error || !dealRes.data) {
    return createApiErrorResponse('NOT_FOUND', 'Deal not found', 404, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: {
      ...dealRes.data,
      activities: activitiesRes.data || [],
    },
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

export async function PATCH(request: Request, context: RouteContext) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id } = await context.params;

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

  const parsed = UpdateDealSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  // If stage_key is changing, use moveDealStage for auto-logging
  if (parsed.data.stage_key) {
    const moveResult = await moveDealStage(id, parsed.data.stage_key, 'admin');
    if (!moveResult.success) {
      return createApiErrorResponse('DB_ERROR', moveResult.error || 'Stage move failed', 500, correlationId);
    }
  }

  // Build remaining updates (excluding stage_key which was handled above)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.contact_id !== undefined) updates.contact_id = parsed.data.contact_id;
  if (parsed.data.value_cents !== undefined) updates.value_cents = parsed.data.value_cents;
  if (parsed.data.probability !== undefined) updates.probability = parsed.data.probability;
  if (parsed.data.sort_order !== undefined) updates.sort_order = parsed.data.sort_order;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
  if (parsed.data.meta !== undefined) updates.meta = parsed.data.meta;

  const { data, error } = await supabaseAdmin
    .from('crm_deals')
    .update(updates)
    .eq('id', id)
    .select('*, crm_contacts(id, name, email, company)')
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

export async function DELETE(request: Request, context: RouteContext) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id } = await context.params;

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const { error } = await supabaseAdmin
    .from('crm_deals')
    .delete()
    .eq('id', id);

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
