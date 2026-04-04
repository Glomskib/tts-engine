/**
 * TikTok Metrics Provider
 *
 * Fetches metrics from the internal tiktok_videos table, which is
 * populated daily by the sync-tiktok-videos cron via TikTok Content API.
 *
 * This is an internal DB bridge, not a direct API call — the data is
 * already available, we just need to look it up by video ID.
 */

import type { MetricsProvider, MetricsProviderSnapshot } from './types';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function extractVideoId(postUrl: string, platformPostId?: string | null): string | null {
  if (platformPostId) return platformPostId;
  if (!postUrl) return null;
  const match = postUrl.match(/\/video\/(\d+)/);
  return match ? match[1] : null;
}

export const tiktokProvider: MetricsProvider = {
  platform: 'tiktok',

  async fetchLatest(postUrl: string, platformPostId?: string | null): Promise<MetricsProviderSnapshot> {
    const videoId = extractVideoId(postUrl, platformPostId);

    if (!videoId) {
      return {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        raw_json: { error: 'Could not extract TikTok video ID from URL', postUrl },
      };
    }

    const { data, error } = await supabaseAdmin
      .from('tiktok_videos')
      .select('view_count, like_count, comment_count, share_count, tiktok_video_id')
      .eq('tiktok_video_id', videoId)
      .maybeSingle();

    if (error || !data) {
      return {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        raw_json: {
          error: error?.message || 'No matching tiktok_videos row found',
          videoId,
        },
      };
    }

    return {
      views: data.view_count ?? 0,
      likes: data.like_count ?? 0,
      comments: data.comment_count ?? 0,
      shares: data.share_count ?? 0,
      raw_json: {
        source: 'tiktok_videos',
        tiktok_video_id: data.tiktok_video_id,
      },
    };
  },
};
