/**
 * POST /api/flashflow/products — upsert a product by key
 * GET  /api/flashflow/products?q= — search products by key/display_name/tiktok_product_id
 * Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
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

  const { key, display_name, tiktok_product_id, notes } = body;

  if (!key || typeof key !== 'string') {
    return createApiErrorResponse('VALIDATION_ERROR', 'key is required', 400, correlationId);
  }
  if (!tiktok_product_id || typeof tiktok_product_id !== 'string') {
    return createApiErrorResponse('VALIDATION_ERROR', 'tiktok_product_id is required', 400, correlationId);
  }

  const upsertFields: Record<string, unknown> = {
    key,
    tiktok_product_id,
  };
  if (typeof display_name === 'string') upsertFields.display_name = display_name;
  if (typeof notes === 'string') upsertFields.notes = notes;

  const { data, error } = await supabaseAdmin
    .from('ff_products')
    .upsert(upsertFields, { onConflict: 'key' })
    .select()
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const res = NextResponse.json({ ok: true, data, correlation_id: correlationId }, { status: 200 });
  res.headers.set('x-correlation-id', correlationId);
  return res;
}

export async function GET(request: NextRequest) {
  const correlationId =
    request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const q = request.nextUrl.searchParams.get('q') || '';

  let query = supabaseAdmin
    .from('ff_products')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(50);

  if (q) {
    // ilike search across key, display_name, and tiktok_product_id
    query = query.or(
      `key.ilike.%${q}%,display_name.ilike.%${q}%,tiktok_product_id.ilike.%${q}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const res = NextResponse.json({ ok: true, data, correlation_id: correlationId });
  res.headers.set('x-correlation-id', correlationId);
  return res;
}
