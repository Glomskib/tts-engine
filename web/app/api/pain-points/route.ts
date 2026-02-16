import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

/**
 * GET /api/pain-points — fetch all saved pain points for current user
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { data: painPoints, error } = await supabaseAdmin
      .from('saved_pain_points')
      .select('*')
      .eq('user_id', authContext.user.id)
      .order('times_used', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`[${correlationId}] Pain points fetch error:`, error);
      // Return empty data gracefully (table may not exist yet)
      return NextResponse.json({
        ok: true,
        data: [],
        correlation_id: correlationId,
      });
    }

    return NextResponse.json({
      ok: true,
      data: painPoints || [],
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Pain points error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

/**
 * POST /api/pain-points — create a new saved pain point
 * Body: { pain_point_text: string; category?: string }
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const body = await request.json();
    const { pain_point_text, category } = body;

    if (!pain_point_text || typeof pain_point_text !== 'string' || !pain_point_text.trim()) {
      return createApiErrorResponse('BAD_REQUEST', 'pain_point_text is required', 400, correlationId);
    }

    // Check for duplicates
    const { data: existing } = await supabaseAdmin
      .from('saved_pain_points')
      .select('id')
      .eq('user_id', authContext.user.id)
      .eq('pain_point_text', pain_point_text.trim())
      .maybeSingle();

    if (existing) {
      return createApiErrorResponse('BAD_REQUEST', 'Pain point already saved', 400, correlationId);
    }

    const { data: newPainPoint, error } = await supabaseAdmin
      .from('saved_pain_points')
      .insert({
        user_id: authContext.user.id,
        pain_point_text: pain_point_text.trim(),
        category: category || null,
        times_used: 0,
      })
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Pain point insert error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to save pain point', 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: newPainPoint,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Pain point create error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}
