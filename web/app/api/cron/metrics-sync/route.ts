/**
 * Cron: Metrics Sync Worker
 *
 * Finds content_item_posts that need metrics updates and attempts to
 * fetch fresh data from available providers in priority order:
 *   1. platform_api  — direct platform API (future)
 *   2. posting_provider — posting service API (future)
 *   3. scrape-lite — lightweight scraper (future)
 *   4. manual — skip (user-entered data)
 *
 * Currently: logs posts needing sync. Actual provider integrations will be
 * added as platform APIs are connected (Late.dev analytics, TikTok API, etc.).
 *
 * Runs every 30 minutes. Protected by CRON_SECRET.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { scoreAndPersist } from '@/lib/content-intelligence/contentScore';
import { updateProductPerformance } from '@/lib/content-intelligence/productPerformance';

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
  metrics_source: string;
  latest_snapshot_at: string | null;
}

export const GET = withErrorCapture(async (request: Request) => {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  // Find posts that haven't been synced recently
  const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  // Get all posts with their latest snapshot timestamp
  const { data: posts, error: postsError } = await supabaseAdmin
    .from('content_item_posts')
    .select('id, workspace_id, platform, post_url, metrics_source')
    .eq('status', 'posted')
    .order('created_at', { ascending: false })
    .limit(BATCH_SIZE * 2);

  if (postsError || !posts?.length) {
    return NextResponse.json({
      ok: true,
      synced: 0,
      skipped: 0,
      message: postsError ? 'Failed to fetch posts' : 'No posts to sync',
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
      metrics_source: p.metrics_source,
      latest_snapshot_at: latestSnapshotMap.get(p.id) || null,
    }));

  let synced = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const result = await syncPostMetrics(candidate);
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
    durationMs: Date.now() - startedAt,
  });
}, { routeName: '/api/cron/metrics-sync', feature: 'content-intel' });

/**
 * Attempt to sync metrics for a single post via available providers.
 * Provider cascade: platform_api → posting_provider → scrape-lite → skip
 */
async function syncPostMetrics(
  candidate: SyncCandidate,
): Promise<{ synced: boolean; source?: string }> {
  // Try providers in priority order
  const providers = [
    { name: 'platform_api', fn: tryPlatformApi },
    { name: 'posting_provider', fn: tryPostingProvider },
    { name: 'scrape_lite', fn: tryScrapeLite },
  ];

  for (const provider of providers) {
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

        return { synced: true, source: provider.name };
      }
    } catch (err) {
      console.error(`${LOG} ${provider.name} failed for ${candidate.post_id}:`, err);
    }
  }

  return { synced: false };
}

// ── Provider stubs ────────────────────────────────────────────

interface MetricsData {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  avg_watch_time_seconds?: number | null;
  completion_rate?: number | null;
}

/**
 * Platform API provider — direct API integration (TikTok, Instagram, etc.)
 * TODO: Implement when platform OAuth tokens are available.
 */
async function tryPlatformApi(_candidate: SyncCandidate): Promise<MetricsData | null> {
  // Future: check if workspace has connected platform account
  // and fetch metrics via the platform's API
  return null;
}

/**
 * Posting provider — fetch from posting service (Late.dev analytics add-on).
 * TODO: Implement when Late.dev analytics API is integrated.
 */
async function tryPostingProvider(_candidate: SyncCandidate): Promise<MetricsData | null> {
  // Future: query Late.dev /api/v1/analytics for post metrics
  return null;
}

/**
 * Scrape-lite provider — lightweight public data extraction.
 * TODO: Implement with headless browser or API proxy.
 */
async function tryScrapeLite(_candidate: SyncCandidate): Promise<MetricsData | null> {
  // Future: lightweight scraping for public metrics
  return null;
}
