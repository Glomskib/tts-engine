import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { validateQualityScore } from '@/lib/video-quality-score';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/videos/[id]/score
 * Standalone quality scoring endpoint — score a video without approving/rejecting.
 * Admin only.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
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

  const score = validateQualityScore(body);
  if (!score) {
    return createApiErrorResponse(
      'BAD_REQUEST',
      'Invalid quality score. Each dimension (product_visibility, label_legibility, prompt_accuracy, text_overlay, composition) must be an integer 1-5.',
      400,
      correlationId
    );
  }

  // Attach scorer metadata
  score.scored_by = authContext.user.email || authContext.user.id;
  score.scored_at = new Date().toISOString();

  // Verify video exists
  const { data: video, error: fetchError } = await supabaseAdmin
    .from('videos')
    .select('id')
    .eq('id', id)
    .single();

  if (fetchError || !video) {
    return createApiErrorResponse('NOT_FOUND', 'Video not found', 404, correlationId);
  }

  // Save quality_score
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('videos')
    .update({ quality_score: score })
    .eq('id', id)
    .select('id, recording_status, quality_score')
    .single();

  if (updateError) {
    console.error('Score update error:', updateError);
    return createApiErrorResponse('DB_ERROR', 'Failed to save quality score', 500, correlationId);
  }

  // Write audit event
  try {
    await supabaseAdmin.from('video_events').insert({
      video_id: id,
      event_type: 'quality_scored',
      correlation_id: correlationId,
      actor: authContext.user.id,
      from_status: null,
      to_status: null,
      details: {
        quality_score: score,
        scored_by: score.scored_by,
      },
    });
  } catch (err) {
    console.error('Failed to write video event:', err);
  }

  return NextResponse.json({
    ok: true,
    data: updated,
    correlation_id: correlationId,
  });
}
