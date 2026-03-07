/**
 * Content Item sync helpers.
 *
 * Centralizes operations that bridge content_items with the legacy
 * videos / saved_skits / winners_bank tables. Each helper is designed
 * to be called from the relevant API route after its primary write
 * succeeds — content_items sync is always *additive* and fire-and-forget
 * safe (errors are logged, never thrown to callers).
 *
 * Tenant scoping: every write uses the provided workspaceId
 * (== user.id in single-workspace mode).
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

// ──────────────────────────────────────────────────────────────────
// Event logging
// ──────────────────────────────────────────────────────────────────

export async function logContentItemEvent(
  contentItemId: string,
  eventType: string,
  actor: string | null,
  fromValue: string | null,
  toValue: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabaseAdmin.from('content_item_events').insert({
      content_item_id: contentItemId,
      event_type: eventType,
      actor,
      from_value: fromValue,
      to_value: toValue,
      details,
    });
  } catch (err) {
    console.error('[content_item_events] Failed to log event:', err);
  }
}

// ──────────────────────────────────────────────────────────────────
// Pipeline sync: recording_status change → content_items
// ──────────────────────────────────────────────────────────────────

/** Map recording_status to content_item status */
const RECORDING_TO_CI_STATUS: Record<string, string> = {
  NEEDS_SCRIPT: 'briefing',
  GENERATING_SCRIPT: 'briefing',
  NOT_RECORDED: 'ready_to_record',
  AI_RENDERING: 'ready_to_record',
  READY_FOR_REVIEW: 'editing',
  RECORDED: 'recorded',
  EDITED: 'editing',
  APPROVED_NEEDS_EDITS: 'editing',
  READY_TO_POST: 'ready_to_post',
  POSTED: 'posted',
  REJECTED: 'briefing',
};

/**
 * After a pipeline status change on a video, sync the linked content_item.
 * If no content_item exists for this video, one is created.
 */
export async function syncPipelineStatusToContentItem(params: {
  videoId: string;
  workspaceId: string;
  actorId: string;
  newRecordingStatus: string;
  previousRecordingStatus: string | null;
  videoTitle?: string | null;
  productId?: string | null;
  postedUrl?: string | null;
  postedPlatform?: string | null;
  postedAt?: string | null;
}): Promise<string | null> {
  const {
    videoId, workspaceId, actorId,
    newRecordingStatus, previousRecordingStatus,
    videoTitle, productId, postedUrl, postedPlatform, postedAt,
  } = params;

  try {
    // Look up existing content_item linked to this video
    const { data: existing } = await supabaseAdmin
      .from('content_items')
      .select('id, status')
      .eq('video_id', videoId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    const newCiStatus = RECORDING_TO_CI_STATUS[newRecordingStatus] || 'briefing';

    const updatePayload: Record<string, unknown> = {
      status: newCiStatus,
      recording_status: newRecordingStatus,
    };

    if (newRecordingStatus === 'POSTED') {
      if (postedUrl) updatePayload.post_url = postedUrl;
      if (postedPlatform) updatePayload.posted_platform = postedPlatform;
      if (postedAt) updatePayload.posted_at = postedAt;
    }

    let contentItemId: string;

    if (existing) {
      // Update existing
      contentItemId = existing.id;
      await supabaseAdmin
        .from('content_items')
        .update(updatePayload)
        .eq('id', existing.id);
    } else {
      // Create new content_item linked to this video
      const { data: created, error } = await supabaseAdmin
        .from('content_items')
        .insert({
          workspace_id: workspaceId,
          video_id: videoId,
          title: videoTitle || `Pipeline video`,
          status: newCiStatus,
          recording_status: newRecordingStatus,
          product_id: productId || null,
          source_type: 'manual',
          created_by: actorId,
          short_id: 'temp', // overridden by DB trigger
          ...updatePayload,
        })
        .select('id')
        .single();

      if (error || !created) {
        console.error('[syncPipelineStatus] Failed to create content_item:', error);
        return null;
      }
      contentItemId = created.id;
    }

    // Log event
    await logContentItemEvent(
      contentItemId,
      'status_changed',
      actorId,
      previousRecordingStatus,
      newRecordingStatus,
      { source: 'pipeline_sync', video_id: videoId },
    );

    return contentItemId;
  } catch (err) {
    console.error('[syncPipelineStatus] Error:', err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────
// Calendar sync: scheduling → content_items.scheduled_at
// ──────────────────────────────────────────────────────────────────

/**
 * After scheduling a video in the calendar, sync to content_items.
 */
export async function syncCalendarScheduleToContentItem(params: {
  videoId: string;
  workspaceId: string;
  actorId: string;
  scheduledDate: string | null;  // YYYY-MM-DD
  scheduledTime?: string | null; // HH:MM
  accountId?: string | null;
}): Promise<void> {
  const { videoId, workspaceId, actorId, scheduledDate, scheduledTime, accountId } = params;

  try {
    const { data: existing } = await supabaseAdmin
      .from('content_items')
      .select('id, scheduled_at')
      .eq('video_id', videoId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!existing) return; // No linked content_item, nothing to sync

    const scheduledAt = scheduledDate
      ? `${scheduledDate}T${scheduledTime || '09:00'}:00Z`
      : null;

    const updatePayload: Record<string, unknown> = {
      scheduled_at: scheduledAt,
    };

    // Update status to 'scheduled' if we're setting a date and item isn't already further along
    if (scheduledAt) {
      updatePayload.status = 'scheduled';
      if (accountId) updatePayload.posting_account_id = accountId;
    }

    const previousScheduledAt = existing.scheduled_at;

    await supabaseAdmin
      .from('content_items')
      .update(updatePayload)
      .eq('id', existing.id);

    await logContentItemEvent(
      existing.id,
      'scheduled',
      actorId,
      previousScheduledAt || null,
      scheduledAt,
      { source: 'calendar_sync', video_id: videoId },
    );
  } catch (err) {
    console.error('[syncCalendarSchedule] Error:', err);
  }
}

// ──────────────────────────────────────────────────────────────────
// Script generation: create/update content_item with script
// ──────────────────────────────────────────────────────────────────

/**
 * After a script is generated or saved, ensure a content_item exists
 * with the script text and metadata.
 *
 * Returns the content_item id.
 */
export async function syncScriptToContentItem(params: {
  workspaceId: string;
  actorId: string;
  skitId: string;
  title: string;
  scriptText: string;
  scriptJson?: Record<string, unknown> | null;
  hookLine?: string | null;
  productId?: string | null;
  videoId?: string | null;
}): Promise<string | null> {
  const {
    workspaceId, actorId, skitId,
    title, scriptText, scriptJson,
    hookLine, productId, videoId,
  } = params;

  try {
    // Check if content_item already exists for this skit (via source_ref_id)
    // or for the linked video
    let existing: { id: string } | null = null;

    if (videoId) {
      const { data } = await supabaseAdmin
        .from('content_items')
        .select('id')
        .eq('video_id', videoId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      existing = data;
    }

    if (!existing) {
      const { data } = await supabaseAdmin
        .from('content_items')
        .select('id')
        .eq('source_ref_id', skitId)
        .eq('source_type', 'script_generator')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      existing = data;
    }

    const scriptPayload: Record<string, unknown> = {
      script_text: scriptText,
      primary_hook: hookLine || null,
      status: 'scripted',
    };
    if (scriptJson) scriptPayload.script_json = scriptJson;
    if (productId) scriptPayload.product_id = productId;
    if (videoId) scriptPayload.video_id = videoId;

    let contentItemId: string;

    if (existing) {
      contentItemId = existing.id;
      await supabaseAdmin
        .from('content_items')
        .update(scriptPayload)
        .eq('id', existing.id);
    } else {
      const { data: created, error } = await supabaseAdmin
        .from('content_items')
        .insert({
          workspace_id: workspaceId,
          title,
          source_type: 'script_generator',
          source_ref_id: skitId,
          created_by: actorId,
          short_id: 'temp', // overridden by DB trigger
          ...scriptPayload,
        })
        .select('id')
        .single();

      if (error || !created) {
        console.error('[syncScriptToContentItem] Failed to create:', error);
        return null;
      }
      contentItemId = created.id;
    }

    await logContentItemEvent(
      contentItemId,
      'script_generated',
      actorId,
      null,
      'scripted',
      { skit_id: skitId, source: 'script_sync' },
    );

    return contentItemId;
  } catch (err) {
    console.error('[syncScriptToContentItem] Error:', err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────
// Winners bridge: create content_item from winner
// ──────────────────────────────────────────────────────────────────

/**
 * Create a content_item from a winners_bank record.
 */
export async function createContentItemFromWinner(params: {
  workspaceId: string;
  actorId: string;
  winnerId: string;
  title: string;
  hook?: string | null;
  transcript?: string | null;
  productId?: string | null;
  videoId?: string | null;
}): Promise<string | null> {
  const {
    workspaceId, actorId, winnerId,
    title, hook, transcript, productId, videoId,
  } = params;

  try {
    const insertPayload: Record<string, unknown> = {
      workspace_id: workspaceId,
      title,
      source_type: 'winner_import',
      source_ref_id: winnerId,
      primary_hook: hook || null,
      script_text: transcript || null,
      product_id: productId || null,
      video_id: videoId || null,
      status: transcript ? 'scripted' : 'briefing',
      created_by: actorId,
      short_id: 'temp', // overridden by DB trigger
    };

    const { data: created, error } = await supabaseAdmin
      .from('content_items')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error || !created) {
      console.error('[createContentItemFromWinner] Failed:', error);
      return null;
    }

    await logContentItemEvent(
      created.id,
      'created',
      actorId,
      null,
      insertPayload.status as string,
      { winner_id: winnerId, source: 'winner_import' },
    );

    return created.id;
  } catch (err) {
    console.error('[createContentItemFromWinner] Error:', err);
    return null;
  }
}
