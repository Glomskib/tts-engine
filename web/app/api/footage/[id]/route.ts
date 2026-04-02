/**
 * GET   /api/footage/[id]  — full detail with relations
 * PATCH /api/footage/[id]  — update stage, metadata, etc.
 * DELETE /api/footage/[id] — soft delete
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getFootageItem, updateFootageItem, deleteFootageItem } from '@/lib/footage/service';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import type { UpdateFootageItemInput } from '@/lib/footage/types';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;
  const authCtx = await getApiAuthContext(request);
  if (!authCtx.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const item = await getFootageItem(id);
  if (!item) return createApiErrorResponse('NOT_FOUND', 'Footage item not found', 404, correlationId);

  // Workspace check (admin can see all)
  if (!authCtx.isAdmin && item.workspace_id !== authCtx.user.id) {
    return createApiErrorResponse('FORBIDDEN', 'Access denied', 403, correlationId);
  }

  return NextResponse.json({ ok: true, data: item, correlation_id: correlationId });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;
  const authCtx = await getApiAuthContext(request);
  if (!authCtx.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  let body: UpdateFootageItemInput;
  try { body = await request.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  try {
    const updated = await updateFootageItem(id, body, authCtx.user.id);
    return NextResponse.json({ ok: true, data: updated, correlation_id: correlationId });
  } catch (err: any) {
    return createApiErrorResponse('BAD_REQUEST', err.message, 400, correlationId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;
  const authCtx = await getApiAuthContext(request);
  if (!authCtx.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  await deleteFootageItem(id, authCtx.user.id);
  return NextResponse.json({ ok: true, correlation_id: correlationId });
}
