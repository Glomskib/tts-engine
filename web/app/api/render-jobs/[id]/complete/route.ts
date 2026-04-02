/**
 * POST /api/render-jobs/[id]/complete
 *
 * Called by the Mac mini render node when a job finishes successfully.
 * Saves the result, updates final_video_url on the content_item, and
 * advances content_item status to ready_to_post if it was in editing/recorded.
 *
 * Authenticated via RENDER_NODE_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

const RENDER_NODE_SECRET = process.env.RENDER_NODE_SECRET;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;

  const secret = request.headers.get('x-render-node-secret');
  if (!RENDER_NODE_SECRET || secret !== RENDER_NODE_SECRET) {
    return createApiErrorResponse('UNAUTHORIZED', 'Invalid render node secret', 401, correlationId);
  }

  let body: {
    final_video_url: string;
    analysis?: {
      hook?: string;
      caption?: string;
      hashtags?: string[];
      cta?: string;
      cover_text?: string;
      content_angle?: string;
      clip_scores?: number[];
      best_clip_index?: number;
      reasoning?: string;
    };
    transcript?: string;
    keyframes?: string[];
    duration_seconds?: number;
    file_size_bytes?: number;
  };

  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  if (!body.final_video_url) {
    return createApiErrorResponse('BAD_REQUEST', 'final_video_url required', 400, correlationId);
  }

  // 1. Mark job completed
  const { data: job, error: jobError } = await supabaseAdmin
    .from('render_jobs')
    .update({
      status: 'completed',
      progress_pct: 100,
      progress_message: 'Render complete',
      completed_at: new Date().toISOString(),
      result: {
        final_video_url: body.final_video_url,
        analysis: body.analysis || null,
        transcript: body.transcript || null,
        keyframes: body.keyframes || [],
        duration_seconds: body.duration_seconds || null,
        file_size_bytes: body.file_size_bytes || null,
      },
    })
    .eq('id', id)
    .select('workspace_id, content_item_id, payload')
    .single();

  if (jobError || !job) {
    return createApiErrorResponse('DB_ERROR', jobError?.message || 'Job not found', 500, correlationId);
  }

  // 2. Update content_item with final_video_url and analysis fields
  if (job.content_item_id) {
    const contentUpdate: Record<string, unknown> = {
      final_video_url: body.final_video_url,
    };

    // Apply AI analysis if returned
    if (body.analysis) {
      if (body.analysis.hook) contentUpdate.primary_hook = body.analysis.hook;
      if (body.analysis.caption) contentUpdate.caption = body.analysis.caption;
      if (body.analysis.hashtags?.length) contentUpdate.hashtags = body.analysis.hashtags;
    }

    // Check current status; only auto-advance if in a pre-ready state
    const { data: item } = await supabaseAdmin
      .from('content_items')
      .select('status')
      .eq('id', job.content_item_id)
      .single();

    const advanceable = ['briefing', 'scripted', 'ready_to_record', 'recorded', 'editing'];
    if (item && advanceable.includes(item.status)) {
      contentUpdate.status = 'ready_to_post';
    }

    await supabaseAdmin
      .from('content_items')
      .update(contentUpdate)
      .eq('id', job.content_item_id);
  }

  return NextResponse.json({
    ok: true,
    data: {
      job_id: id,
      content_item_id: job.content_item_id,
      final_video_url: body.final_video_url,
    },
    correlation_id: correlationId,
  });
}
