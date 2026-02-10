import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { z } from 'zod';

export const runtime = 'nodejs';

const UpdateCompetitorSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tiktok_handle: z.string().min(1).max(100).optional(),
  category: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  try {
    const { id } = await params;
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { data: competitor, error } = await supabaseAdmin
      .from('competitors')
      .select('*')
      .eq('id', id)
      .eq('user_id', authContext.user.id)
      .single();

    if (error || !competitor) {
      return createApiErrorResponse('NOT_FOUND', 'Competitor not found', 404, correlationId);
    }

    const { data: videos } = await supabaseAdmin
      .from('competitor_videos')
      .select('*')
      .eq('competitor_id', id)
      .order('views', { ascending: false })
      .limit(50);

    return NextResponse.json({ ok: true, data: { ...competitor, videos: videos || [] }, correlation_id: correlationId });
  } catch (err) {
    return createApiErrorResponse('INTERNAL', (err as Error).message, 500, correlationId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  try {
    const { id } = await params;
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    let body: unknown;
    try { body = await request.json(); } catch {
      return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
    }

    const parsed = UpdateCompetitorSchema.safeParse(body);
    if (!parsed.success) {
      return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId);
    }

    const { data, error } = await supabaseAdmin
      .from('competitors')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', authContext.user.id)
      .select()
      .single();

    if (error) {
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }

    return NextResponse.json({ ok: true, data, correlation_id: correlationId });
  } catch (err) {
    return createApiErrorResponse('INTERNAL', (err as Error).message, 500, correlationId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  try {
    const { id } = await params;
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { error } = await supabaseAdmin
      .from('competitors')
      .delete()
      .eq('id', id)
      .eq('user_id', authContext.user.id);

    if (error) {
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  } catch (err) {
    return createApiErrorResponse('INTERNAL', (err as Error).message, 500, correlationId);
  }
}
