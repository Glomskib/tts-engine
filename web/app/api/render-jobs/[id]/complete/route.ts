/**
 * POST /api/render-jobs/[id]/complete
 *
 * Called by the Mac mini render node when a job finishes successfully.
 * Saves the result, updates final_video_url on the content_item,
 * creates an output footage_item in the Footage Hub, and advances stages.
 *
 * Authenticated via RENDER_NODE_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createFootageItem, advanceFootageStage, logFootageEvent } from '@/lib/footage/service';
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

  try { body = await request.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  if (!body.final_video_url) {
    return createApiErrorResponse('BAD_REQUEST', 'final_video_url required', 400, correlationId);
  }

  // 1. Mark render job completed
  const { data: job, error: jobError } = await supabaseAdmin
    .from('render_jobs')
    .update({
      status:           'completed',
      progress_pct:     100,
      progress_message: 'Render complete',
      completed_at:     new Date().toISOString(),
      result: {
        final_video_url:  body.final_video_url,
        analysis:         body.analysis || null,
        transcript:       body.transcript || null,
        keyframes:        body.keyframes || [],
        duration_seconds: body.duration_seconds || null,
        file_size_bytes:  body.file_size_bytes || null,
      },
    })
    .eq('id', id)
    .select('workspace_id, content_item_id, payload, footage_item_id')
    .single();

  if (jobError || !job) {
    return createApiErrorResponse('DB_ERROR', jobError?.message || 'Job not found', 500, correlationId);
  }

  // 2. Create output footage_item (the rendered result)
  let outputFootageItemId: string | null = null;
  try {
    // Determine filename from URL
    const urlParts = body.final_video_url.split('/');
    const outputFilename = urlParts[urlParts.length - 1] || 'rendered-output.mp4';

    // Find parent footage item for lineage
    const parentFootageId = job.footage_item_id || null;

    const outputItem = await createFootageItem({
      workspace_id:     job.workspace_id,
      original_filename: outputFilename,
      storage_url:      body.final_video_url,
      byte_size:        body.file_size_bytes,
      duration_sec:     body.duration_seconds,
      source_type:      'render_output',
      source_ref_id:    id,
      uploaded_by:      'system',
      content_item_id:  job.content_item_id || undefined,
      render_job_id:    id,
      parent_footage_id: parentFootageId || undefined,
      version_num:      parentFootageId ? 2 : 1,
      auto_edit_eligible: false,
      metadata: {
        render_job_id: id,
        analysis:      body.analysis || null,
        transcript:    body.transcript || null,
      },
    });

    outputFootageItemId = outputItem.id;

    // Advance output item to auto_edit_complete
    await advanceFootageStage(outputItem.id, 'auto_edit_complete', 'system', { render_job_id: id });

    // If there's a source footage item, advance it to auto_edit_complete too
    if (job.footage_item_id) {
      await advanceFootageStage(job.footage_item_id, 'auto_edit_complete', 'system', {
        render_job_id:          id,
        output_footage_item_id: outputItem.id,
      });

      // Update the source footage item with AI analysis
      if (body.analysis) {
        await supabaseAdmin
          .from('footage_items')
          .update({
            ai_analysis:             body.analysis,
            transcript_text:         body.transcript || null,
            transcript_status:       body.transcript ? 'completed' : 'none',
            auto_edit_completed_at:  new Date().toISOString(),
          })
          .eq('id', job.footage_item_id);
      }
    }

    // Link output footage item to the render job
    await supabaseAdmin
      .from('render_jobs')
      .update({ output_footage_item_id: outputItem.id })
      .eq('id', id);
  } catch (err) {
    console.error('[render-jobs/complete] Failed to create output footage item:', err);
    // Non-fatal — continue with content_item update
  }

  // 3. Update content_item with final_video_url and analysis
  if (job.content_item_id) {
    const contentUpdate: Record<string, unknown> = {
      final_video_url: body.final_video_url,
    };

    if (outputFootageItemId) {
      contentUpdate.primary_footage_id = outputFootageItemId;
    }

    if (body.analysis) {
      if (body.analysis.hook)                contentUpdate.primary_hook = body.analysis.hook;
      if (body.analysis.caption)             contentUpdate.caption      = body.analysis.caption;
      if (body.analysis.hashtags?.length)    contentUpdate.hashtags     = body.analysis.hashtags;
    }

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
      job_id:                 id,
      content_item_id:        job.content_item_id,
      final_video_url:        body.final_video_url,
      output_footage_item_id: outputFootageItemId,
    },
    correlation_id: correlationId,
  });
}
