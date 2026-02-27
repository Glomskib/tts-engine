/**
 * Overlay Clip Index — YouTube Discovery
 *
 * Builds search queries from the ingredient list and fetches candidate
 * video metadata from the YouTube Data API v3. Prioritizes relevance
 * and obscurity over virality.
 *
 * Does NOT download video files — only stores metadata.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getClipRules, type Ingredient } from './rules-parser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveryResult {
  found: number;
  inserted: number;
  deduped: number;
  errors: string[];
  queries_run: number;
}

interface YouTubeSearchItem {
  id: { videoId?: string };
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails?: { medium?: { url: string } };
  };
}

interface YouTubeVideoItem {
  id: string;
  contentDetails?: { duration?: string };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDuration(iso: string): number {
  // PT1H2M3S → seconds
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || '0') * 3600) +
         (parseInt(match[2] || '0') * 60) +
         (parseInt(match[3] || '0'));
}

/**
 * Build search queries that prioritize relevance and mid-tier content.
 * We avoid viral-optimized queries (no "trending", "viral", "millions").
 */
function buildSearchQueries(ingredients: Ingredient[]): string[] {
  const queries: string[] = [];
  const modifiers = [
    'supplement review',
    'benefits explained',
    'science behind',
    'honest review',
    'does it work',
    'experience results',
  ];

  // Pick a subset of ingredients each run (rotate)
  const shuffled = [...ingredients].sort(() => Math.random() - 0.5);
  const batch = shuffled.slice(0, 6);

  for (const ing of batch) {
    const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
    queries.push(`${ing.name} ${mod}`);
  }

  return queries;
}

// ---------------------------------------------------------------------------
// YouTube Data API
// ---------------------------------------------------------------------------

async function searchYouTube(
  query: string,
  apiKey: string,
  maxResults = 10,
): Promise<YouTubeSearchItem[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: String(maxResults),
    order: 'relevance',
    relevanceLanguage: 'en',
    videoCaption: 'closedCaption', // only videos with captions
    key: apiKey,
  });

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params}`,
    { signal: AbortSignal.timeout(15000) },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube search failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.items || []) as YouTubeSearchItem[];
}

async function getVideoDetails(
  videoIds: string[],
  apiKey: string,
): Promise<YouTubeVideoItem[]> {
  if (videoIds.length === 0) return [];

  const params = new URLSearchParams({
    part: 'contentDetails,statistics',
    id: videoIds.join(','),
    key: apiKey,
  });

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?${params}`,
    { signal: AbortSignal.timeout(15000) },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube videos.list failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.items || []) as YouTubeVideoItem[];
}

// ---------------------------------------------------------------------------
// Main discovery
// ---------------------------------------------------------------------------

export async function runDiscovery(): Promise<DiscoveryResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return { found: 0, inserted: 0, deduped: 0, errors: ['YOUTUBE_API_KEY not set'], queries_run: 0 };
  }

  const rules = await getClipRules();
  const queries = buildSearchQueries(rules.ingredients);
  const errors: string[] = [];
  let totalFound = 0;
  let totalInserted = 0;
  let totalDeduped = 0;

  for (const query of queries) {
    try {
      const items = await searchYouTube(query, apiKey);
      const videoIds = items.map(i => i.id.videoId).filter(Boolean) as string[];
      if (videoIds.length === 0) continue;

      totalFound += videoIds.length;

      // Get detailed stats (duration, views)
      const details = await getVideoDetails(videoIds, apiKey);
      const detailMap = new Map(details.map(d => [d.id, d]));

      for (const item of items) {
        const videoId = item.id.videoId;
        if (!videoId) continue;

        const detail = detailMap.get(videoId);
        const durationS = detail?.contentDetails?.duration
          ? parseDuration(detail.contentDetails.duration)
          : null;
        const viewCount = detail?.statistics?.viewCount
          ? parseInt(detail.statistics.viewCount, 10)
          : null;

        // Skip very long videos (>30 min) — likely full podcasts
        if (durationS && durationS > 1800) continue;
        // Skip very short clips (<30s) — likely not enough content
        if (durationS && durationS < 30) continue;

        const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;

        const { error } = await supabaseAdmin
          .from('ff_clip_candidates')
          .upsert(
            {
              source_url: sourceUrl,
              video_id: videoId,
              platform: 'youtube',
              title: item.snippet.title || null,
              channel: item.snippet.channelTitle || null,
              view_count: viewCount,
              duration_s: durationS,
              published_at: item.snippet.publishedAt || null,
              thumbnail: item.snippet.thumbnails?.medium?.url || null,
              query_used: query,
              status: 'new',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'source_url', ignoreDuplicates: true },
          );

        if (error) {
          if (error.code === '23505') {
            totalDeduped++;
          } else {
            errors.push(`Insert ${videoId}: ${error.message}`);
          }
        } else {
          totalInserted++;
        }
      }
    } catch (err) {
      errors.push(`Query "${query}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    found: totalFound,
    inserted: totalInserted,
    deduped: totalDeduped,
    errors,
    queries_run: queries.length,
  };
}
