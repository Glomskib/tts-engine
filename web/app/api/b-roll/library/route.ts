// B-Roll Library API - List and save generated images
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

// Storage limits per plan
const STORAGE_LIMITS: Record<string, number> = {
  free: 10,
  starter: 50,
  pro: 200,
  unlimited: 1000,
};

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const folder = request.nextUrl.searchParams.get('folder');
  const favoritesOnly = request.nextUrl.searchParams.get('favorites') === 'true';
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');

  let query = supabaseAdmin
    .from('b_roll_library')
    .select('*')
    .eq('user_id', authContext.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (folder) {
    query = query.eq('folder', folder);
  }

  if (favoritesOnly) {
    query = query.eq('is_favorite', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[B-Roll Library] Fetch error:', error);
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Get count for storage limit
  const { count } = await supabaseAdmin
    .from('b_roll_library')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', authContext.user.id);

  // Get user's plan for limit
  const { data: subscription } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', authContext.user.id)
    .single();

  const planId = subscription?.plan_id || 'free';
  const storageLimit = STORAGE_LIMITS[planId] || 10;

  return NextResponse.json({
    ok: true,
    data: {
      images: data || [],
      count: count || 0,
      limit: storageLimit,
      remaining: storageLimit - (count || 0),
    },
    correlation_id: correlationId,
  });
}

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Check storage limit
  const { count } = await supabaseAdmin
    .from('b_roll_library')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', authContext.user.id);

  const { data: subscription } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', authContext.user.id)
    .single();

  const planId = subscription?.plan_id || 'free';
  const storageLimit = STORAGE_LIMITS[planId] || 10;

  if ((count || 0) >= storageLimit) {
    return createApiErrorResponse(
      'STORAGE_LIMIT',
      `Storage limit reached (${storageLimit} images). Upgrade for more space.`,
      403,
      correlationId,
      { limit: storageLimit, upgrade_required: true }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const { url, prompt, style, aspect_ratio, model, tags, folder } = body;

  if (!url || typeof url !== 'string') {
    return createApiErrorResponse('VALIDATION_ERROR', 'url is required', 400, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('b_roll_library')
    .insert({
      user_id: authContext.user.id,
      url,
      prompt: prompt || null,
      style: style || null,
      aspect_ratio: aspect_ratio || null,
      model: model || null,
      tags: Array.isArray(tags) ? tags : [],
      folder: folder || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[B-Roll Library] Insert error:', error);
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: { image: data },
    remaining: storageLimit - (count || 0) - 1,
    correlation_id: correlationId,
  });
}
