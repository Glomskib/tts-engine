/**
 * POST /api/flashflow/outcomes
 * Upsert an outcome for a generation (by generation_id).
 * Admin-only.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const correlationId =
    request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  const { generation_id } = body;
  if (!generation_id || typeof generation_id !== 'string') {
    return createApiErrorResponse('VALIDATION_ERROR', 'generation_id is required', 400, correlationId);
  }

  // Look up the generation to get user_id
  const { data: gen, error: genErr } = await supabaseAdmin
    .from('ff_generations')
    .select('id, user_id')
    .eq('id', generation_id)
    .single();

  if (genErr || !gen) {
    return createApiErrorResponse('NOT_FOUND', 'Generation not found', 404, correlationId);
  }

  const outcomeFields = {
    generation_id,
    user_id: gen.user_id,
    rating: typeof body.rating === 'number' ? body.rating : null,
    is_winner: body.is_winner === true,
    is_rejected: body.is_rejected === true,
    is_regenerated: body.is_regenerated === true,
    views: typeof body.views === 'number' ? body.views : 0,
    orders: typeof body.orders === 'number' ? body.orders : 0,
    revenue_cents: typeof body.revenue_cents === 'number' ? body.revenue_cents : 0,
    winner_score: typeof body.winner_score === 'number' ? body.winner_score : null,
    feedback_text: typeof body.feedback_text === 'string' ? body.feedback_text : null,
    tags: Array.isArray(body.tags) ? body.tags : [],
  };

  // Upsert on generation_id (unique constraint)
  const { data, error } = await supabaseAdmin
    .from('ff_outcomes')
    .upsert(outcomeFields, { onConflict: 'generation_id' })
    .select()
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const res = NextResponse.json({ ok: true, data, correlation_id: correlationId }, { status: 200 });
  res.headers.set('x-correlation-id', correlationId);
  return res;
}
