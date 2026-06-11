/**
 * POST /api/video-engine/runs/from-youtube
 *
 * Real YouTube ingest pipeline. Brandon flagged this is the FF transcriber's #1
 * blocker. Page is becoming an ad-landing — needs to actually work.
 *
 * Flow:
 *   1. Validate URL + auth
 *   2. Download video via Cobalt API (h264 mp4, 720p default)
 *   3. Upload bytes to Supabase `renders` bucket at youtube-ingest/<userId>/<ts>.mp4
 *   4. Forward to /api/video-engine/runs (cookies preserved) so plan caps,
 *      preset resolution, and clip quotas all run through the same code path
 *      as the direct-upload flow
 *   5. Return { ok, data: { run_id } } so the client can redirect to /video-engine/[id]
 *
 * Body:
 *   { url, workspace, preset?, target_clip_count? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isValidYouTubeUrl, downloadYouTubeVideo } from '@/lib/youtube-transcript';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — long videos can take a while end-to-end

const BUCKET = 'renders';
// Soft cap matching downloadYouTubeVideo's default. Vercel's serverless memory
// caps at 1GB; we leave headroom for buffering + upload + JSON overhead.
const MAX_VIDEO_BYTES = 600 * 1024 * 1024;
// Source duration cap for ingestion. Above this, ask the user to upload directly
// (chunked uploads are happier than streaming a 2-hour download through this fn).
const MAX_DURATION_SEC = 90 * 60; // 90 min

// Map clipper-form preset → ve_runs preset_keys. Empty = let mode defaults pick.
function presetToKeys(preset: string | null | undefined): string[] | null {
  if (!preset) return null;
  if (preset === 'viral') return ['hook_strong', 'cliff', 'shock_open'];
  if (preset === 'highlights') return ['highlight_short', 'highlight_pacing'];
  if (preset === 'educational') return ['explainer_clean', 'explainer_listicle'];
  return null;
}

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();

  // ── Auth ────────────────────────────────────────────────────────────────
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Sign in to ingest YouTube videos.', 401, correlationId);
  }
  const userId = auth.user.id;

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: {
    url?: string;
    workspace?: 'creator' | 'brand_agency' | 'clipper';
    preset?: string | null;
    target_clip_count?: number;
    context?: Record<string, unknown>;
  };
  try { body = await request.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  const url = body.url?.trim();
  if (!url) {
    return createApiErrorResponse('BAD_REQUEST', 'A YouTube URL is required.', 400, correlationId);
  }
  if (!isValidYouTubeUrl(url)) {
    return createApiErrorResponse('BAD_REQUEST', 'That doesn\'t look like a YouTube URL. Try the full https://www.youtube.com/... link.', 400, correlationId);
  }

  console.log('[from-youtube]', { url, userId, workspace: body.workspace, preset: body.preset, correlation_id: correlationId });

  // ── Step 1: Download via Cobalt ────────────────────────────────────────
  let download: Awaited<ReturnType<typeof downloadYouTubeVideo>>;
  try {
    download = await downloadYouTubeVideo(url, { quality: '720', maxBytes: MAX_VIDEO_BYTES });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[from-youtube] download failed:', msg);

    if (msg.includes('max-filesize')) {
      return NextResponse.json({
        ok: false,
        error: {
          code: 'YOUTUBE_VIDEO_TOO_LARGE',
          message: 'This video is too large to ingest from URL. Download it locally and upload from /video-engine.',
        },
      }, { status: 413 });
    }
    if (msg.includes('cobalt error') || msg.includes('cobalt returned')) {
      return NextResponse.json({
        ok: false,
        error: {
          code: 'YOUTUBE_DOWNLOAD_FAILED',
          message: 'Could not download this video. It may be private, age-restricted, region-locked, or blocked by YouTube. Try a different URL or upload the file directly.',
          debug: msg.slice(0, 200),
        },
      }, { status: 422 });
    }
    return NextResponse.json({
      ok: false,
      error: {
        code: 'YOUTUBE_DOWNLOAD_FAILED',
        message: 'Failed to download the YouTube video. Try again or upload the file directly.',
      },
    }, { status: 500 });
  }

  // Duration gate — keep here AFTER download (cobalt sometimes gives us metadata
  // we couldn't get pre-download from the player response).
  if (download.duration > MAX_DURATION_SEC) {
    return NextResponse.json({
      ok: false,
      error: {
        code: 'YOUTUBE_VIDEO_TOO_LONG',
        message: `That video is ${Math.round(download.duration / 60)} min — over the ${Math.round(MAX_DURATION_SEC / 60)}-min ingest cap. Upload directly from /video-engine instead.`,
      },
    }, { status: 413 });
  }

  // ── Step 2: Upload to Supabase renders bucket ───────────────────────────
  const ts = Date.now();
  const storagePath = `youtube-ingest/${userId}/${ts}-${download.videoId ?? 'unknown'}.mp4`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, download.videoBuffer, {
      contentType: 'video/mp4',
      upsert: false,
    });

  if (uploadErr) {
    console.error('[from-youtube] storage upload failed:', uploadErr.message);
    return createApiErrorResponse('STORAGE_ERROR', `Couldn't park the video for processing: ${uploadErr.message}`, 500, correlationId);
  }

  const { data: { publicUrl: storageUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);

  console.log('[from-youtube] stored', { storagePath, byteSize: download.byteSize, duration: download.duration, correlation_id: correlationId });

  // ── Step 3: Forward to /api/video-engine/runs ──────────────────────────
  // Reuse the existing run-creation path so plan caps, preset resolution,
  // clip quotas, and watermark snapshotting all behave exactly like a
  // direct-upload run. We forward the user's session cookie so getApiAuthContext
  // resolves the same auth.
  const runsBody = {
    storage_path: storagePath,
    storage_url: storageUrl,
    filename: `youtube-${download.videoId ?? ts}.mp4`,
    byte_size: download.byteSize,
    mime_type: 'video/mp4',
    duration_sec: download.duration || undefined,
    workspace: body.workspace ?? 'clipper',
    preset_keys: presetToKeys(body.preset) ?? undefined,
    target_clip_count: body.target_clip_count,
    context: {
      ...(body.context ?? {}),
      source: 'youtube',
      source_url: url,
      youtube_video_id: download.videoId,
    },
  };

  const internalUrl = new URL('/api/video-engine/runs', request.url);
  const runsRes = await fetch(internalUrl.toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Forward session cookie so the called route sees the same auth context.
      cookie: request.headers.get('cookie') ?? '',
      // Optional pass-through for service-bypass headers (admin-cron paths).
      ...(request.headers.get('authorization')
        ? { authorization: request.headers.get('authorization') as string }
        : {}),
    },
    body: JSON.stringify(runsBody),
  });

  const runsJson = await runsRes.json().catch(() => ({} as Record<string, unknown>));
  if (!runsRes.ok || !(runsJson as { ok?: boolean }).ok) {
    // Best-effort cleanup so we don't leave orphan storage objects when the
    // run-create rejects (plan limit, quota, etc).
    // Best-effort, but log it — silent failures here leak orphaned storage
    // objects that quietly eat the bucket quota.
    supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch((e) =>
      console.warn(`[from-youtube] storage cleanup failed path=${storagePath}:`, e instanceof Error ? e.message : e),
    );
    console.warn('[from-youtube] runs forward failed', { status: runsRes.status, body: runsJson });
    return NextResponse.json(runsJson, { status: runsRes.status });
  }

  const runId = (runsJson as { data?: { run_id?: string } }).data?.run_id;
  if (!runId) {
    return createApiErrorResponse('INTERNAL', 'Run created but no id returned.', 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: {
      run_id: runId,
      storage_path: storagePath,
      duration_sec: download.duration,
      byte_size: download.byteSize,
      source: 'youtube',
    },
    correlation_id: correlationId,
  });
}

// Explicit non-POST fallback so Next.js doesn't synthesize a misleading 405.
export async function GET() {
  return NextResponse.json(
    { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only.' } },
    { status: 405 },
  );
}
