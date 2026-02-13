import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { sendTelegramNotification } from '@/lib/telegram';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ video_id: string }>;
}

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
 * POST /api/admin/videos/[video_id]/review
 * Admin-only. Approve or reject a video during review.
 * Body: { action: 'approve' | 'reject', reason?: string, notes?: string }
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { video_id } = await params;
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(video_id)) {
    return createApiErrorResponse('INVALID_UUID', 'Invalid video ID format', 400, correlationId);
  }

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  const { action, reason, notes } = body as {
    action?: string;
    reason?: string;
    notes?: string;
  };

  if (!action || !['approve', 'reject'].includes(action)) {
    return createApiErrorResponse('BAD_REQUEST', 'action must be "approve" or "reject"', 400, correlationId);
  }

  if (action === 'reject' && (!reason || reason.trim().length === 0)) {
    return createApiErrorResponse('BAD_REQUEST', 'reason is required when rejecting', 400, correlationId);
  }

  try {
    const { data: video, error: fetchError } = await supabaseAdmin
      .from('videos')
      .select('id, recording_status, product_id')
      .eq('id', video_id)
      .single();

    if (fetchError || !video) {
      return createApiErrorResponse('NOT_FOUND', 'Video not found', 404, correlationId);
    }

    if (video.recording_status !== 'READY_FOR_REVIEW') {
      return createApiErrorResponse(
        'BAD_REQUEST',
        `Video is not in READY_FOR_REVIEW status (current: ${video.recording_status})`,
        400,
        correlationId
      );
    }

    const nowIso = new Date().toISOString();
    const targetStatus = action === 'approve' ? 'READY_TO_POST' : 'REJECTED';

    const updatePayload: Record<string, unknown> = {
      recording_status: targetStatus,
      last_status_changed_at: nowIso,
    };

    if (action === 'approve') {
      updatePayload.ready_to_post_at = nowIso;
    }

    if (action === 'reject') {
      updatePayload.rejection_reason = reason!.trim();
    }

    if (notes && notes.trim().length > 0) {
      updatePayload.review_notes = notes.trim();
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('videos')
      .update(updatePayload)
      .eq('id', video_id)
      .select('id, recording_status, rejection_reason, review_notes, last_status_changed_at')
      .single();

    if (updateError) {
      console.error('Review update error:', updateError);
      return createApiErrorResponse('DB_ERROR', 'Failed to update video', 500, correlationId);
    }

    await writeVideoEvent(
      video_id,
      action === 'approve' ? 'admin_review_approve' : 'admin_review_reject',
      correlationId,
      authContext.user.id,
      'READY_FOR_REVIEW',
      targetStatus,
      {
        action,
        reason: reason?.trim() || null,
        notes: notes?.trim() || null,
        reviewed_by: authContext.user.email || authContext.user.id,
      }
    );

    // Telegram notification (fire-and-forget)
    let productLabel = video_id.slice(0, 8);
    if (video.product_id) {
      try {
        const { data: product } = await supabaseAdmin
          .from('products')
          .select('name, brand')
          .eq('id', video.product_id)
          .single();
        if (product?.name) {
          productLabel = product.brand ? `${product.brand} — ${product.name}` : product.name;
        }
      } catch { /* ignore */ }
    }
    if (action === 'approve') {
      sendTelegramNotification(`✅ Video approved: ${productLabel}`);
    } else {
      sendTelegramNotification(`🔄 Video rejected: ${productLabel} — ${reason?.trim() || 'no reason'}`);
    }

    return NextResponse.json({
      ok: true,
      data: updated,
      meta: {
        action,
        from_status: 'READY_FOR_REVIEW',
        to_status: targetStatus,
        reviewed_by: authContext.user.email || authContext.user.id,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error('POST /api/admin/videos/[video_id]/review error:', err);
    return createApiErrorResponse('DB_ERROR', 'Internal server error', 500, correlationId);
  }
}
