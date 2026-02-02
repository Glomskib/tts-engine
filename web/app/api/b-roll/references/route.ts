// Reference Images API - List and upload reference images for B-Roll generation
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

// Storage limits per plan
const REFERENCE_LIMITS: Record<string, number> = {
  free: 5,
  starter: 20,
  pro: 100,
  unlimited: 500,
};

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const folder = request.nextUrl.searchParams.get('folder');
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');

  let query = supabaseAdmin
    .from('reference_images')
    .select('*')
    .eq('user_id', authContext.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (folder) {
    query = query.eq('folder', folder);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Reference Images] Fetch error:', error);
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Get count for storage limit
  const { count } = await supabaseAdmin
    .from('reference_images')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', authContext.user.id);

  // Get user's plan for limit
  const { data: subscription } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', authContext.user.id)
    .single();

  const planId = subscription?.plan_id || 'free';
  const storageLimit = REFERENCE_LIMITS[planId] || 5;

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
    .from('reference_images')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', authContext.user.id);

  const { data: subscription } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', authContext.user.id)
    .single();

  const planId = subscription?.plan_id || 'free';
  const storageLimit = REFERENCE_LIMITS[planId] || 5;

  if ((count || 0) >= storageLimit) {
    return createApiErrorResponse(
      'STORAGE_LIMIT',
      `Reference image limit reached (${storageLimit} images). Upgrade for more space.`,
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

  const { name, url, thumbnail_url, file_size, mime_type, width, height, tags, folder } = body;

  if (!url || typeof url !== 'string') {
    return createApiErrorResponse('VALIDATION_ERROR', 'url is required', 400, correlationId);
  }

  if (!name || typeof name !== 'string') {
    return createApiErrorResponse('VALIDATION_ERROR', 'name is required', 400, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('reference_images')
    .insert({
      user_id: authContext.user.id,
      name,
      url,
      thumbnail_url: thumbnail_url || null,
      file_size: typeof file_size === 'number' ? file_size : null,
      mime_type: typeof mime_type === 'string' ? mime_type : null,
      width: typeof width === 'number' ? width : null,
      height: typeof height === 'number' ? height : null,
      tags: Array.isArray(tags) ? tags : [],
      folder: folder || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[Reference Images] Insert error:', error);
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: { image: data },
    remaining: storageLimit - (count || 0) - 1,
    correlation_id: correlationId,
  });
}
