import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { z } from 'zod';

export const runtime = 'nodejs';

const hashtagSchema = z.object({
  type: z.literal('hashtag'),
  hashtag: z.string().min(1).max(100),
  category: z.string().max(50).optional(),
  view_count: z.number().int().min(0).optional(),
  video_count: z.number().int().min(0).optional(),
  growth_rate: z.number().optional(),
  notes: z.string().max(5000).optional(),
});

const soundSchema = z.object({
  type: z.literal('sound'),
  sound_name: z.string().min(1).max(200),
  sound_url: z.string().url().optional(),
  creator: z.string().max(100).optional(),
  video_count: z.number().int().min(0).optional(),
  growth_rate: z.number().optional(),
  notes: z.string().max(5000).optional(),
});

/**
 * GET /api/trends — list hashtags and sounds
 * ?type=hashtag|sound|all
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const type = request.nextUrl.searchParams.get('type') || 'all';

    let hashtags: any[] = [];
    let sounds: any[] = [];

    if (type === 'all' || type === 'hashtag') {
      const { data } = await supabaseAdmin
        .from('trending_hashtags')
        .select('*')
        .eq('user_id', authContext.user.id)
        .order('growth_rate', { ascending: false })
        .limit(100);
      hashtags = data || [];
    }

    if (type === 'all' || type === 'sound') {
      const { data } = await supabaseAdmin
        .from('trending_sounds')
        .select('*')
        .eq('user_id', authContext.user.id)
        .order('growth_rate', { ascending: false })
        .limit(100);
      sounds = data || [];
    }

    return NextResponse.json({
      ok: true,
      data: { hashtags, sounds },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Trends GET error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

/**
 * POST /api/trends — add a hashtag or sound
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const body = await request.json();

    if (body.type === 'hashtag') {
      const parsed = hashtagSchema.safeParse(body);
      if (!parsed.success) {
        return createApiErrorResponse('BAD_REQUEST', parsed.error.issues[0]?.message || 'Invalid input', 400, correlationId);
      }
      const { type: _, ...fields } = parsed.data;
      const { data, error } = await supabaseAdmin
        .from('trending_hashtags')
        .insert({ ...fields, user_id: authContext.user.id })
        .select()
        .single();
      if (error) {
        return createApiErrorResponse('DB_ERROR', 'Failed to create hashtag', 500, correlationId);
      }
      return NextResponse.json({ ok: true, data, correlation_id: correlationId }, { status: 201 });
    }

    if (body.type === 'sound') {
      const parsed = soundSchema.safeParse(body);
      if (!parsed.success) {
        return createApiErrorResponse('BAD_REQUEST', parsed.error.issues[0]?.message || 'Invalid input', 400, correlationId);
      }
      const { type: _, ...fields } = parsed.data;
      const { data, error } = await supabaseAdmin
        .from('trending_sounds')
        .insert({ ...fields, user_id: authContext.user.id })
        .select()
        .single();
      if (error) {
        return createApiErrorResponse('DB_ERROR', 'Failed to create sound', 500, correlationId);
      }
      return NextResponse.json({ ok: true, data, correlation_id: correlationId }, { status: 201 });
    }

    return createApiErrorResponse('BAD_REQUEST', 'type must be "hashtag" or "sound"', 400, correlationId);
  } catch (error) {
    console.error(`[${correlationId}] Trends POST error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

/**
 * DELETE /api/trends?id=<id>&type=hashtag|sound
 */
export async function DELETE(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const id = request.nextUrl.searchParams.get('id');
    const type = request.nextUrl.searchParams.get('type');
    if (!id || !type) {
      return createApiErrorResponse('BAD_REQUEST', 'id and type required', 400, correlationId);
    }

    const table = type === 'hashtag' ? 'trending_hashtags' : 'trending_sounds';
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .eq('id', id)
      .eq('user_id', authContext.user.id);

    if (error) {
      return createApiErrorResponse('DB_ERROR', 'Failed to delete', 500, correlationId);
    }

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  } catch (error) {
    console.error(`[${correlationId}] Trends DELETE error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}
