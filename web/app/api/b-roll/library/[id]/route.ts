// B-Roll Library API - Update and delete individual images
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const correlationId = generateCorrelationId();
  const { id } = await params;

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.is_favorite === 'boolean') {
    updateData.is_favorite = body.is_favorite;
  }
  if (body.folder !== undefined) {
    updateData.folder = body.folder;
  }
  if (Array.isArray(body.tags)) {
    updateData.tags = body.tags;
  }

  const { data, error } = await supabaseAdmin
    .from('b_roll_library')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', authContext.user.id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return createApiErrorResponse('NOT_FOUND', 'Image not found', 404, correlationId);
    }
    console.error('[B-Roll Library] Update error:', error);
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: { image: data },
    correlation_id: correlationId,
  });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const correlationId = generateCorrelationId();
  const { id } = await params;

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { error } = await supabaseAdmin
    .from('b_roll_library')
    .delete()
    .eq('id', id)
    .eq('user_id', authContext.user.id);

  if (error) {
    console.error('[B-Roll Library] Delete error:', error);
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    correlation_id: correlationId,
  });
}
