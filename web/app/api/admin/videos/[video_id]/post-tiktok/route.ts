import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getTikTokContentClient } from '@/lib/tiktok-content';
import { sendTelegramNotification } from '@/lib/telegram';

/**
 * POST /api/admin/videos/[video_id]/post-tiktok
 * Manually trigger posting a single video to TikTok via Content Posting API.
 * Same logic as cron Phase 2, but for a single video.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ video_id: string }> },
) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { video_id } = await params;

  const client = getTikTokContentClient();
  if (!client.isConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'TikTok Content API not configured. Set TIKTOK_CONTENT_APP_KEY and TIKTOK_CONTENT_APP_SECRET.' },
      { status: 400 },
    );
  }

  // Fetch the video
  const { data: video, error: videoErr } = await supabaseAdmin
    .from('videos')
    .select('id, final_video_url, account_id, product_id, script_text, recording_status, tiktok_post_status')
    .eq('id', video_id)
    .single();

  if (videoErr || !video) {
    return NextResponse.json({ ok: false, error: 'Video not found' }, { status: 404 });
  }

  if (!video.final_video_url) {
    return NextResponse.json({ ok: false, error: 'Video has no final_video_url — cannot post.' }, { status: 400 });
  }

  if (!video.account_id) {
    return NextResponse.json({ ok: false, error: 'Video has no posting account assigned.' }, { status: 400 });
  }

  if (video.tiktok_post_status === 'processing') {
    return NextResponse.json({ ok: false, error: 'Video is already being posted to TikTok.' }, { status: 409 });
  }

  if (video.tiktok_post_status === 'published') {
    return NextResponse.json({ ok: false, error: 'Video is already published on TikTok.' }, { status: 409 });
  }

  // Get active content connection
  const { data: connection } = await supabaseAdmin
    .from('tiktok_content_connections')
    .select('*')
    .eq('account_id', video.account_id)
    .eq('status', 'active')
    .single();

  if (!connection) {
    return NextResponse.json(
      { ok: false, error: 'No active TikTok Content connection for this account. Connect in Settings.' },
      { status: 400 },
    );
  }

  try {
    // Ensure fresh token
    const accessToken = await ensureFreshToken(connection, client);

    // Build caption
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

    return NextResponse.json({
      ok: true,
      publish_id: publishResult.publish_id,
      message: 'Video submitted to TikTok. Status will update automatically.',
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[post-tiktok] Error for ${video_id}:`, err);

    await supabaseAdmin
      .from('videos')
      .update({
        tiktok_post_status: 'failed',
        auto_post_error: errorMsg,
        auto_post_attempted_at: new Date().toISOString(),
      })
      .eq('id', video.id);

    sendTelegramNotification(`❌ Manual TikTok post failed: ${video_id.slice(0, 8)} — ${errorMsg}`);

    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}

// --- Helpers (duplicated from cron for route independence) ---

async function ensureFreshToken(
  connection: { id: string; access_token: string; refresh_token: string; token_expires_at: string; account_id: string },
  client: ReturnType<typeof getTikTokContentClient>,
): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  const isExpired = Date.now() > expiresAt - 60_000;

  if (!isExpired) {
    return connection.access_token;
  }

  try {
    const refreshed = await client.refreshToken(connection.refresh_token);

    await supabaseAdmin
      .from('tiktok_content_connections')
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + refreshed.refresh_expires_in * 1000).toISOString(),
        status: 'active',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    return refreshed.access_token;
  } catch (err) {
    await supabaseAdmin
      .from('tiktok_content_connections')
      .update({
        status: 'expired',
        last_error: err instanceof Error ? err.message : String(err),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    throw err;
  }
}

async function buildCaption(video: {
  script_text?: string | null;
  product_id?: string | null;
}): Promise<string> {
  const parts: string[] = [];

  if (video.script_text) {
    const truncated = video.script_text.length > 150
      ? video.script_text.slice(0, 147) + '...'
      : video.script_text;
    parts.push(truncated);
  }

  if (video.product_id) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('name')
      .eq('id', video.product_id)
      .single();

    if (product?.name && !parts.length) {
      parts.push(product.name);
    }
  }

  parts.push('#fyp #tiktokshop');

  return parts.join('\n\n');
}
