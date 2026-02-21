/**
 * POST /api/creator-style/analyze
 *
 * Alias for /api/creator-style/ingest.
 * Accepts either:
 *   - { creator_id, urls[] }          (standard ingest body)
 *   - { creator_handle, platform, video_urls[] }  (auto-creates creator)
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getTranscript, detectPlatform } from '@/lib/creator-style/transcript-adapter';
import { extractFrames } from '@/lib/creator-style/frame-extractor';
import { analyzeVisuals, analyzeStyle } from '@/lib/creator-style/ai-analysis';
import { buildStylePack } from '@/lib/creator-style/style-pack';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface AnalyzeBody {
  // Standard ingest form
  creator_id?: string;
  urls?: string[];
  // Convenience form (auto-creates creator)
  creator_handle?: string;
  platform?: string;
  video_urls?: string[];
}

export async function POST(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: AnalyzeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Resolve creator_id — either directly provided or auto-created from handle
  let creatorId = body.creator_id;
  let urls = body.urls;

  if (!creatorId && body.creator_handle) {
    const handle = body.creator_handle.replace(/^@/, '').trim();
    const platform = body.platform || 'tiktok';

    if (!handle) {
      return NextResponse.json({ error: 'creator_handle must not be empty' }, { status: 400 });
    }

    // Upsert: find existing or create new
    const { data: existing } = await supabaseAdmin
      .from('style_creators')
      .select('id')
      .eq('handle', handle)
      .eq('platform', platform)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (existing) {
      creatorId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabaseAdmin
        .from('style_creators')
        .insert({ handle, platform, user_id: auth.user.id })
        .select('id')
        .single();

      if (createErr || !created) {
        return NextResponse.json(
          { error: `Failed to create creator: ${createErr?.message || 'unknown'}` },
          { status: 500 }
        );
      }
      creatorId = created.id;
    }

    urls = body.video_urls || [];
  }

  if (!creatorId || typeof creatorId !== 'string') {
    return NextResponse.json(
      { error: 'Provide creator_id or creator_handle' },
      { status: 400 }
    );
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json(
      { error: 'urls (or video_urls) array is required and must not be empty' },
      { status: 400 }
    );
  }
  if (urls.length > 10) {
    return NextResponse.json({ error: 'Maximum 10 URLs per request' }, { status: 400 });
  }

  // Verify creator exists and belongs to user
  const { data: creator, error: creatorErr } = await supabaseAdmin
    .from('style_creators')
    .select('id, handle, platform')
    .eq('id', creatorId)
    .eq('user_id', auth.user.id)
    .single();

  if (creatorErr || !creator) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
  }

  const results: Array<{ url: string; status: string; error?: string; video_id?: string }> = [];

  // Process each URL sequentially
  for (const url of urls) {
    const startTime = Date.now();

    const platform = detectPlatform(url);
    if (!platform) {
      results.push({ url, status: 'failed', error: 'Unsupported URL — must be TikTok or YouTube' });
      continue;
    }

    const { data: videoRow, error: insertErr } = await supabaseAdmin
      .from('style_creator_videos')
      .insert({
        creator_id: creatorId,
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
      await updateVideoStatus(videoId, 'transcribing');
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

      let frames: Awaited<ReturnType<typeof extractFrames>> = [];
      if (transcript.videoBuffer && transcript.duration_seconds > 0) {
        await updateVideoStatus(videoId, 'extracting_frames');
        frames = await extractFrames(transcript.videoBuffer, transcript.duration_seconds, 4);
        await supabaseAdmin
          .from('style_creator_videos')
          .update({ frame_count: frames.length })
          .eq('id', videoId);
      }

      await updateVideoStatus(videoId, 'analyzing');

      let visualObs = null;
      if (frames.length > 0) {
        try {
          visualObs = await analyzeVisuals(frames, creator.handle);
        } catch (err) {
          console.warn(`[creator-style/analyze] Visual analysis failed (non-fatal):`, err);
        }
      }

      const styleResult = await analyzeStyle(transcript.transcript, creator.handle);

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
    }
  }

  // Rebuild StylePack if any videos completed
  const completedCount = results.filter((r) => r.status === 'completed').length;
  let stylePack = null;

  if (completedCount > 0) {
    try {
      stylePack = await buildStylePack(creatorId);
    } catch (err) {
      console.warn(`[creator-style/analyze] StylePack rebuild failed:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    creator_id: creatorId,
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

async function updateVideoStatus(videoId: string, status: string) {
  await supabaseAdmin
    .from('style_creator_videos')
    .update({ status })
    .eq('id', videoId);
}
