/**
 * Video Engine → Distribution
 *
 * Creates outbound posting jobs for rendered clips. V1 supports TikTok
 * draft export via the existing Content Posting API client. Direct post
 * and multi-channel are wired but gated behind ve_user_settings flags.
 *
 * Flow:
 *   run completes → markRecommendedClip() → autoCreateExportJobs()
 *   cron tick → processDistributionJobs()
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getTikTokContentClient } from '@/lib/tiktok-content';

type Channel = 'tiktok' | 'youtube' | 'instagram' | 'twitter' | 'late';
type ExportMode = 'draft' | 'direct';
type JobStatus = 'pending' | 'queued' | 'submitting' | 'processing' | 'published' | 'failed' | 'cancelled';

interface DistributionJob {
  id: string;
  user_id: string;
  run_id: string;
  rendered_clip_id: string;
  channel: Channel;
  mode: ExportMode;
  asset_url: string | null;
  caption: string | null;
  hashtags: string[] | null;
  title: string | null;
  status: JobStatus;
  provider_publish_id: string | null;
  error: string | null;
}

interface UserSettings {
  auto_export_tiktok_draft: boolean;
  require_review_before_export: boolean;
  default_export_mode: ExportMode;
  tiktok_content_account_id: string | null;
}

const DEFAULT_SETTINGS: UserSettings = {
  auto_export_tiktok_draft: false,
  require_review_before_export: true,
  default_export_mode: 'draft',
  tiktok_content_account_id: null,
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const { data } = await supabaseAdmin
    .from('ve_user_settings')
    .select('auto_export_tiktok_draft,require_review_before_export,default_export_mode,tiktok_content_account_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data ? { ...DEFAULT_SETTINGS, ...data } : DEFAULT_SETTINGS;
}

export async function upsertUserSettings(
  userId: string,
  patch: Partial<UserSettings>,
): Promise<UserSettings> {
  const current = await getUserSettings(userId);
  const merged = { ...current, ...patch };
  await supabaseAdmin
    .from('ve_user_settings')
    .upsert({
      user_id: userId,
      ...merged,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  return merged;
}

// ---------------------------------------------------------------------------
// Recommended clip
// ---------------------------------------------------------------------------

export async function markRecommendedClip(runId: string): Promise<string | null> {
  await supabaseAdmin
    .from('ve_rendered_clips')
    .update({ is_recommended: false })
    .eq('run_id', runId);

  const { data: best } = await supabaseAdmin
    .from('ve_rendered_clips')
    .select('id,candidate_id')
    .eq('run_id', runId)
    .eq('status', 'complete')
    .neq('template_key', 'combined')
    .order('candidate_id', { ascending: true })
    .limit(10);

  if (!best || best.length === 0) return null;

  const candidateIds = best.map((b) => b.candidate_id).filter(Boolean);
  if (candidateIds.length === 0) {
    await supabaseAdmin
      .from('ve_rendered_clips')
      .update({ is_recommended: true })
      .eq('id', best[0].id);
    return best[0].id;
  }

  const { data: candidates } = await supabaseAdmin
    .from('ve_clip_candidates')
    .select('id,score')
    .in('id', candidateIds)
    .order('score', { ascending: false })
    .limit(1);

  const topCandidateId = candidates?.[0]?.id;
  const winner = topCandidateId
    ? best.find((b) => b.candidate_id === topCandidateId) ?? best[0]
    : best[0];

  await supabaseAdmin
    .from('ve_rendered_clips')
    .update({ is_recommended: true })
    .eq('id', winner.id);

  return winner.id;
}

// ---------------------------------------------------------------------------
// Create distribution jobs
// ---------------------------------------------------------------------------

export async function createDistributionJob(params: {
  userId: string;
  runId: string;
  renderedClipId: string;
  channel: Channel;
  mode: ExportMode;
  assetUrl: string;
  caption: string | null;
  hashtags: string[] | null;
  title: string | null;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('ve_distribution_jobs')
    .insert({
      user_id: params.userId,
      run_id: params.runId,
      rendered_clip_id: params.renderedClipId,
      channel: params.channel,
      mode: params.mode,
      asset_url: params.assetUrl,
      caption: params.caption,
      hashtags: params.hashtags,
      title: params.title,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Failed to create distribution job: ${error?.message}`);
  return data.id;
}

/**
 * Called when a run transitions to 'complete'. Creates distribution jobs
 * for the recommended clip if the user has auto-export enabled.
 */
export async function autoCreateExportJobs(runId: string, userId: string): Promise<number> {
  const settings = await getUserSettings(userId);
  if (!settings.auto_export_tiktok_draft) return 0;
  if (settings.require_review_before_export) return 0;

  const { data: recommended } = await supabaseAdmin
    .from('ve_rendered_clips')
    .select('id,output_url,caption_text,hashtags,suggested_title')
    .eq('run_id', runId)
    .eq('is_recommended', true)
    .eq('status', 'complete')
    .maybeSingle();

  if (!recommended || !recommended.output_url) return 0;

  const accountId = settings.tiktok_content_account_id;
  if (!accountId) return 0;

  const { data: conn } = await supabaseAdmin
    .from('tiktok_content_connections')
    .select('id')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .maybeSingle();
  if (!conn) return 0;

  await createDistributionJob({
    userId,
    runId,
    renderedClipId: recommended.id,
    channel: 'tiktok',
    mode: 'draft',
    assetUrl: recommended.output_url,
    caption: recommended.caption_text,
    hashtags: recommended.hashtags,
    title: recommended.suggested_title,
  });
  return 1;
}

// ---------------------------------------------------------------------------
// Process distribution jobs
// ---------------------------------------------------------------------------

async function ensureFreshToken(accountId: string): Promise<string> {
  const { data: conn } = await supabaseAdmin
    .from('tiktok_content_connections')
    .select('id,access_token,refresh_token,token_expires_at')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .single();
  if (!conn) throw new Error('No active TikTok connection');

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 60_000) return conn.access_token;

  const client = getTikTokContentClient();
  const refreshed = await client.refreshToken(conn.refresh_token);

  await supabaseAdmin
    .from('tiktok_content_connections')
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    })
    .eq('id', conn.id);

  return refreshed.access_token;
}

async function executeTikTokJob(job: DistributionJob): Promise<void> {
  const settings = await getUserSettings(job.user_id);
  const accountId = settings.tiktok_content_account_id;
  if (!accountId) throw new Error('No TikTok account configured');
  if (!job.asset_url) throw new Error('No asset URL on job');

  const accessToken = await ensureFreshToken(accountId);
  const client = getTikTokContentClient();

  const titleParts: string[] = [];
  if (job.caption) titleParts.push(job.caption);
  if (job.hashtags?.length) titleParts.push(job.hashtags.map((h) => `#${h}`).join(' '));
  const title = titleParts.join('\n\n').slice(0, 2200);

  if (job.mode === 'draft') {
    const result = await client.publishVideoToInbox(accessToken, {
      video_url: job.asset_url,
      title,
    });
    await supabaseAdmin
      .from('ve_distribution_jobs')
      .update({
        status: 'processing',
        provider_publish_id: result.publish_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  } else {
    const result = await client.publishVideoFromUrl(accessToken, {
      video_url: job.asset_url,
      title,
      privacy_level: 'SELF_ONLY',
    });
    await supabaseAdmin
      .from('ve_distribution_jobs')
      .update({
        status: 'processing',
        provider_publish_id: result.publish_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  }
}

async function pollTikTokJob(job: DistributionJob): Promise<void> {
  if (!job.provider_publish_id) return;

  const settings = await getUserSettings(job.user_id);
  const accountId = settings.tiktok_content_account_id;
  if (!accountId) return;

  const accessToken = await ensureFreshToken(accountId);
  const client = getTikTokContentClient();
  const status = await client.getPublishStatus(accessToken, job.provider_publish_id);

  const ttStatus = status.status;
  if (ttStatus === 'PUBLISH_COMPLETE') {
    await supabaseAdmin
      .from('ve_distribution_jobs')
      .update({
        status: 'published',
        provider_response: status as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  } else if (ttStatus === 'FAILED') {
    await supabaseAdmin
      .from('ve_distribution_jobs')
      .update({
        status: 'failed',
        error: status.fail_reason || 'TikTok publish failed',
        provider_response: status as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  }
}

/**
 * Process pending + in-flight distribution jobs. Called by the cron tick.
 */
export async function processDistributionJobs(max = 3): Promise<number> {
  let processed = 0;

  const { data: pending } = await supabaseAdmin
    .from('ve_distribution_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(max);

  for (const row of pending ?? []) {
    const job = row as DistributionJob;
    try {
      await supabaseAdmin
        .from('ve_distribution_jobs')
        .update({ status: 'submitting', updated_at: new Date().toISOString() })
        .eq('id', job.id);
      job.status = 'submitting';

      if (job.channel === 'tiktok') {
        await executeTikTokJob(job);
      }
      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from('ve_distribution_jobs')
        .update({ status: 'failed', error: msg.slice(0, 1000), updated_at: new Date().toISOString() })
        .eq('id', job.id);
    }
  }

  const { data: inflight } = await supabaseAdmin
    .from('ve_distribution_jobs')
    .select('*')
    .in('status', ['submitting', 'processing'])
    .order('updated_at', { ascending: true })
    .limit(max);

  for (const row of inflight ?? []) {
    const job = row as DistributionJob;
    try {
      if (job.channel === 'tiktok') {
        await pollTikTokJob(job);
      }
      processed++;
    } catch (err) {
      console.warn('[ve-distribution] poll error:', err instanceof Error ? err.message : err);
    }
  }

  return processed;
}
