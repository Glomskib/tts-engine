/**
 * GET    /api/admin/crm/contacts/:id — contact detail with deals + activities
 * PATCH  /api/admin/crm/contacts/:id — update contact
 * DELETE /api/admin/crm/contacts/:id — delete contact
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { UpdateContactSchema } from '@/lib/command-center/crm-validators';

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

  const [contactRes, dealsRes, activitiesRes] = await Promise.all([
    supabaseAdmin.from('crm_contacts').select('*').eq('id', id).single(),
    supabaseAdmin.from('crm_deals').select('*').eq('contact_id', id).order('created_at', { ascending: false }),
    supabaseAdmin.from('crm_activities').select('*').eq('contact_id', id).order('ts', { ascending: false }).limit(50),
  ]);

  if (contactRes.error || !contactRes.data) {
    return createApiErrorResponse('NOT_FOUND', 'Contact not found', 404, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: {
      ...contactRes.data,
      deals: dealsRes.data || [],
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

  const parsed = UpdateContactSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.email !== undefined) updates.email = parsed.data.email;
  if (parsed.data.company !== undefined) updates.company = parsed.data.company;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
  if (parsed.data.meta !== undefined) updates.meta = parsed.data.meta;

  const { data, error } = await supabaseAdmin
    .from('crm_contacts')
    .update(updates)
    .eq('id', id)
    .select('*')
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
    .from('crm_contacts')
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
