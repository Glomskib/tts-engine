/**
 * Cron: Metrics Sync Worker
 *
 * Finds content_item_posts that need metrics updates and attempts to
 * fetch fresh data from available providers in priority order:
 *   1. internal_lookup — cross-reference existing DB tables (tiktok_videos, etc.)
 *   2. posting_provider — posting service analytics API (Late.dev)
 *   3. scrape_lite — lightweight scraper (not implemented)
 *
 * Provider status:
 *   - internal_lookup: ACTIVE for TikTok (bridges tiktok_videos → content_item_metrics_snapshots)
 *   - posting_provider: DISABLED (Late.dev analytics returns aggregate, not per-post data)
 *   - scrape_lite: DISABLED (requires headless browser infrastructure)
 *
 * Runs every 30 minutes. Protected by CRON_SECRET.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { scoreAndPersist } from '@/lib/content-intelligence/contentScore';
import { updateProductPerformance } from '@/lib/content-intelligence/productPerformance';
import { checkAndSendFailureAlert } from '@/lib/ops/failure-alert';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LOG = '[cron/metrics-sync]';
const STALE_HOURS = 12; // re-sync if last snapshot is older than this
const BATCH_SIZE = 20;

interface SyncCandidate {
  post_id: string;
  workspace_id: string;
  platform: string;
  post_url: string;
  platform_post_id: string | null;
  metrics_source: string;
  latest_snapshot_at: string | null;
}

interface MetricsData {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  avg_watch_time_seconds?: number | null;
  completion_rate?: number | null;
}

interface ProviderStatus {
  name: string;
  enabled: boolean;
  reason?: string;
  attempted: number;
  succeeded: number;
}

export const GET = withErrorCapture(async (request: Request) => {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  // Track provider diagnostics
  const providerStats: Record<string, ProviderStatus> = {
    internal_lookup: { name: 'internal_lookup', enabled: true, attempted: 0, succeeded: 0 },
    posting_provider: { name: 'posting_provider', enabled: false, reason: 'Late.dev analytics returns aggregate data, not per-post metrics', attempted: 0, succeeded: 0 },
    scrape_lite: { name: 'scrape_lite', enabled: false, reason: 'Requires headless browser infrastructure — not implemented', attempted: 0, succeeded: 0 },
  };

  // Find posts that haven't been synced recently
  const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  // Get all posts with their latest snapshot timestamp
  const { data: posts, error: postsError } = await supabaseAdmin
    .from('content_item_posts')
    .select('id, workspace_id, platform, post_url, platform_post_id, metrics_source')
    .eq('status', 'posted')
    .order('created_at', { ascending: false })
    .limit(BATCH_SIZE * 2);

  if (postsError) {
    await checkAndSendFailureAlert({
      source: 'metrics-sync',
      error: postsError.message,
      cooldownMinutes: 30,
      context: { route: '/api/cron/metrics-sync' },
    });
    return NextResponse.json({
      ok: true,
      synced: 0,
      skipped: 0,
      message: 'Failed to fetch posts',
      providers: providerStats,
      durationMs: Date.now() - startedAt,
    });
  }

  if (!posts?.length) {
    return NextResponse.json({
      ok: true,
      synced: 0,
      skipped: 0,
      message: 'No posts to sync',
      providers: providerStats,
      durationMs: Date.now() - startedAt,
    });
  }

  // Get latest snapshot per post
  const postIds = posts.map(p => p.id);
  const { data: snapshots } = await supabaseAdmin
    .from('content_item_metrics_snapshots')
    .select('content_item_post_id, captured_at')
    .in('content_item_post_id', postIds)
    .order('captured_at', { ascending: false });

  const latestSnapshotMap = new Map<string, string>();
  for (const s of (snapshots || [])) {
    if (!latestSnapshotMap.has(s.content_item_post_id)) {
      latestSnapshotMap.set(s.content_item_post_id, s.captured_at);
    }
  }

  // Filter to stale posts
  const candidates: SyncCandidate[] = posts
    .filter(p => {
      if (p.metrics_source === 'manual') return false; // manual-only posts are skipped
      const lastSnapshot = latestSnapshotMap.get(p.id);
      return !lastSnapshot || lastSnapshot < staleThreshold;
    })
    .slice(0, BATCH_SIZE)
    .map(p => ({
      post_id: p.id,
      workspace_id: p.workspace_id,
      platform: p.platform,
      post_url: p.post_url,
      platform_post_id: p.platform_post_id ?? null,
      metrics_source: p.metrics_source,
      latest_snapshot_at: latestSnapshotMap.get(p.id) || null,
    }));

  let synced = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const result = await syncPostMetrics(candidate, providerStats);
    if (result.synced) {
      synced++;
    } else {
      skipped++;
    }
  }

  // Update product performance aggregates for workspaces that had synced posts
  const syncedWorkspaces = new Set(
    candidates.filter((_, i) => i < synced).map(c => c.workspace_id),
  );
  for (const wsId of syncedWorkspaces) {
    updateProductPerformance(wsId).catch(e =>
      console.error(`${LOG} product performance error for ${wsId}:`, e),
    );
  }

  console.log(`${LOG} Processed ${candidates.length} candidates: ${synced} synced, ${skipped} skipped in ${Date.now() - startedAt}ms`);

  return NextResponse.json({
    ok: true,
    synced,
    skipped,
    total_candidates: candidates.length,
    providers: providerStats,
    durationMs: Date.now() - startedAt,
  });
}, { routeName: '/api/cron/metrics-sync', feature: 'content-intel' });

/**
 * Attempt to sync metrics for a single post via available providers.
 * Provider cascade: internal_lookup → posting_provider (disabled) → scrape_lite (disabled)
 */
async function syncPostMetrics(
  candidate: SyncCandidate,
  stats: Record<string, ProviderStatus>,
): Promise<{ synced: boolean; source?: string }> {
  const providers = [
    { name: 'internal_lookup', fn: tryInternalLookup, enabled: true },
    { name: 'posting_provider', fn: tryPostingProvider, enabled: false },
    { name: 'scrape_lite', fn: tryScrapeLite, enabled: false },
  ];

  for (const provider of providers) {
    if (!provider.enabled) continue;

    stats[provider.name].attempted++;

    try {
      const metrics = await provider.fn(candidate);
      if (metrics) {
        // Insert new snapshot
        const { error } = await supabaseAdmin
          .from('content_item_metrics_snapshots')
          .insert({
            workspace_id: candidate.workspace_id,
            content_item_post_id: candidate.post_id,
            views: metrics.views ?? null,
            likes: metrics.likes ?? null,
            comments: metrics.comments ?? null,
            shares: metrics.shares ?? null,
            saves: metrics.saves ?? null,
            avg_watch_time_seconds: metrics.avg_watch_time_seconds ?? null,
            completion_rate: metrics.completion_rate ?? null,
            source: provider.name,
          });

        if (error) {
          console.error(`${LOG} snapshot insert error for post ${candidate.post_id}:`, error);
          continue;
        }

        // Update metrics_source on the post
        await supabaseAdmin
          .from('content_item_posts')
          .update({ metrics_source: provider.name })
          .eq('id', candidate.post_id);

        // Auto-score after metrics update
        scoreAndPersist(candidate.post_id, candidate.workspace_id).catch(e =>
          console.error(`${LOG} scoring error for ${candidate.post_id}:`, e),
        );

        stats[provider.name].succeeded++;
        return { synced: true, source: provider.name };
      }
    } catch (err) {
      console.error(`${LOG} ${provider.name} failed for ${candidate.post_id}:`, err);
    }
  }

  return { synced: false };
}

// ── Provider: Internal Lookup ──────────────────────────────────────
// Bridges existing DB tables (tiktok_videos, etc.) into content_item_metrics_snapshots.
// This data is already synced daily by sync-tiktok-videos cron.

/**
 * Extract TikTok video ID from a post URL.
 * Handles: tiktok.com/@user/video/7123456789, vm.tiktok.com/ABC123
 */
function extractTikTokVideoId(url: string): string | null {
  if (!url) return null;
  // Standard URL: tiktok.com/@user/video/7123456789
  const match = url.match(/\/video\/(\d+)/);
  if (match) return match[1];
  return null;
}

async function tryInternalLookup(candidate: SyncCandidate): Promise<MetricsData | null> {
  if (candidate.platform === 'tiktok') {
    return tryTikTokInternalLookup(candidate);
  }

  // Other platforms: no internal data source available yet
  console.log(`${LOG} internal_lookup: no data source for platform '${candidate.platform}' (post ${candidate.post_id})`);
  return null;
}

async function tryTikTokInternalLookup(candidate: SyncCandidate): Promise<MetricsData | null> {
  // Try to find the matching tiktok_videos row
  const videoId = candidate.platform_post_id || extractTikTokVideoId(candidate.post_url);

  if (!videoId) {
    console.log(`${LOG} internal_lookup: cannot extract TikTok video ID from post ${candidate.post_id} (url: ${candidate.post_url})`);
    return null;
  }

  const { data: tiktokVideo, error } = await supabaseAdmin
    .from('tiktok_videos')
    .select('view_count, like_count, comment_count, share_count')
    .eq('tiktok_video_id', videoId)
    .maybeSingle();

  if (error) {
    console.error(`${LOG} internal_lookup: tiktok_videos query error:`, error);
    return null;
  }

  if (!tiktokVideo) {
    console.log(`${LOG} internal_lookup: no tiktok_videos row for video ID ${videoId} (post ${candidate.post_id})`);
    return null;
  }

  // Only return if we have at least some data (views > 0 means real data)
  if (!tiktokVideo.view_count && !tiktokVideo.like_count) {
    return null;
  }

  return {
    views: tiktokVideo.view_count ?? null,
    likes: tiktokVideo.like_count ?? null,
    comments: tiktokVideo.comment_count ?? null,
    shares: tiktokVideo.share_count ?? null,
    saves: null, // not available from tiktok_videos
    avg_watch_time_seconds: null, // not available from Content API
    completion_rate: null, // not available from Content API
  };
}

// ── Provider: Posting Provider (DISABLED) ──────────────────────────
// Late.dev getAnalytics() returns aggregate platform-level data,
// not per-post metrics. Cannot map to individual content_item_posts.
// Re-enable when Late.dev adds per-post analytics or we implement
// a post-level attribution layer.

async function tryPostingProvider(_candidate: SyncCandidate): Promise<MetricsData | null> {
  // Explicitly disabled — not silently returning null
  console.log(`${LOG} posting_provider: DISABLED — Late.dev analytics returns aggregate data, not per-post metrics`);
  return null;
}

// ── Provider: Scrape-Lite (DISABLED) ───────────────────────────────
// Requires headless browser infrastructure (Playwright on HP machine
// or a scraping API). Not available in Vercel serverless environment.

async function tryScrapeLite(_candidate: SyncCandidate): Promise<MetricsData | null> {
  // Explicitly disabled — not silently returning null
  console.log(`${LOG} scrape_lite: DISABLED — requires headless browser infrastructure not available in serverless`);
  return null;
}
