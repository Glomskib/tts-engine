import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GET /api/cron/analyze-videos
 * Processes the analysis queue: picks pending videos, transcribes via Whisper,
 * analyzes via Claude Haiku, grades against creator average, saves results.
 * Processes up to 5 videos per run. Designed to run every 15 minutes.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const BATCH_SIZE = 5;
  let processed = 0;
  let failed = 0;

  try {
    // Pick next batch from queue
    const { data: queueItems, error: queueErr } = await supabaseAdmin
      .from('analysis_queue')
      .select(`
        id, user_id, tiktok_video_id,
        tiktok_videos!inner(id, share_url, view_count, like_count, comment_count, share_count, duration, title, description)
      `)
      .eq('status', 'pending')
      .lt('attempts', 3)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (queueErr || !queueItems || queueItems.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, message: 'Queue empty' });
    }

    // Get creator averages for grading (per user)
    const userIds = [...new Set(queueItems.map(q => q.user_id))];
    const userAverages: Record<string, { avgViews: number; avgEngagement: number }> = {};

    for (const userId of userIds) {
      const { data: stats } = await supabaseAdmin
        .from('tiktok_videos')
        .select('view_count, like_count, comment_count, share_count')
        .eq('user_id', userId)
        .not('view_count', 'is', null)
        .gt('view_count', 0)
        .limit(200);

      if (stats && stats.length > 0) {
        const avgViews = stats.reduce((s, v) => s + (v.view_count || 0), 0) / stats.length;
        const avgEngagement = stats.reduce((s, v) => {
          const views = v.view_count || 1;
          const eng = ((v.like_count || 0) + (v.comment_count || 0) + (v.share_count || 0)) / views * 100;
          return s + eng;
        }, 0) / stats.length;
        userAverages[userId] = { avgViews, avgEngagement };
      } else {
        userAverages[userId] = { avgViews: 0, avgEngagement: 0 };
      }
    }

    const openaiKey = process.env.OPENAI_API_KEY;

    for (const item of queueItems) {
      const video = (item as any).tiktok_videos;
      if (!video?.share_url) {
        // No URL to download — skip
        await supabaseAdmin.from('analysis_queue')
          .update({ status: 'skipped', completed_at: new Date().toISOString() })
          .eq('id', item.id);
        continue;
      }

      // Mark as processing
      await supabaseAdmin.from('analysis_queue')
        .update({ status: 'processing', started_at: new Date().toISOString(), attempts: (item as any).attempts + 1 })
        .eq('id', item.id);

      try {
        // Step 1: Transcribe via internal API (reuses existing transcribe pipeline)
        let transcript = '';
        let transcriptAnalysis = null;

        if (openaiKey) {
          // Call our own transcribe endpoint internally
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

          const transcribeRes = await fetch(`${baseUrl}/api/transcribe`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.INTERNAL_API_KEY || cronSecret,
            },
            body: JSON.stringify({ url: video.share_url }),
            signal: AbortSignal.timeout(45000),
          });

          if (transcribeRes.ok) {
            const tData = await transcribeRes.json();
            transcript = tData.transcript || '';
            transcriptAnalysis = tData.analysis || null;
          } else {
            console.warn(`[analyze-videos] Transcribe failed for ${video.id}: ${transcribeRes.status}`);
          }
        }

        // Step 2: Grade the video
        const userAvg = userAverages[item.user_id] || { avgViews: 0, avgEngagement: 0 };
        let grade = 'C'; // default

        if (userAvg.avgViews > 0) {
          const viewRatio = (video.view_count || 0) / userAvg.avgViews;
          if (viewRatio >= 2.0) grade = 'A';
          else if (viewRatio >= 1.3) grade = 'B';
          else if (viewRatio >= 0.7) grade = 'C';
          else if (viewRatio >= 0.3) grade = 'D';
          else grade = 'F';
        }

        // Step 3: Extract content tags from description
        const contentTags: string[] = [];
        const desc = (video.description || '').toLowerCase();
        const tagPatterns = ['fitness', 'supplement', 'health', 'beauty', 'skincare', 'food',
          'recipe', 'fashion', 'tech', 'lifestyle', 'wellness', 'workout', 'review',
          'unboxing', 'tutorial', 'storytime', 'grwm', 'haul', 'routine'];
        for (const tag of tagPatterns) {
          if (desc.includes(tag)) contentTags.push(tag);
        }
        // Extract hashtags
        const hashtags = desc.match(/#\w+/g) || [];
        for (const ht of hashtags.slice(0, 10)) {
          contentTags.push(ht.replace('#', ''));
        }

        // Step 4: Update tiktok_videos with analysis
        await supabaseAdmin
          .from('tiktok_videos')
          .update({
            transcript_text: transcript || null,
            ai_analysis: transcriptAnalysis || null,
            content_grade: grade,
            content_tags: [...new Set(contentTags)],
            analyzed_at: new Date().toISOString(),
          })
          .eq('id', video.id);

        // Step 5: Mark queue item complete
        await supabaseAdmin.from('analysis_queue')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', item.id);

        processed++;

      } catch (videoErr: any) {
        console.error(`[analyze-videos] Error processing ${video.id}:`, videoErr.message);
        await supabaseAdmin.from('analysis_queue')
          .update({ status: 'failed', last_error: videoErr.message })
          .eq('id', item.id);
        failed++;
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      failed,
      queue_items_found: queueItems.length,
    });

  } catch (err: any) {
    console.error('[analyze-videos] Fatal error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
