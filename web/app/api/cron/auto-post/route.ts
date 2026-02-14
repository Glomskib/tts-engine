/**
 * Cron: Auto-post videos to TikTok via Content Posting API.
 * Runs every 15 minutes via Vercel Cron.
 *
 * Phase 1 — Check pending: Poll publish status for videos with tiktok_post_status = 'processing'.
 *   Complete → set POSTED + tiktok_url + Telegram. Failed → set error. Stale >2hr → timeout.
 *
 * Phase 2 — Submit new: Find READY_TO_POST videos with active content connections.
 *   Build caption, call publishVideoFromUrl, set tiktok_post_status = 'processing'. Limit 5/run.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getTikTokContentClient } from '@/lib/tiktok-content';
import { sendTelegramNotification } from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 60;

const STALE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_NEW_POSTS_PER_RUN = 5;

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getTikTokContentClient();
  if (!client.isConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'TikTok Content API not configured' });
  }

  const results: Record<string, unknown>[] = [];

  // --- Phase 1: Check processing videos ---
  await checkProcessingVideos(client, results);

  // --- Phase 2: Submit new posts ---
  await submitNewPosts(client, results);

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Phase 1: Videos with tiktok_post_status = 'processing'.
 * Poll TikTok for publish status, finalize or mark failed.
 */
async function checkProcessingVideos(
  client: InstanceType<typeof import('@/lib/tiktok-content').TikTokContentClient>,
  results: Record<string, unknown>[],
) {
  const { data: processing } = await supabaseAdmin
    .from('videos')
    .select('id, tiktok_publish_id, auto_post_attempted_at, account_id')
    .eq('tiktok_post_status', 'processing')
    .not('tiktok_publish_id', 'is', null)
    .limit(20);

  if (!processing?.length) return;

  for (const video of processing) {
    try {
      // Get the content connection for this account
      const connection = await getActiveConnection(video.account_id);
      if (!connection) {
        results.push({ id: video.id, phase: 'check', status: 'skipped', reason: 'no_connection' });
        continue;
      }

      const accessToken = await ensureFreshToken(connection, client);
      const publishStatus = await client.getPublishStatus(accessToken, video.tiktok_publish_id);

      if (publishStatus.status === 'PUBLISH_COMPLETE') {
        // Build TikTok URL from post ID if available
        const postId = publishStatus.publicaly_available_post_id?.[0];

        await supabaseAdmin
          .from('videos')
          .update({
            tiktok_post_status: 'published',
            recording_status: 'POSTED',
            posted_platform: 'tiktok',
            ...(postId ? { tiktok_url: `https://www.tiktok.com/@/video/${postId}` } : {}),
          })
          .eq('id', video.id);

        const productLabel = await getVideoProductLabel(video.id);
        sendTelegramNotification(
          `📱 <b>Auto-posted to TikTok!</b>\nProduct: ${productLabel}\nVideo: <code>${video.id.slice(0, 8)}</code>${postId ? `\nPost: ${postId}` : ''}`
        );

        results.push({ id: video.id, phase: 'check', status: 'published', postId });
      } else if (publishStatus.status === 'FAILED') {
        const reason = publishStatus.fail_reason || 'unknown';

        await supabaseAdmin
          .from('videos')
          .update({
            tiktok_post_status: 'failed',
            auto_post_error: reason,
            // Leave recording_status as READY_TO_POST for manual retry
          })
          .eq('id', video.id);

        const productLabel = await getVideoProductLabel(video.id);
        sendTelegramNotification(`❌ TikTok auto-post failed: ${productLabel} — ${reason}`);

        results.push({ id: video.id, phase: 'check', status: 'failed', reason });
      } else {
        // Still processing — check for stale timeout
        const attemptedAt = video.auto_post_attempted_at
          ? new Date(video.auto_post_attempted_at).getTime()
          : 0;
        const isStale = attemptedAt > 0 && (Date.now() - attemptedAt) > STALE_TIMEOUT_MS;

        if (isStale) {
          await supabaseAdmin
            .from('videos')
            .update({
              tiktok_post_status: 'failed',
              auto_post_error: 'Timed out after 2 hours',
            })
            .eq('id', video.id);

          results.push({ id: video.id, phase: 'check', status: 'timeout' });
        } else {
          results.push({ id: video.id, phase: 'check', status: publishStatus.status });
        }
      }
    } catch (err) {
      console.error(`[auto-post] Check error for ${video.id}:`, err);
      results.push({ id: video.id, phase: 'check', status: 'error', error: String(err) });
    }
  }
}

/**
 * Phase 2: Submit new videos for auto-posting.
 * Find READY_TO_POST videos with final_video_url and an active content connection.
 */
async function submitNewPosts(
  client: InstanceType<typeof import('@/lib/tiktok-content').TikTokContentClient>,
  results: Record<string, unknown>[],
) {
  // Find videos eligible for auto-posting
  const { data: eligible } = await supabaseAdmin
    .from('videos')
    .select('id, final_video_url, account_id, product_id, script_text')
    .eq('recording_status', 'READY_TO_POST')
    .not('final_video_url', 'is', null)
    .not('account_id', 'is', null)
    .is('tiktok_post_status', null)
    .order('created_at', { ascending: true })
    .limit(MAX_NEW_POSTS_PER_RUN);

  if (!eligible?.length) return;

  // Get all active content connections
  const accountIds = [...new Set(eligible.map(v => v.account_id))];
  const { data: connections } = await supabaseAdmin
    .from('tiktok_content_connections')
    .select('*')
    .in('account_id', accountIds)
    .eq('status', 'active');

  const connectionMap = new Map(
    (connections || []).map(c => [c.account_id, c])
  );

  for (const video of eligible) {
    const connection = connectionMap.get(video.account_id);
    if (!connection) {
      results.push({ id: video.id, phase: 'submit', status: 'skipped', reason: 'no_connection' });
      continue;
    }

    try {
      const accessToken = await ensureFreshToken(connection, client);

      // Build caption from script text + product link
      const caption = await buildCaption(video);

      const publishResult = await client.publishVideoFromUrl(accessToken, {
        video_url: video.final_video_url,
        title: caption,
        privacy_level: connection.privacy_level || 'SELF_ONLY',
      });

      await supabaseAdmin
        .from('videos')
        .update({
          tiktok_post_status: 'processing',
          tiktok_publish_id: publishResult.publish_id,
          auto_post_attempted_at: new Date().toISOString(),
          auto_post_error: null,
        })
        .eq('id', video.id);

      results.push({
        id: video.id,
        phase: 'submit',
        status: 'submitted',
        publishId: publishResult.publish_id,
      });
    } catch (err) {
      console.error(`[auto-post] Submit error for ${video.id}:`, err);
      const errorMsg = err instanceof Error ? err.message : String(err);

      await supabaseAdmin
        .from('videos')
        .update({
          tiktok_post_status: 'failed',
          auto_post_error: errorMsg,
          auto_post_attempted_at: new Date().toISOString(),
        })
        .eq('id', video.id);

      const productLabel = await getVideoProductLabel(video.id);
      sendTelegramNotification(`❌ TikTok auto-post submit failed: ${productLabel} — ${errorMsg}`);

      results.push({ id: video.id, phase: 'submit', status: 'error', error: errorMsg });
    }
  }
}

// --- Helpers ---

interface ContentConnection {
  id: string;
  account_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  privacy_level: string | null;
  status: string;
}

async function getActiveConnection(accountId: string): Promise<ContentConnection | null> {
  if (!accountId) return null;
  const { data } = await supabaseAdmin
    .from('tiktok_content_connections')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .single();
  return data;
}

/**
 * Check if token is expired and refresh if needed.
 * Returns a valid access token.
 */
async function ensureFreshToken(
  connection: ContentConnection,
  client: InstanceType<typeof import('@/lib/tiktok-content').TikTokContentClient>,
): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  const isExpired = Date.now() > expiresAt - 60_000; // 1 min buffer

  if (!isExpired) {
    return connection.access_token;
  }

  try {
    const refreshed = await client.refreshToken(connection.refresh_token);

    const newExpiresAt = new Date(
      Date.now() + refreshed.expires_in * 1000
    ).toISOString();

    const newRefreshExpiresAt = new Date(
      Date.now() + refreshed.refresh_expires_in * 1000
    ).toISOString();

    await supabaseAdmin
      .from('tiktok_content_connections')
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        token_expires_at: newExpiresAt,
        refresh_token_expires_at: newRefreshExpiresAt,
        status: 'active',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    return refreshed.access_token;
  } catch (err) {
    // Mark connection as expired
    await supabaseAdmin
      .from('tiktok_content_connections')
      .update({
        status: 'expired',
        last_error: err instanceof Error ? err.message : String(err),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    sendTelegramNotification(
      `⚠️ TikTok token refresh failed for account ${connection.account_id}. Re-connect in Settings.`
    );

    throw err;
  }
}

async function buildCaption(video: {
  script_text?: string | null;
  product_id?: string | null;
}): Promise<string> {
  const parts: string[] = [];

  // Use script_text as basis for caption if available
  if (video.script_text) {
    // Take the first ~150 chars of script as caption teaser
    const truncated = video.script_text.length > 150
      ? video.script_text.slice(0, 147) + '...'
      : video.script_text;
    parts.push(truncated);
  }

  // Add product link in caption as workaround (Content API can't attach product tags)
  if (video.product_id) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('name, tiktok_product_id')
      .eq('id', video.product_id)
      .single();

    if (product?.name && !parts.length) {
      parts.push(product.name);
    }
  }

  // Add default hashtags
  parts.push('#fyp #tiktokshop');

  return parts.join('\n\n');
}

async function getVideoProductLabel(videoId: string): Promise<string> {
  try {
    const { data: video } = await supabaseAdmin
      .from('videos')
      .select('product_id')
      .eq('id', videoId)
      .single();
    if (video?.product_id) {
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('name, brand')
        .eq('id', video.product_id)
        .single();
      if (product?.name) {
        return product.brand ? `${product.brand} — ${product.name}` : product.name;
      }
    }
  } catch {
    // fall through
  }
  return videoId.slice(0, 8);
}
