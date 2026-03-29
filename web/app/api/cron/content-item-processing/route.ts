/**
 * Cron: Content Item Processing Worker
 *
 * Processes content items that need transcription or editor notes generation:
 *   1. Claim items with transcript_status='pending' → transcribe via Whisper
 *   2. Claim items with editor_notes_status='pending' → generate via Claude (enhanced)
 *
 * Idempotency:
 *   - Uses last_processed_raw_file_id to skip already-processed files
 *   - Atomic claim via UPDATE … WHERE status='pending'
 *   - Stores errors in transcript_error / editor_notes_error
 *
 * Runs every 5 minutes. Protected by CRON_SECRET.
 * Plan gated: editor notes require creator_pro+.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { downloadFileStream } from '@/lib/intake/google-drive';
import { generateEditorNotes } from '@/lib/briefs/generateEditorNotes';
import { generateEnhancedEditorNotes } from '@/lib/briefs/generateEditorNotes';
import { meetsMinPlan } from '@/lib/plans';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { captureRouteError } from '@/lib/errorTracking';
import { markCaptured } from '@/lib/errors/withErrorCapture';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';

export const runtime = 'nodejs';
export const maxDuration = 300;

const LOG = '[cron/content-item-processing]';
const BATCH_SIZE = 3;

interface ClaimableItem {
  id: string;
  workspace_id: string;
  raw_footage_drive_file_id: string | null;
  raw_footage_url: string | null;
  raw_video_url: string | null;
  raw_video_storage_path: string | null;
  transcript_status: string;
  editor_notes_status: string;
  last_processed_raw_file_id: string | null;
  brand_id: string | null;
  product_id: string | null;
  brief_selected_cow_tier: string;
  title: string;
}

export const GET = withErrorCapture(async (request: Request) => {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const transcriptResults = await processTranscriptionQueue();
    const editorNotesResults = await processEditorNotesQueue();

    return NextResponse.json({
      ok: true,
      transcription: transcriptResults,
      editor_notes: editorNotesResults,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    captureRouteError(error, {
      route: '/api/cron/content-item-processing',
      feature: 'content-item-processing',
    });
    markCaptured(error);
    console.error(`${LOG} Fatal:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}, { routeName: '/api/cron/content-item-processing', feature: 'content-item-processing' });

/**
 * Process items needing transcription.
 */
async function processTranscriptionQueue() {
  // Atomic claim: UPDATE where status='pending' to prevent double-pickup
  // Includes items from Drive (raw_footage_drive_file_id) AND direct web uploads (raw_video_url)
  const { data: items, error: fetchErr } = await supabaseAdmin
    .from('content_items')
    .select('id, workspace_id, raw_footage_drive_file_id, raw_footage_url, raw_video_url, raw_video_storage_path, transcript_status, editor_notes_status, last_processed_raw_file_id, brand_id, product_id, brief_selected_cow_tier, title')
    .eq('transcript_status', 'pending')
    .or('raw_footage_drive_file_id.not.is.null,raw_video_url.not.is.null')
    .order('updated_at', { ascending: true })
    .limit(BATCH_SIZE) as { data: ClaimableItem[] | null; error: { message: string } | null };

  if (fetchErr) {
    console.error(`${LOG} Failed to fetch transcript queue:`, fetchErr.message);
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  if (!items || items.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  // Mark as processing atomically
  const ids = items.map(i => i.id);
  await supabaseAdmin
    .from('content_items')
    .update({ transcript_status: 'processing', transcript_error: null })
    .in('id', ids)
    .eq('transcript_status', 'pending'); // double-check to prevent race

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of items) {
    // Idempotency: skip if this exact source file was already processed
    const currentFileKey = item.raw_footage_drive_file_id || item.raw_video_storage_path || item.raw_video_url;
    if (
      item.last_processed_raw_file_id !== null &&
      item.last_processed_raw_file_id === currentFileKey
    ) {
      console.log(`${LOG} Skipping ${item.id}: already processed`);
      await supabaseAdmin
        .from('content_items')
        .update({ transcript_status: 'completed' })
        .eq('id', item.id);
      skipped++;
      continue;
    }

    try {
      await transcribeContentItem(item);
      succeeded++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG} Transcription failed for ${item.id}:`, errorMsg);
      await supabaseAdmin
        .from('content_items')
        .update({
          transcript_status: 'failed',
          transcript_error: errorMsg.slice(0, 1000),
        })
        .eq('id', item.id);

      captureRouteError(err instanceof Error ? err : new Error(errorMsg), {
        route: '/api/cron/content-item-processing',
        feature: 'content-item-processing',
        extra: { content_item_id: item.id, workspace_id: item.workspace_id, step: 'transcription' },
      });
      failed++;
    }
  }

  return { processed: items.length, succeeded, failed, skipped };
}

/**
 * Transcribe a content item's raw footage via Whisper.
 * Supports both Google Drive files and direct-upload URLs.
 */
async function transcribeContentItem(item: ClaimableItem) {
  const hasDriveFile = !!item.raw_footage_drive_file_id;
  const hasDirectUpload = !!item.raw_video_url;

  if (!hasDriveFile && !hasDirectUpload) {
    throw new Error('No raw video source available (no Drive file ID and no raw_video_url)');
  }

  console.log(`${LOG} Transcribing ${item.id} via ${hasDriveFile ? 'Google Drive' : 'direct URL'}`);

  const tmpPath = join(tmpdir(), `ci-transcribe-${randomUUID()}.mp4`);

  try {
    if (hasDriveFile) {
      await downloadFileStream(item.workspace_id, item.raw_footage_drive_file_id!, tmpPath);
    } else {
      // Direct upload: download from storage URL
      const resp = await fetch(item.raw_video_url!);
      if (!resp.ok) throw new Error(`Failed to fetch video: ${resp.status} ${resp.statusText}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      const { writeFile } = await import('fs/promises');
      await writeFile(tmpPath, buffer);
    }

    // Transcribe via Whisper
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI();
    const { createReadStream } = await import('fs');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const file = createReadStream(tmpPath) as any;

    const response = await openai.audio.transcriptions.create({
      file,
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

    console.log(`${LOG} Transcribed ${item.id}: ${transcript.length} chars, ${segments.length} segments`);

    // Store transcript asset
    await supabaseAdmin.from('content_item_assets').insert({
      content_item_id: item.id,
      kind: 'transcript',
      source: 'generated',
      metadata: { text: transcript, timestamps: segments, duration_seconds: duration },
    });

    // Update content item with transcript data + queue editor notes
    // Use Drive file ID as idempotency key if available, otherwise use the storage path
    const processedFileId = item.raw_footage_drive_file_id || item.raw_video_storage_path || item.raw_video_url || 'direct';
    await supabaseAdmin
      .from('content_items')
      .update({
        transcript_status: 'completed',
        transcript_text: transcript,
        transcript_json: segments,
        transcript_error: null,
        last_processed_raw_file_id: processedFileId,
        editor_notes_status: 'pending',
      })
      .eq('id', item.id);

  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/**
 * Process items needing editor notes generation.
 */
async function processEditorNotesQueue() {
  const { data: items, error: fetchErr } = await supabaseAdmin
    .from('content_items')
    .select('id, workspace_id, editor_notes_status, transcript_status, last_processed_raw_file_id, raw_footage_drive_file_id, brand_id, product_id, brief_selected_cow_tier, title')
    .eq('editor_notes_status', 'pending')
    .eq('transcript_status', 'completed')
    .order('updated_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr) {
    console.error(`${LOG} Failed to fetch editor notes queue:`, fetchErr.message);
    return { processed: 0, succeeded: 0, failed: 0, skipped_plan: 0 };
  }

  if (!items || items.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, skipped_plan: 0 };
  }

  // Mark as processing
  const ids = items.map((i: { id: string }) => i.id);
  await supabaseAdmin
    .from('content_items')
    .update({ editor_notes_status: 'processing', editor_notes_error: null })
    .in('id', ids)
    .eq('editor_notes_status', 'pending');

  let succeeded = 0;
  let failed = 0;
  let skippedPlan = 0;

  for (const item of items) {
    const ci = item as ClaimableItem;

    try {
      // Plan gate: check if user meets creator_pro
      const { data: userRole } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', ci.workspace_id)
        .maybeSingle();

      const role = (userRole?.role as string) || 'free';
      const isAdmin = role === 'admin';

      if (!isAdmin && !meetsMinPlan(role, 'creator_pro')) {
        await supabaseAdmin
          .from('content_items')
          .update({ editor_notes_status: 'none' })
          .eq('id', ci.id);
        skippedPlan++;
        continue;
      }

      await generateContentItemEditorNotes(ci);
      succeeded++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG} Editor notes failed for ${ci.id}:`, errorMsg);
      await supabaseAdmin
        .from('content_items')
        .update({
          editor_notes_status: 'failed',
          editor_notes_error: errorMsg.slice(0, 1000),
        })
        .eq('id', ci.id);

      captureRouteError(err instanceof Error ? err : new Error(errorMsg), {
        route: '/api/cron/content-item-processing',
        feature: 'content-item-processing',
        extra: { content_item_id: ci.id, workspace_id: ci.workspace_id, step: 'editor_notes' },
      });
      failed++;
    }
  }

  return { processed: items.length, succeeded, failed, skipped_plan: skippedPlan };
}

/**
 * Generate editor notes for a content item using Claude.
 * Produces both legacy EditorNotes (for backward compat) and enhanced EditorNotesJSON.
 */
async function generateContentItemEditorNotes(item: ClaimableItem) {
  console.log(`${LOG} Generating editor notes for ${item.id}`);

  // Fetch transcript data — prefer from content_items columns, fallback to asset
  let transcript = '';
  let timestamps: Array<{ start: number; end: number; text: string }> = [];
  let durationSeconds = 0;

  // Try content_items columns first
  const { data: ciData } = await supabaseAdmin
    .from('content_items')
    .select('transcript_text, transcript_json')
    .eq('id', item.id)
    .single();

  if (ciData?.transcript_text) {
    transcript = ciData.transcript_text;
    timestamps = (ciData.transcript_json as Array<{ start: number; end: number; text: string }>) || [];
    if (timestamps.length > 0) {
      durationSeconds = timestamps[timestamps.length - 1].end;
    }
  } else {
    // Fallback to asset
    const { data: transcriptAsset } = await supabaseAdmin
      .from('content_item_assets')
      .select('metadata')
      .eq('content_item_id', item.id)
      .eq('kind', 'transcript')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!transcriptAsset?.metadata) {
      throw new Error('No transcript found');
    }

    const meta = transcriptAsset.metadata as { text?: string; timestamps?: Array<{ start: number; end: number; text: string }>; duration_seconds?: number };
    transcript = meta.text || '';
    timestamps = meta.timestamps || [];
    durationSeconds = meta.duration_seconds || 0;
  }

  if (!transcript) {
    throw new Error('Transcript is empty');
  }

  // Fetch brief context
  const { data: briefRow } = await supabaseAdmin
    .from('creator_briefs')
    .select('data')
    .eq('content_item_id', item.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const briefData = briefRow?.data as Record<string, unknown> | null;
  const originalScript = (briefData?.script_text as string) || undefined;
  const persona = (briefData?.audience_persona as string) || undefined;

  // Fetch brand/product names for context
  let brandName: string | undefined;
  let productName: string | undefined;

  if (item.brand_id) {
    const { data: brand } = await supabaseAdmin
      .from('brands')
      .select('name')
      .eq('id', item.brand_id)
      .maybeSingle();
    brandName = (brand?.name as string) || undefined;
  }

  if (item.product_id) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('name')
      .eq('id', item.product_id)
      .maybeSingle();
    productName = (product?.name as string) || undefined;
  }

  // Generate enhanced editor notes
  const { json: enhancedNotes, markdown } = await generateEnhancedEditorNotes({
    transcript,
    timestamps,
    originalScript,
    persona,
    brandName,
    productName,
    cowTier: item.brief_selected_cow_tier as 'safe' | 'edgy' | 'unhinged',
    durationSeconds,
    correlationId: `ci-${item.id}`,
  });

  // Also generate legacy notes for backward compat (stored in editor_notes column)
  let legacyNotes;
  try {
    legacyNotes = await generateEditorNotes({
      transcript,
      timestamps,
      originalScript,
      correlationId: `ci-legacy-${item.id}`,
    });
  } catch {
    // Legacy notes are non-critical — continue without them
    console.warn(`${LOG} Legacy editor notes generation failed for ${item.id} (non-fatal)`);
  }

  // Update content item with all results
  const updateData: Record<string, unknown> = {
    editor_notes_status: 'completed',
    editor_notes_json: enhancedNotes,
    editor_notes_text: markdown,
    editor_notes_error: null,
  };

  if (legacyNotes) {
    updateData.editor_notes = legacyNotes;
  }

  await supabaseAdmin
    .from('content_items')
    .update(updateData)
    .eq('id', item.id);

  // Store as asset for tracking
  await supabaseAdmin.from('content_item_assets').insert({
    content_item_id: item.id,
    kind: 'editor_notes',
    source: 'generated',
    metadata: enhancedNotes,
  });

  console.log(`${LOG} Editor notes generated for ${item.id}`);
}
