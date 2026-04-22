/**
 * POST /api/video-engine/clips/[id]/export
 *
 * Manually trigger export of a rendered clip to a distribution channel.
 * Body: { channel: 'tiktok', mode?: 'draft' | 'direct' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createDistributionJob, getUserSettings } from '@/lib/video-engine/distribution';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id: clipId } = await context.params;

  let body: { channel?: string; mode?: string } = {};
  try { body = await request.json(); } catch { /* allow empty */ }

  const channel = body.channel ?? 'tiktok';
  if (!['tiktok', 'youtube', 'instagram', 'twitter', 'late'].includes(channel)) {
    return createApiErrorResponse('BAD_REQUEST', 'Unsupported channel', 400, correlationId);
  }

  const { data: clip } = await supabaseAdmin
    .from('ve_rendered_clips')
    .select('id,run_id,user_id,output_url,caption_text,hashtags,suggested_title,status')
    .eq('id', clipId)
    .single();
  if (!clip) return createApiErrorResponse('NOT_FOUND', 'Clip not found', 404, correlationId);
  if (clip.user_id !== auth.user.id) return createApiErrorResponse('FORBIDDEN', 'Not your clip', 403, correlationId);
  if (clip.status !== 'complete' || !clip.output_url) {
    return createApiErrorResponse('BAD_REQUEST', 'Clip is not finished rendering yet', 400, correlationId);
  }

  const settings = await getUserSettings(auth.user.id);
  const mode = (body.mode === 'direct' ? 'direct' : settings.default_export_mode) as 'draft' | 'direct';

  const jobId = await createDistributionJob({
    userId: auth.user.id,
    runId: clip.run_id,
    renderedClipId: clipId,
    channel: channel as any,
    mode,
    assetUrl: clip.output_url,
    caption: clip.caption_text,
    hashtags: clip.hashtags,
    title: clip.suggested_title,
  });

  return NextResponse.json({
    ok: true,
    data: { job_id: jobId, channel, mode },
    correlation_id: correlationId,
  });
}
