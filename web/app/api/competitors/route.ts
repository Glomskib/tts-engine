import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { z } from 'zod';

export const runtime = 'nodejs';

const CreateCompetitorSchema = z.object({
  name: z.string().min(1).max(200),
  tiktok_handle: z.string().min(1).max(100),
  category: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
});

export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { data, error } = await supabaseAdmin
      .from('competitors')
      .select('*')
      .eq('user_id', authContext.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }

    return NextResponse.json({ ok: true, data: data || [], correlation_id: correlationId });
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

    const parsed = CreateCompetitorSchema.safeParse(body);
    if (!parsed.success) {
      return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, { issues: parsed.error.issues });
    }

    const { data, error } = await supabaseAdmin
      .from('competitors')
      .insert({ user_id: authContext.user.id, ...parsed.data })
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
