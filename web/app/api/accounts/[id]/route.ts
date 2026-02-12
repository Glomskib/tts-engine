import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isValidUuid } from '@/lib/validate-uuid';
import { auditLogAsync } from '@/lib/audit';
import { z } from 'zod';

export const runtime = 'nodejs';

const UpdateAccountSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  handle: z.string().min(1).max(100).optional(),
  type: z.enum(['affiliate', 'pod']).optional(),
  category_focus: z.string().max(100).optional(),
  posting_frequency: z.enum(['daily', 'twice_daily', 'every_other_day', 'weekly']).optional(),
  status: z.enum(['active', 'paused', 'flagged', 'banned']).optional(),
  status_reason: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
});

/**
 * PATCH /api/accounts/[id]
 * Update a TikTok account
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const { id } = await params;
    if (!isValidUuid(id)) {
      return createApiErrorResponse('BAD_REQUEST', 'Invalid account ID format', 400, correlationId);
    }

    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
    }

    const parsed = UpdateAccountSchema.safeParse(body);
    if (!parsed.success) {
      return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, {
        issues: parsed.error.issues,
      });
    }

    const { data: account, error } = await supabaseAdmin
      .from('tiktok_accounts')
      .update({
        ...parsed.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', authContext.user.id)
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Error updating account:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to update account', 500, correlationId);
    }

    if (!account) {
      return createApiErrorResponse('NOT_FOUND', 'Account not found', 404, correlationId);
    }

    auditLogAsync({
      correlation_id: correlationId,
      event_type: 'ACCOUNT_UPDATED',
      entity_type: 'ACCOUNT',
      entity_id: id,
      actor: authContext.user.email || authContext.user.id,
      summary: `Account "${account.name || id}" updated`,
      details: { fields: Object.keys(parsed.data) },
    });

    const response = NextResponse.json({
      ok: true,
      data: account,
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Account PATCH error:`, error);
    return createApiErrorResponse(
      'INTERNAL',
      error instanceof Error ? error.message : 'Internal server error',
      500,
      correlationId
    );
  }
}

/**
 * DELETE /api/accounts/[id]
 * Soft delete (set status to 'banned') or hard delete a TikTok account
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const { id } = await params;
    if (!isValidUuid(id)) {
      return createApiErrorResponse('BAD_REQUEST', 'Invalid account ID format', 400, correlationId);
    }

    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    // Hard delete
    const { error } = await supabaseAdmin
      .from('tiktok_accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', authContext.user.id);

    if (error) {
      console.error(`[${correlationId}] Error deleting account:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to delete account', 500, correlationId);
    }

    auditLogAsync({
      correlation_id: correlationId,
      event_type: 'ACCOUNT_DELETED',
      entity_type: 'ACCOUNT',
      entity_id: id,
      actor: authContext.user.email || authContext.user.id,
      summary: `Account ${id} deleted`,
    });

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Account DELETE error:`, error);
    return createApiErrorResponse(
      'INTERNAL',
      error instanceof Error ? error.message : 'Internal server error',
      500,
      correlationId
    );
  }
}
