/**
 * TikTok Draft Export Service
 * ============================
 *
 * Sends a rendered content item video to a TikTok creator's inbox (draft).
 * The operator can then open TikTok, attach Shop products, and publish.
 *
 * Flow:
 *   1. Validate content item has a rendered video
 *   2. Resolve active TikTok Content Posting connection
 *   3. Ensure fresh access token (refresh if expired)
 *   4. Call publishVideoToInbox (PULL_FROM_URL → inbox)
 *   5. Store publish_id and status on content_items
 *   6. Poll for completion via getPublishStatus
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getTikTokContentClient, type PublishStatusResult } from '@/lib/tiktok-content';
import { sendTelegramLog } from '@/lib/telegram';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraftExportRequest {
  contentItemId: string;
  accountId: string;
  actorId: string; // user who triggered the export
}

export interface DraftExportResult {
  success: boolean;
  publish_id?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export async function exportContentItemToTikTokDraft(
  req: DraftExportRequest,
): Promise<DraftExportResult> {
  const { contentItemId, accountId, actorId } = req;

  // 1. Load the content item
  const { data: item, error: itemErr } = await supabaseAdmin
    .from('content_items')
    .select('id, title, rendered_video_url, caption, hashtags, primary_hook, workspace_id, tiktok_draft_status')
    .eq('id', contentItemId)
    .single();

  if (itemErr || !item) {
    return { success: false, error: 'Content item not found' };
  }

  if (!item.rendered_video_url) {
    return { success: false, error: 'No rendered video — render the video first' };
  }

  if (item.tiktok_draft_status === 'processing') {
    return { success: false, error: 'Draft export already in progress' };
  }

  // 2. Get active content connection for this account
  const { data: connection, error: connErr } = await supabaseAdmin
    .from('tiktok_content_connections')
    .select('id, account_id, access_token, refresh_token, token_expires_at, status, last_error')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .single();

  if (connErr || !connection) {
    return { success: false, error: 'No active TikTok Content connection for this account. Connect in Settings → TikTok.' };
  }

  // 3. Ensure fresh token
  const client = getTikTokContentClient();
  let accessToken: string;

  try {
    accessToken = await ensureFreshContentToken(connection, client);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token refresh failed';
    return { success: false, error: `Token error: ${msg}` };
  }

  // 4. Build title from content item fields
  const titleParts: string[] = [];
  if (item.caption) {
    titleParts.push(item.caption);
  } else if (item.primary_hook) {
    titleParts.push(item.primary_hook);
  } else if (item.title) {
    titleParts.push(item.title);
  }
  if (item.hashtags && item.hashtags.length > 0) {
    titleParts.push(item.hashtags.join(' '));
  }
  const title = titleParts.join('\n\n').slice(0, 2200); // TikTok title limit

  // 5. Mark as processing
  await supabaseAdmin
    .from('content_items')
    .update({
      tiktok_draft_status: 'processing',
      tiktok_draft_account_id: accountId,
      tiktok_draft_error: null,
      tiktok_draft_requested_at: new Date().toISOString(),
      tiktok_draft_completed_at: null,
      tiktok_draft_publish_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contentItemId);

  // 6. Send to TikTok inbox
  try {
    const result = await client.publishVideoToInbox(accessToken, {
      video_url: item.rendered_video_url,
      title,
    });

    // Store publish_id for status polling
    await supabaseAdmin
      .from('content_items')
      .update({
        tiktok_draft_publish_id: result.publish_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contentItemId);

    // Log event
    await supabaseAdmin.from('content_item_events').insert({
      content_item_id: contentItemId,
      event_type: 'tiktok_draft_export',
      actor: actorId,
      to_value: 'processing',
      details: { publish_id: result.publish_id, account_id: accountId },
    });

    return { success: true, publish_id: result.publish_id };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    await supabaseAdmin
      .from('content_items')
      .update({
        tiktok_draft_status: 'failed',
        tiktok_draft_error: errorMsg,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contentItemId);

    await supabaseAdmin.from('content_item_events').insert({
      content_item_id: contentItemId,
      event_type: 'tiktok_draft_export',
      actor: actorId,
      to_value: 'failed',
      details: { error: errorMsg, account_id: accountId },
    });

    sendTelegramLog(`❌ TikTok draft export failed for ${item.title || contentItemId.slice(0, 8)}: ${errorMsg}`);

    return { success: false, error: errorMsg };
  }
}

// ---------------------------------------------------------------------------
// Poll draft export status
// ---------------------------------------------------------------------------

export async function pollDraftExportStatus(contentItemId: string): Promise<{
  status: string;
  tiktok_status?: string;
  error?: string;
}> {
  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('tiktok_draft_status, tiktok_draft_publish_id, tiktok_draft_account_id, tiktok_draft_error, title')
    .eq('id', contentItemId)
    .single();

  if (!item) {
    return { status: 'error', error: 'Content item not found' };
  }

  if (item.tiktok_draft_status !== 'processing' || !item.tiktok_draft_publish_id) {
    return {
      status: item.tiktok_draft_status || 'none',
      error: item.tiktok_draft_error || undefined,
    };
  }

  // Get connection for this account
  const { data: connection } = await supabaseAdmin
    .from('tiktok_content_connections')
    .select('id, account_id, access_token, refresh_token, token_expires_at, status')
    .eq('account_id', item.tiktok_draft_account_id)
    .eq('status', 'active')
    .single();

  if (!connection) {
    return { status: 'processing', error: 'Connection lost' };
  }

  const client = getTikTokContentClient();
  let accessToken: string;

  try {
    accessToken = await ensureFreshContentToken(connection, client);
  } catch {
    return { status: 'processing', error: 'Token refresh needed' };
  }

  let publishStatus: PublishStatusResult;
  try {
    publishStatus = await client.getPublishStatus(accessToken, item.tiktok_draft_publish_id);
  } catch (err) {
    return {
      status: 'processing',
      error: err instanceof Error ? err.message : 'Status check failed',
    };
  }

  if (publishStatus.status === 'SEND_TO_USER_INBOX' || publishStatus.status === 'PUBLISH_COMPLETE') {
    await supabaseAdmin
      .from('content_items')
      .update({
        tiktok_draft_status: 'sent',
        tiktok_draft_error: null,
        tiktok_draft_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contentItemId);

    await supabaseAdmin.from('content_item_events').insert({
      content_item_id: contentItemId,
      event_type: 'tiktok_draft_export',
      from_value: 'processing',
      to_value: 'sent',
      details: { tiktok_status: publishStatus.status },
    });

    sendTelegramLog(`📱 TikTok draft sent: ${item.title || contentItemId.slice(0, 8)} — ready in TikTok inbox`);

    return { status: 'sent', tiktok_status: publishStatus.status };
  }

  if (publishStatus.status === 'FAILED') {
    const reason = publishStatus.fail_reason || 'Unknown failure';
    await supabaseAdmin
      .from('content_items')
      .update({
        tiktok_draft_status: 'failed',
        tiktok_draft_error: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contentItemId);

    await supabaseAdmin.from('content_item_events').insert({
      content_item_id: contentItemId,
      event_type: 'tiktok_draft_export',
      from_value: 'processing',
      to_value: 'failed',
      details: { fail_reason: reason },
    });

    return { status: 'failed', error: reason };
  }

  // Still processing
  return { status: 'processing', tiktok_status: publishStatus.status };
}

// ---------------------------------------------------------------------------
// Token refresh helper (mirrors auto-post cron pattern)
// ---------------------------------------------------------------------------

interface ContentConnection {
  id: string;
  account_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  status: string;
}

async function ensureFreshContentToken(
  connection: ContentConnection,
  client: ReturnType<typeof getTikTokContentClient>,
): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  const isExpired = Date.now() > expiresAt - 60_000; // 1 min buffer

  if (!isExpired) {
    return connection.access_token;
  }

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
}
