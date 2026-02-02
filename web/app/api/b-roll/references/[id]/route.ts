// Reference Images API - Update and delete individual reference images
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

  if (typeof body.name === 'string') {
    updateData.name = body.name;
  }
  if (body.folder !== undefined) {
    updateData.folder = body.folder;
  }
  if (Array.isArray(body.tags)) {
    updateData.tags = body.tags;
  }

  const { data, error } = await supabaseAdmin
    .from('reference_images')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', authContext.user.id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return createApiErrorResponse('NOT_FOUND', 'Reference image not found', 404, correlationId);
    }
    console.error('[Reference Images] Update error:', error);
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

  // Get the image first to potentially delete from storage
  const { data: image } = await supabaseAdmin
    .from('reference_images')
    .select('url')
    .eq('id', id)
    .eq('user_id', authContext.user.id)
    .single();

  const { error } = await supabaseAdmin
    .from('reference_images')
    .delete()
    .eq('id', id)
    .eq('user_id', authContext.user.id);

  if (error) {
    console.error('[Reference Images] Delete error:', error);
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    deleted_url: image?.url,
    correlation_id: correlationId,
  });
}
