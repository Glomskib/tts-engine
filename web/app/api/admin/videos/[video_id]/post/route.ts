import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { sendTelegramNotification } from '@/lib/telegram';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ video_id: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function writeVideoEvent(
  videoId: string,
  eventType: string,
  correlationId: string,
  actor: string,
  fromStatus: string | null,
  toStatus: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from('video_events').insert({
      video_id: videoId,
      event_type: eventType,
      correlation_id: correlationId,
      actor,
      from_status: fromStatus,
      to_status: toStatus,
      details,
    });
  } catch (err) {
    console.error('Failed to write video event:', err);
  }
}

/**
 * POST /api/admin/videos/[video_id]/post
 * Admin-only. Manual posting bridge — marks a video as POSTED.
 * Body: { posted_url?: string, posted_platform?: string }
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { video_id } = await params;
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  if (!UUID_REGEX.test(video_id)) {
    return createApiErrorResponse('INVALID_UUID', 'Invalid video ID format', 400, correlationId);
  }

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  let body: { posted_url?: string; posted_platform?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional for this endpoint
  }

  // Fetch current video
  const { data: video, error: fetchError } = await supabaseAdmin
    .from('videos')
    .select('id, recording_status, product_id, final_video_url, posted_url')
    .eq('id', video_id)
    .single();

  if (fetchError || !video) {
    return createApiErrorResponse('NOT_FOUND', 'Video not found', 404, correlationId);
  }

  if (video.recording_status === 'POSTED') {
    return NextResponse.json({
      ok: true,
      data: { video_id, status: 'POSTED' },
      meta: { action: 'no_change', already_posted: true },
      correlation_id: correlationId,
    });
  }

  if (!['READY_TO_POST', 'EDITED', 'READY_FOR_REVIEW'].includes(video.recording_status || '')) {
    return createApiErrorResponse(
      'BAD_REQUEST',
      `Video is not in a postable state (current: ${video.recording_status})`,
      400,
      correlationId
    );
  }

  const nowIso = new Date().toISOString();
  const fromStatus = video.recording_status;

  const updatePayload: Record<string, unknown> = {
    recording_status: 'POSTED',
    posted_at: nowIso,
    last_status_changed_at: nowIso,
  };

  if (body.posted_url) {
    updatePayload.posted_url = body.posted_url;
  }
  if (body.posted_platform) {
    updatePayload.posted_platform = body.posted_platform;
  } else if (!video.posted_url) {
    updatePayload.posted_platform = 'tiktok';
  }

  const { error: updateError } = await supabaseAdmin
    .from('videos')
    .update(updatePayload)
    .eq('id', video_id);

  if (updateError) {
    console.error('Mark posted update error:', updateError);
    return createApiErrorResponse('DB_ERROR', 'Failed to update video', 500, correlationId);
  }

  // Write video event
  await writeVideoEvent(
    video_id,
    'admin_mark_posted',
    correlationId,
    authContext.user.id,
    fromStatus,
    'POSTED',
    {
      posted_url: body.posted_url || null,
      posted_platform: body.posted_platform || 'tiktok',
      marked_by: authContext.user.email || authContext.user.id,
    }
  );

  // Telegram notification (fire-and-forget)
  let brand = '';
  let product = '';
  if (video.product_id) {
    try {
      const { data: productData } = await supabaseAdmin
        .from('products')
        .select('name, brand')
        .eq('id', video.product_id)
        .single();
      if (productData) {
        brand = productData.brand || '';
        product = productData.name || '';
      }
    } catch { /* ignore */ }
  }

  const label = [brand, product].filter(Boolean).join(' - ') || video_id.slice(0, 8);
  const link = body.posted_url || video.final_video_url || '';
  const linkSuffix = link ? ` — ${link}` : '';
  sendTelegramNotification(`📱 Video posted: ${label}${linkSuffix}`);

  return NextResponse.json({
    ok: true,
    data: {
      video_id,
      previous_status: fromStatus,
      new_status: 'POSTED',
      posted_at: nowIso,
    },
    meta: {
      action: 'marked_posted',
      marked_by: authContext.user.email || authContext.user.id,
    },
    correlation_id: correlationId,
  });
}
