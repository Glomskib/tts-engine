/**
 * POST /api/footage/[id]/auto-edit
 *
 * Queue an auto-edit render job for a footage item.
 * Checks entitlement, creates render_job, advances stage to auto_edit_queued.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getFootageItem, queueAutoEdit } from '@/lib/footage/service';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;
  const authCtx = await getApiAuthContext(request);
  if (!authCtx.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  let body: { product_id?: string; context?: string } = {};
  try { body = await request.json(); } catch { /* optional body */ }

  const item = await getFootageItem(id);
  if (!item) return createApiErrorResponse('NOT_FOUND', 'Footage item not found', 404, correlationId);
  if (!authCtx.isAdmin && item.workspace_id !== authCtx.user.id) {
    return createApiErrorResponse('FORBIDDEN', 'Access denied', 403, correlationId);
  }

  try {
    const result = await queueAutoEdit(id, authCtx.user.id, {
      product_id: body.product_id,
      context:    body.context,
    });

    return NextResponse.json({
      ok: true,
      data: { footage_item_id: id, render_job_id: result.render_job_id },
      correlation_id: correlationId,
    });
  } catch (err: any) {
    const status = err.message.includes('not enabled') ? 403
                 : err.message.includes('not found') ? 404
                 : 400;
    return createApiErrorResponse('BAD_REQUEST', err.message, status, correlationId);
  }
}
