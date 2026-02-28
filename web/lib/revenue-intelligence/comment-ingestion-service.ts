/**
 * Revenue Intelligence – Comment Ingestion Service
 *
 * Orchestrates the full ingestion cycle:
 * 1. Fetch active creator accounts
 * 2. For each account, run the Playwright scraper
 * 3. Upsert videos + comments (skip duplicates via platform_comment_id)
 * 4. Mark new comments as is_processed = false
 * 5. Log everything to ri_agent_logs
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logAndTime } from './agent-logger';
import type {
  RiCreatorAccount,
  ScrapedVideo,
  ScrapedComment,
  IngestionRunResult,
  IngestionConfig,
  DEFAULT_INGESTION_CONFIG,
} from './types';

const TAG = '[ri:ingestion]';

// ── Fetch active accounts ──────────────────────────────────────

export async function getActiveCreatorAccounts(
  userId?: string,
): Promise<RiCreatorAccount[]> {
  let query = supabaseAdmin
    .from('ri_creator_accounts')
    .select('*')
    .eq('is_active', true);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) {
    console.error(`${TAG} Failed to fetch accounts:`, error.message);
    return [];
  }
  return (data ?? []) as RiCreatorAccount[];
}

// ── Upsert video ───────────────────────────────────────────────

export async function upsertVideo(
  userId: string,
  accountId: string,
  video: ScrapedVideo,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('ri_videos')
    .upsert(
      {
        user_id: userId,
        creator_account_id: accountId,
        platform_video_id: video.platform_video_id,
        caption: video.caption,
        video_url: video.video_url,
        comment_count_at_scan: video.comment_count,
      },
      { onConflict: 'user_id,platform_video_id' },
    )
    .select('id')
    .single();

  if (error) {
    console.error(`${TAG} Video upsert failed:`, error.message);
    return null;
  }
  return data?.id ?? null;
}

// ── Insert comments (skip duplicates) ──────────────────────────

export async function insertComments(
  userId: string,
  videoId: string,
  comments: ScrapedComment[],
): Promise<{ inserted: number; duplicates: number }> {
  if (comments.length === 0) return { inserted: 0, duplicates: 0 };

  const rows = comments.map((c) => ({
    user_id: userId,
    video_id: videoId,
    platform_comment_id: c.platform_comment_id,
    comment_text: c.comment_text,
    commenter_username: c.commenter_username,
    commenter_display_name: c.commenter_display_name,
    like_count: c.like_count,
    reply_count: c.reply_count,
    is_reply: c.is_reply,
    parent_comment_id: c.parent_comment_id,
    posted_at: c.posted_at,
    raw_json: c.raw_json,
    is_processed: false,
  }));

  // Use upsert with onConflict to skip duplicates gracefully
  const { data, error } = await supabaseAdmin
    .from('ri_comments')
    .upsert(rows, {
      onConflict: 'user_id,platform_comment_id',
      ignoreDuplicates: true,
    })
    .select('id');

  if (error) {
    console.error(`${TAG} Comment insert failed:`, error.message);
    return { inserted: 0, duplicates: comments.length };
  }

  const inserted = data?.length ?? 0;
  return { inserted, duplicates: comments.length - inserted };
}

// ── Create initial status for new comments ─────────────────────

export async function createCommentStatuses(
  commentIds: string[],
): Promise<void> {
  if (commentIds.length === 0) return;

  const rows = commentIds.map((id) => ({
    comment_id: id,
    status: 'unread' as const,
    flagged_urgent: false,
  }));

  const { error } = await supabaseAdmin
    .from('ri_comment_status')
    .upsert(rows, { onConflict: 'comment_id', ignoreDuplicates: true });

  if (error) {
    console.error(`${TAG} Status creation failed:`, error.message);
  }
}

// ── Update last scan timestamp ─────────────────────────────────

export async function updateLastScan(accountId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('ri_creator_accounts')
    .update({ last_scan_at: new Date().toISOString() })
    .eq('id', accountId);

  if (error) {
    console.error(`${TAG} Failed to update last_scan_at:`, error.message);
  }
}

// ── Get unprocessed comments ───────────────────────────────────

export async function getUnprocessedComments(
  userId: string,
  limit: number = 50,
): Promise<Array<{ id: string; comment_text: string; video_id: string }>> {
  const { data, error } = await supabaseAdmin
    .from('ri_comments')
    .select('id, comment_text, video_id')
    .eq('user_id', userId)
    .eq('is_processed', false)
    .order('ingested_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error(`${TAG} Failed to fetch unprocessed:`, error.message);
    return [];
  }
  return data ?? [];
}

// ── Mark comments as processed ─────────────────────────────────

export async function markCommentsProcessed(
  commentIds: string[],
): Promise<void> {
  if (commentIds.length === 0) return;

  const { error } = await supabaseAdmin
    .from('ri_comments')
    .update({ is_processed: true })
    .in('id', commentIds);

  if (error) {
    console.error(`${TAG} Failed to mark processed:`, error.message);
  }
}

// ── Orchestrator ───────────────────────────────────────────────

export async function runIngestionForAccount(
  account: RiCreatorAccount,
  scrapeResults: Array<{ video: ScrapedVideo; comments: ScrapedComment[] }>,
): Promise<IngestionRunResult> {
  const timer = logAndTime('ingestion_run', account.user_id);
  const start = Date.now();
  const errors: string[] = [];
  let totalNew = 0;
  let totalDup = 0;
  let totalFound = 0;

  for (const result of scrapeResults) {
    try {
      const videoId = await upsertVideo(account.user_id, account.id, result.video);
      if (!videoId) {
        errors.push(`Failed to upsert video ${result.video.platform_video_id}`);
        continue;
      }

      totalFound += result.comments.length;
      const { inserted, duplicates } = await insertComments(
        account.user_id,
        videoId,
        result.comments,
      );
      totalNew += inserted;
      totalDup += duplicates;

      // Fetch the IDs of newly inserted comments to create status rows
      if (inserted > 0) {
        const newCommentIds = result.comments
          .slice(0, inserted)
          .map((c) => c.platform_comment_id);

        const { data: newRows } = await supabaseAdmin
          .from('ri_comments')
          .select('id')
          .eq('user_id', account.user_id)
          .in('platform_comment_id', newCommentIds);

        if (newRows && newRows.length > 0) {
          await createCommentStatuses(newRows.map((r) => r.id));
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      console.error(`${TAG} Error processing video:`, msg);
    }
  }

  await updateLastScan(account.id);

  const runResult: IngestionRunResult = {
    account_id: account.id,
    username: account.username,
    videos_scanned: scrapeResults.length,
    comments_found: totalFound,
    comments_new: totalNew,
    comments_duplicate: totalDup,
    errors,
    duration_ms: Date.now() - start,
  };

  await timer.finish(
    {
      account_id: account.id,
      username: account.username,
      videos_scanned: runResult.videos_scanned,
      comments_new: runResult.comments_new,
      comments_duplicate: runResult.comments_duplicate,
    },
    errors.length > 0 ? errors.join('; ') : undefined,
  );

  return runResult;
}
