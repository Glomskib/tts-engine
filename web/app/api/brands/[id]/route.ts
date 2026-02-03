import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { z } from 'zod';

export const runtime = 'nodejs';

const UpdateBrandSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  logo_url: z.string().url().optional().nullable(),
  website: z.string().url().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  colors: z.array(z.string()).optional(),
  tone_of_voice: z.string().max(1000).optional().nullable(),
  target_audience: z.string().max(1000).optional().nullable(),
  guidelines: z.string().max(5000).optional().nullable(),
  monthly_video_quota: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/brands/[id]
 * Get a single brand
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id } = await params;

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('brands')
    .select('*')
    .eq('id', id)
    .eq('user_id', authContext.user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return createApiErrorResponse('NOT_FOUND', 'Brand not found', 404, correlationId);
    }
    console.error('GET /api/brands/[id] error:', error);
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({ ok: true, data, correlation_id: correlationId });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

/**
 * PATCH /api/brands/[id]
 * Update a brand
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id } = await params;

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = UpdateBrandSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      'Invalid input',
      400,
      correlationId,
      { issues: parsed.error.issues }
    );
  }

  const updates = parsed.data;

  if (Object.keys(updates).length === 0) {
    return createApiErrorResponse('BAD_REQUEST', 'No fields to update', 400, correlationId);
  }

  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from('brands')
    .select('id')
    .eq('id', id)
    .eq('user_id', authContext.user.id)
    .single();

  if (!existing) {
    return createApiErrorResponse('NOT_FOUND', 'Brand not found', 404, correlationId);
  }

  // Check for duplicate name if changing name
  if (updates.name) {
    const { data: duplicate } = await supabaseAdmin
      .from('brands')
      .select('id')
      .eq('user_id', authContext.user.id)
      .ilike('name', updates.name)
      .neq('id', id)
      .limit(1);

    if (duplicate && duplicate.length > 0) {
      return createApiErrorResponse(
        'CONFLICT',
        `Brand "${updates.name}" already exists`,
        409,
        correlationId
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from('brands')
    .update(updates)
    .eq('id', id)
    .eq('user_id', authContext.user.id)
    .select()
    .single();

  if (error) {
    console.error('PATCH /api/brands/[id] error:', error);
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({ ok: true, data, correlation_id: correlationId });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

/**
 * DELETE /api/brands/[id]
 * Delete a brand (unlinks products but doesn't delete them)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id } = await params;

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from('brands')
    .select('id')
    .eq('id', id)
    .eq('user_id', authContext.user.id)
    .single();

  if (!existing) {
    return createApiErrorResponse('NOT_FOUND', 'Brand not found', 404, correlationId);
  }

  // Products will be unlinked automatically due to ON DELETE SET NULL
  const { error } = await supabaseAdmin
    .from('brands')
    .delete()
    .eq('id', id)
    .eq('user_id', authContext.user.id);

  if (error) {
    console.error('DELETE /api/brands/[id] error:', error);
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({ ok: true, deleted: id, correlation_id: correlationId });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
