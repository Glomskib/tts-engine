import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const sort = searchParams.get('sort') || 'created_at';

  const validSorts = ['created_at', 'performance_score', 'hook_text'];
  const sortColumn = validSorts.includes(sort) ? sort : 'created_at';

  const { data, error } = await supabaseAdmin
    .from('saved_hooks')
    .select('*')
    .eq('user_id', authContext.user.id)
    .order(sortColumn, { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[${correlationId}] Saved Hooks GET error:`, error);
    return NextResponse.json({ hooks: [] });
  }

  return NextResponse.json({ hooks: data || [] });
}

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  const hookText = typeof body.hook_text === 'string' ? body.hook_text.trim() : '';
  if (!hookText) {
    return createApiErrorResponse('BAD_REQUEST', 'hook_text is required', 400, correlationId);
  }

  const payload: Record<string, unknown> = {
    user_id: authContext.user.id,
    hook_text: hookText,
    source: typeof body.source === 'string' ? body.source : 'generated',
  };

  if (typeof body.content_type === 'string') payload.content_type = body.content_type;
  if (typeof body.content_format === 'string') payload.content_format = body.content_format;
  if (typeof body.product_id === 'string') payload.product_id = body.product_id;
  if (typeof body.product_name === 'string') payload.product_name = body.product_name;
  if (typeof body.brand_name === 'string') payload.brand_name = body.brand_name;
  if (typeof body.notes === 'string') payload.notes = body.notes;

  const { data, error } = await supabaseAdmin
    .from('saved_hooks')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error(`[${correlationId}] Saved Hooks POST error:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to save hook', 500, correlationId);
  }

  return NextResponse.json({ hook: data });
}
