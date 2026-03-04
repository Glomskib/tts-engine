/**
 * Cron: Content Item Processing Worker
 *
 * Processes content items that need transcription or editor notes generation:
 *   1. Claim items with transcript_status='pending' → transcribe via Whisper
 *   2. Claim items with editor_notes_status='pending' → generate via Claude
 *
 * Runs every 5 minutes. Protected by CRON_SECRET.
 * Plan gated: editor notes require creator_pro+.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { downloadFileStream } from '@/lib/intake/google-drive';
import { generateEditorNotes } from '@/lib/briefs/generateEditorNotes';
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
  transcript_status: string;
  editor_notes_status: string;
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
  // Claim pending items (mark as processing to prevent double-pickup)
  const { data: items, error: fetchErr } = await supabaseAdmin
    .from('content_items')
    .select('id, workspace_id, raw_footage_drive_file_id, raw_footage_url, transcript_status, editor_notes_status')
    .eq('transcript_status', 'pending')
    .not('raw_footage_drive_file_id', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(BATCH_SIZE) as { data: ClaimableItem[] | null; error: { message: string } | null };

  if (fetchErr) {
    console.error(`${LOG} Failed to fetch transcript queue:`, fetchErr.message);
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  if (!items || items.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  // Mark as processing
  const ids = items.map(i => i.id);
  await supabaseAdmin
    .from('content_items')
    .update({ transcript_status: 'processing' })
    .in('id', ids);

  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await transcribeContentItem(item);
      succeeded++;
    } catch (err) {
      console.error(`${LOG} Transcription failed for ${item.id}:`, err instanceof Error ? err.message : err);
      await supabaseAdmin
        .from('content_items')
        .update({ transcript_status: 'failed' })
        .eq('id', item.id);
      failed++;
    }
  }

  return { processed: items.length, succeeded, failed };
}

/**
 * Transcribe a content item's raw footage via Whisper.
 */
async function transcribeContentItem(item: ClaimableItem) {
  if (!item.raw_footage_drive_file_id) {
    throw new Error('No raw footage file ID');
  }

  console.log(`${LOG} Transcribing ${item.id} (file: ${item.raw_footage_drive_file_id})`);

  // Download from Drive to temp file
  const tmpPath = join(tmpdir(), `ci-transcribe-${randomUUID()}.mp4`);

  try {
    await downloadFileStream(item.workspace_id, item.raw_footage_drive_file_id, tmpPath);

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

    console.log(`${LOG} Transcribed ${item.id}: ${transcript.length} chars, ${segments.length} segments`);

    // Store transcript asset
    await supabaseAdmin.from('content_item_assets').insert({
      content_item_id: item.id,
      kind: 'transcript',
      source: 'generated',
      metadata: { text: transcript, timestamps: segments, duration_seconds: response.duration },
    });

    // Update content item: mark transcript done, queue editor notes
    await supabaseAdmin
      .from('content_items')
      .update({
        transcript_status: 'completed',
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
    .select('id, workspace_id, editor_notes_status')
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
    .update({ editor_notes_status: 'processing' })
    .in('id', ids);

  let succeeded = 0;
  let failed = 0;
  let skippedPlan = 0;

  for (const item of items) {
    try {
      // Plan gate: check if user meets creator_pro
      const { data: userRole } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', (item as { workspace_id: string }).workspace_id)
        .maybeSingle();

      const role = (userRole?.role as string) || 'free';
      const isAdmin = role === 'admin';

      if (!isAdmin && !meetsMinPlan(role, 'creator_pro')) {
        // User doesn't have the plan — skip but don't fail
        await supabaseAdmin
          .from('content_items')
          .update({ editor_notes_status: 'none' })
          .eq('id', (item as { id: string }).id);
        skippedPlan++;
        continue;
      }

      await generateContentItemEditorNotes((item as { id: string }).id);
      succeeded++;
    } catch (err) {
      console.error(`${LOG} Editor notes failed for ${(item as { id: string }).id}:`, err instanceof Error ? err.message : err);
      await supabaseAdmin
        .from('content_items')
        .update({ editor_notes_status: 'failed' })
        .eq('id', (item as { id: string }).id);
      failed++;
    }
  }

  return { processed: items.length, succeeded, failed, skipped_plan: skippedPlan };
}

/**
 * Generate editor notes for a content item using Claude.
 */
async function generateContentItemEditorNotes(contentItemId: string) {
  console.log(`${LOG} Generating editor notes for ${contentItemId}`);

  // Fetch the latest transcript asset
  const { data: transcriptAsset } = await supabaseAdmin
    .from('content_item_assets')
    .select('metadata')
    .eq('content_item_id', contentItemId)
    .eq('kind', 'transcript')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!transcriptAsset?.metadata) {
    throw new Error('No transcript found');
  }

  const meta = transcriptAsset.metadata as { text?: string; timestamps?: Array<{ start: number; end: number; text: string }> };
  const transcript = meta.text || '';
  const timestamps = meta.timestamps || [];

  if (!transcript) {
    throw new Error('Transcript is empty');
  }

  // Fetch original script from latest brief (if any)
  const { data: briefRow } = await supabaseAdmin
    .from('creator_briefs')
    .select('data')
    .eq('content_item_id', contentItemId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const originalScript = (briefRow?.data as { script_text?: string })?.script_text || undefined;

  // Generate editor notes via Claude
  const editorNotes = await generateEditorNotes({
    transcript,
    timestamps,
    originalScript,
    correlationId: `ci-${contentItemId}`,
  });

  // Store on content_items.editor_notes
  await supabaseAdmin
    .from('content_items')
    .update({
      editor_notes: editorNotes,
      editor_notes_status: 'completed',
    })
    .eq('id', contentItemId);

  // Also store as an asset for tracking
  await supabaseAdmin.from('content_item_assets').insert({
    content_item_id: contentItemId,
    kind: 'editor_notes',
    source: 'generated',
    metadata: editorNotes,
  });

  console.log(`${LOG} Editor notes generated for ${contentItemId}`);
}
