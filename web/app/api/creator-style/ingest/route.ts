/**
 * POST /api/creator-style/ingest
 *
 * Main pipeline: download → transcribe → extract frames → AI analyze → save.
 * Processes URLs sequentially to respect API rate limits.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getTranscript, detectPlatform } from '@/lib/creator-style/transcript-adapter';
import { extractFrames } from '@/lib/creator-style/frame-extractor';
import { analyzeVisuals, analyzeStyle } from '@/lib/creator-style/ai-analysis';
import { buildStylePack } from '@/lib/creator-style/style-pack';
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

interface IngestBody {
  creator_id: string;
  urls: string[];
}

export async function POST(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { creator_id, urls } = body;

  if (!creator_id || typeof creator_id !== 'string') {
    return NextResponse.json({ error: 'creator_id is required' }, { status: 400 });
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: 'urls array is required and must not be empty' }, { status: 400 });
  }
  if (urls.length > 10) {
    return NextResponse.json({ error: 'Maximum 10 URLs per request' }, { status: 400 });
  }

  // Verify creator exists and belongs to user
  const { data: creator, error: creatorErr } = await supabaseAdmin
    .from('style_creators')
    .select('id, handle, platform')
    .eq('id', creator_id)
    .eq('user_id', auth.user.id)
    .single();

  if (creatorErr || !creator) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
  }

  const results: Array<{ url: string; status: string; error?: string; video_id?: string }> = [];

  // Process each URL sequentially
  for (const url of urls) {
    const startTime = Date.now();

    // Detect platform
    const platform = detectPlatform(url);
    if (!platform) {
      results.push({ url, status: 'failed', error: 'Unsupported URL — must be TikTok or YouTube' });
      continue;
    }

    // Create video row in pending state
    const { data: videoRow, error: insertErr } = await supabaseAdmin
      .from('style_creator_videos')
      .insert({
        creator_id,
        user_id: auth.user.id,
        url,
        platform,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertErr) {
      if (insertErr.code === '23505') {
        results.push({ url, status: 'skipped', error: 'URL already analyzed for this creator' });
      } else {
        results.push({ url, status: 'failed', error: insertErr.message });
      }
      continue;
    }

    const videoId = videoRow.id;

    try {
      // Step 1: Download + Transcribe
      await updateVideoStatus(videoId, 'downloading');
      await updateVideoStatus(videoId, 'transcribing');

      console.log(`[creator-style] Transcribing: ${url}`);
      const transcript = await getTranscript(url, platform);

      await supabaseAdmin
        .from('style_creator_videos')
        .update({
          transcript_text: transcript.transcript,
          transcript_segments: transcript.segments,
          transcript_language: transcript.language,
          duration_seconds: transcript.duration_seconds,
        })
        .eq('id', videoId);

      // Step 2: Extract frames (TikTok only — we have the video buffer)
      let frames: Awaited<ReturnType<typeof extractFrames>> = [];

      if (transcript.videoBuffer && transcript.duration_seconds > 0) {
        await updateVideoStatus(videoId, 'extracting_frames');
        console.log(`[creator-style] Extracting frames: ${url}`);
        frames = await extractFrames(
          transcript.videoBuffer,
          transcript.duration_seconds,
          4,
        );

        await supabaseAdmin
          .from('style_creator_videos')
          .update({ frame_count: frames.length })
          .eq('id', videoId);
      }

      // Step 3: AI Analysis
      await updateVideoStatus(videoId, 'analyzing');
      console.log(`[creator-style] AI analysis: ${url}`);

      // Visual analysis (only if we have frames)
      let visualObs = null;
      if (frames.length > 0) {
        try {
          visualObs = await analyzeVisuals(frames, creator.handle);
        } catch (err) {
          console.warn(`[creator-style] Visual analysis failed (non-fatal):`, err);
        }
      }

      // Style analysis (always — we always have a transcript)
      const styleResult = await analyzeStyle(transcript.transcript, creator.handle);

      // Step 4: Save results
      const processingTimeMs = Date.now() - startTime;

      await supabaseAdmin
        .from('style_creator_videos')
        .update({
          visual_observation: visualObs,
          style_analysis: styleResult,
          status: 'completed',
          processing_time_ms: processingTimeMs,
          analyzed_at: new Date().toISOString(),
        })
        .eq('id', videoId);

      results.push({ url, status: 'completed', video_id: videoId });
      console.log(`[creator-style] Completed: ${url} in ${processingTimeMs}ms`);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const processingTimeMs = Date.now() - startTime;

      await supabaseAdmin
        .from('style_creator_videos')
        .update({
          status: 'failed',
          error_message: errorMessage.slice(0, 2000),
          processing_time_ms: processingTimeMs,
        })
        .eq('id', videoId);

      results.push({ url, status: 'failed', error: errorMessage, video_id: videoId });
      console.error(`[creator-style] Failed: ${url}:`, errorMessage);
    }
  }

  // Rebuild StylePack if any videos completed
  const completedCount = results.filter((r) => r.status === 'completed').length;
  let stylePack = null;

  if (completedCount > 0) {
    try {
      stylePack = await buildStylePack(creator_id);
      console.log(`[creator-style] StylePack rebuilt for @${creator.handle}`);
    } catch (err) {
      console.warn(`[creator-style] StylePack rebuild failed:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    creator_id,
    handle: creator.handle,
    results,
    summary: {
      total: urls.length,
      completed: completedCount,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    },
    style_pack_rebuilt: !!stylePack,
  });
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function updateVideoStatus(videoId: string, status: string) {
  await supabaseAdmin
    .from('style_creator_videos')
    .update({ status })
    .eq('id', videoId);
}
