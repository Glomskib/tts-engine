/**
 * Cron: auto-post avatar-driven content_items to TikTok.
 *
 * Runs every 15 minutes. Companion to /api/cron/auto-post (which handles the
 * older `videos` table). This one handles the NEW Avatar Engine flow:
 *
 *   /api/cron/avatar-daily-tick  (every day 13:00 UTC)
 *       ↓
 *   /api/avatars/[id]/render/publish-ready  (renders via HeyGen)
 *       ↓
 *   content_items row inserted with status='ready_to_post',
 *   brand_profile_id=<avatar>, final_video_url=<heygen mp4>
 *       ↓
 *   THIS CRON  (every 15 min)  →  TikTok Content Posting API
 *
 * 2026-06-01: built to close the loop end-to-end so a creator can flip
 * "Post daily on auto-pilot" on an avatar and the system runs without them.
 *
 * Auth: x-vercel-cron header OR Bearer CRON_SECRET (same pattern as
 * /api/cron/auto-post and /api/cron/video-engine-tick).
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getTikTokContentClient } from '@/lib/tiktok-content';
import { sendTelegramLog } from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PER_RUN = 5;
const STALE_PROCESSING_MS = 2 * 60 * 60 * 1000; // 2 hours — same as auto-post

interface AvatarContentItem {
  id: string;
  workspace_id: string;
  brand_profile_id: string;
  title: string | null;
  final_video_url: string | null;
  caption: string | null;
  hashtags: string[] | null;
  tiktok_post_status: string | null;
  tiktok_post_publish_id: string | null;
  tiktok_post_started_at: string | null;
}

function authorized(req: Request): boolean {
  if (req.headers.get('x-vercel-cron')) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === 'development';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getTikTokContentClient();
  if (!client.isConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'TikTok Content API not configured' });
  }

  const results: Record<string, unknown>[] = [];

  // ── Phase 1: poll in-flight publishes ──
  await pollInFlight(results);

  // ── Phase 2: submit new avatar content_items ──
  await submitNewAvatarContent(results);

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Phase 1 — re-check anything we set to 'processing' on a prior tick.
 * Mirrors the pattern in /api/cron/auto-post phase 1.
 */
async function pollInFlight(results: Record<string, unknown>[]) {
  const { data: processing } = await supabaseAdmin
    .from('content_items')
    .select('id, brand_profile_id, tiktok_post_status, tiktok_post_publish_id, tiktok_post_started_at, tiktok_post_account_id')
    .eq('tiktok_post_status', 'processing')
    .not('brand_profile_id', 'is', null);

  if (!processing?.length) return;

  const client = getTikTokContentClient();

  for (const item of processing) {
    const startedAt = item.tiktok_post_started_at ? Date.parse(item.tiktok_post_started_at) : 0;
    const ageMs = Date.now() - startedAt;

    // Stale: timeout it
    if (ageMs > STALE_PROCESSING_MS) {
      await supabaseAdmin
        .from('content_items')
        .update({
          tiktok_post_status: 'failed',
          tiktok_post_error: 'Timed out after 2 hours in processing',
        })
        .eq('id', item.id);
      results.push({ id: item.id, status: 'timeout' });
      continue;
    }

    // Poll TikTok for status
    try {
      if (!item.tiktok_post_publish_id || !item.tiktok_post_account_id) continue;
      const status = await client.getPublishStatus(item.tiktok_post_account_id, item.tiktok_post_publish_id);
      if (status.status === 'PUBLISH_COMPLETE') {
        await supabaseAdmin
          .from('content_items')
          .update({
            status: 'posted',
            tiktok_post_status: 'posted',
            tiktok_post_url: status.publicaly_available_post_id ? `https://www.tiktok.com/video/${status.publicaly_available_post_id}` : null,
            posted_at: new Date().toISOString(),
          })
          .eq('id', item.id);
        results.push({ id: item.id, status: 'posted', url: status.publicaly_available_post_id });
        sendTelegramLog(`✅ Avatar posted to TikTok: ${item.id}`).catch(() => {});
      } else if (status.status === 'FAILED') {
        await supabaseAdmin
          .from('content_items')
          .update({
            tiktok_post_status: 'failed',
            tiktok_post_error: status.fail_reason || 'TikTok reported FAILED',
          })
          .eq('id', item.id);
        results.push({ id: item.id, status: 'failed', reason: status.fail_reason });
      }
      // Still processing → leave row alone, re-check next tick
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id: item.id, status: 'poll_error', error: msg });
    }
  }
}

/**
 * Phase 2 — pick up to MAX_PER_RUN new content_items, post them.
 */
async function submitNewAvatarContent(results: Record<string, unknown>[]) {
  const { data: eligible } = await supabaseAdmin
    .from('content_items')
    .select('id, workspace_id, brand_profile_id, title, final_video_url, caption, hashtags, tiktok_post_status, tiktok_post_publish_id, tiktok_post_started_at')
    .eq('status', 'ready_to_post')
    .not('brand_profile_id', 'is', null)
    .not('final_video_url', 'is', null)
    .is('tiktok_post_status', null)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN);

  if (!eligible?.length) return;

  const client = getTikTokContentClient();

  for (const item of eligible as AvatarContentItem[]) {
    try {
      // Find the user's primary TikTok account (workspace_id = user.id).
      const { data: conn } = await supabaseAdmin
        .from('tiktok_content_connections')
        .select('account_id, access_token, refresh_token, is_active')
        .eq('user_id', item.workspace_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!conn?.account_id) {
        await supabaseAdmin
          .from('content_items')
          .update({
            tiktok_post_status: 'failed',
            tiktok_post_error: 'No active TikTok Content API connection on this workspace',
          })
          .eq('id', item.id);
        results.push({ id: item.id, status: 'no_connection' });
        continue;
      }

      // Build caption: caption + hashtags
      const baseCaption = item.caption || item.title || 'New from your AI creator';
      const tags = (item.hashtags || []).map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
      const caption = (baseCaption + (tags ? `\n\n${tags}` : '')).slice(0, 2200);

      // Submit to TikTok
      const publish = await client.publishVideoFromUrl({
        accountId: conn.account_id,
        videoUrl: item.final_video_url!,
        title: caption,
      });

      await supabaseAdmin
        .from('content_items')
        .update({
          tiktok_post_status: 'processing',
          tiktok_post_publish_id: publish.publish_id,
          tiktok_post_account_id: conn.account_id,
          tiktok_post_started_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      results.push({ id: item.id, status: 'submitted', publish_id: publish.publish_id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from('content_items')
        .update({
          tiktok_post_status: 'failed',
          tiktok_post_error: msg.slice(0, 500),
        })
        .eq('id', item.id);
      results.push({ id: item.id, status: 'submit_error', error: msg });
      sendTelegramLog(`❌ Avatar auto-post failed: ${item.id} — ${msg}`).catch(() => {});
    }
  }
}
