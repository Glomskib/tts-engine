/**
 * POST /api/content-items/[id]/analyze
 *
 * On-demand: transcribe the raw video and generate AI editor notes.
 * Works with both Google Drive files and direct-upload URLs.
 *
 * Flow:
 *   1. Download raw video (from raw_video_url or raw_footage_drive_file_id)
 *   2. Transcribe via Whisper
 *   3. Store transcript on content item
 *   4. Generate AI editor notes (Claude)
 *   5. Update content item — ready for plan generation
 *
 * Returns status updates in real-time via JSON (synchronous, up to 5 min).
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { generateEnhancedEditorNotes } from '@/lib/briefs/generateEditorNotes';
import { downloadFileStream } from '@/lib/intake/google-drive';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';

export const runtime = 'nodejs';
export const maxDuration = 300;

export const POST = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);

  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id, workspace_id, raw_video_url, raw_video_storage_path, raw_footage_drive_file_id, transcript_status, brand_id, product_id, brief_selected_cow_tier, title')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (!item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  const hasDrive = !!item.raw_footage_drive_file_id;
  const hasDirect = !!item.raw_video_url;

  if (!hasDrive && !hasDirect) {
    return createApiErrorResponse(
      'PRECONDITION_FAILED',
      'No raw video available. Upload a video before analyzing.',
      422,
      correlationId,
    );
  }

  // Block if already processing
  if (item.transcript_status === 'processing') {
    return createApiErrorResponse('CONFLICT', 'Analysis already in progress.', 409, correlationId);
  }

  // Mark as processing
  await supabaseAdmin
    .from('content_items')
    .update({ transcript_status: 'processing', transcript_error: null })
    .eq('id', id);

  const tmpPath = join(tmpdir(), `analyze-${randomUUID()}.mp4`);

  try {
    // Step 1: Download video
    if (hasDrive) {
      await downloadFileStream(item.workspace_id, item.raw_footage_drive_file_id!, tmpPath);
    } else {
      const resp = await fetch(item.raw_video_url!);
      if (!resp.ok) throw new Error(`Failed to fetch video: ${resp.status} ${resp.statusText}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      const { writeFile } = await import('fs/promises');
      await writeFile(tmpPath, buffer);
    }

    // Step 2: Transcribe via Whisper
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI();
    const { createReadStream } = await import('fs');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoFile = createReadStream(tmpPath) as any;

    const response = await openai.audio.transcriptions.create({
      file: videoFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    const transcript = response.text || '';
    const segments = (response.segments || []).map(s => ({
      start: s.start,
      end: s.end,
      text: s.text,
    }));
    const duration = response.duration || 0;

    // Step 3: Save transcript
    const processedFileKey = item.raw_footage_drive_file_id || item.raw_video_storage_path || item.raw_video_url || 'direct';

    await supabaseAdmin
      .from('content_items')
      .update({
        transcript_status: 'completed',
        transcript_text: transcript,
        transcript_json: segments,
        transcript_error: null,
        last_processed_raw_file_id: processedFileKey,
        editor_notes_status: 'processing',
      })
      .eq('id', id);

    // Step 4: Generate AI editor notes
    let enhancedNotes = null;
    let notesMarkdown = '';
    let notesError: string | null = null;

    try {
      // Fetch brief context if available
      const { data: briefRow } = await supabaseAdmin
        .from('creator_briefs')
        .select('data')
        .eq('content_item_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const briefData = briefRow?.data as Record<string, unknown> | null;

      let brandName: string | undefined;
      let productName: string | undefined;

      if (item.brand_id) {
        const { data: brand } = await supabaseAdmin.from('brands').select('name').eq('id', item.brand_id).maybeSingle();
        brandName = (brand?.name as string) || undefined;
      }
      if (item.product_id) {
        const { data: product } = await supabaseAdmin.from('products').select('name').eq('id', item.product_id).maybeSingle();
        productName = (product?.name as string) || undefined;
      }

      const { json, markdown } = await generateEnhancedEditorNotes({
        transcript,
        timestamps: segments,
        originalScript: (briefData?.script_text as string) || undefined,
        persona: (briefData?.audience_persona as string) || undefined,
        brandName,
        productName,
        cowTier: (item.brief_selected_cow_tier as 'safe' | 'edgy' | 'unhinged') || 'safe',
        durationSeconds: duration,
        correlationId,
      });

      enhancedNotes = json;
      notesMarkdown = markdown;

      await supabaseAdmin
        .from('content_items')
        .update({
          editor_notes_status: 'completed',
          editor_notes_json: enhancedNotes,
          editor_notes_text: notesMarkdown,
          editor_notes_error: null,
        })
        .eq('id', id);
    } catch (notesErr) {
      notesError = notesErr instanceof Error ? notesErr.message : String(notesErr);
      console.warn(`[${correlationId}] Editor notes failed (non-fatal):`, notesError);
      await supabaseAdmin
        .from('content_items')
        .update({
          editor_notes_status: 'failed',
          editor_notes_error: notesError.slice(0, 1000),
        })
        .eq('id', id);
    }

    const res = NextResponse.json({
      ok: true,
      data: {
        transcript_status: 'completed',
        transcript_length: transcript.length,
        segment_count: segments.length,
        duration_seconds: duration,
        editor_notes_status: notesError ? 'failed' : 'completed',
        editor_notes_error: notesError,
      },
      correlation_id: correlationId,
    });
    res.headers.set('x-correlation-id', correlationId);
    return res;

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${correlationId}] analyze failed:`, message);

    await supabaseAdmin
      .from('content_items')
      .update({
        transcript_status: 'failed',
        transcript_error: message.slice(0, 1000),
      })
      .eq('id', id);

    return createApiErrorResponse('INTERNAL', `Analysis failed: ${message}`, 500, correlationId);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}, { routeName: '/api/content-items/[id]/analyze', feature: 'editing-engine' });
