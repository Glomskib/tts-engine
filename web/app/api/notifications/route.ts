import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { z } from 'zod';

export const runtime = 'nodejs';

const CreateNotificationSchema = z.object({
  user_id: z.string().uuid().optional(),
  type: z.enum(['va_submission', 'winner_detected', 'brand_quota', 'pipeline_idle', 'drive_new_video', 'competitor_viral', 'system', 'info']),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  action_url: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread') === 'true' || searchParams.get('unread_only') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', authContext.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('read', false);
    }

    const { data, error } = await query;
    if (error) {
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }

    // Also get unread count
    const { count } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', authContext.user.id)
      .eq('read', false);

    return NextResponse.json({
      ok: true,
      data: { notifications: data || [], unread_count: count || 0 },
      correlation_id: correlationId,
    });
  } catch (err) {
    return createApiErrorResponse('INTERNAL', (err as Error).message, 500, correlationId);
  }
}

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    let body: unknown;
    try { body = await request.json(); } catch {
      return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
    }

    const parsed = CreateNotificationSchema.safeParse(body);
    if (!parsed.success) {
      return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, { issues: parsed.error.issues });
    }

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: parsed.data.user_id || authContext.user.id,
        type: parsed.data.type,
        title: parsed.data.title,
        message: parsed.data.message,
        action_url: parsed.data.action_url || null,
        metadata: parsed.data.metadata || null,
        read: false,
        is_read: false,
      })
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
