/**
 * Pure utility: computes brand health stats from raw data.
 * Extracted from app/admin/brands/page.tsx for testability.
 */

export interface BrandVideo {
  brand_name: string | null;
  product_name: string | null;
  recording_status: string | null;
  tiktok_views: number | null;
  tiktok_likes: number | null;
}

export interface BrandProduct {
  id: string;
  name: string;
  brand: string;
}

export interface BrandWinner {
  brand: string | null;
}

export interface BrandStats {
  brand: string;
  total_videos: number;
  posted_videos: number;
  winner_count: number;
  avg_engagement: number;
  products: string[];
  health_score: number; // 0-100
  health_label: 'excellent' | 'good' | 'needs_attention' | 'critical';
  suggested_product: string | null;
}

/** Minimal brand shape needed for stats computation. */
export interface BrandForStats {
  name: string;
  monthly_video_quota: number;
  videos_this_month: number;
}

export function computeBrandStats(
  brand: BrandForStats,
  videos: BrandVideo[],
  products: BrandProduct[],
  winners: BrandWinner[],
): BrandStats {
  const brandVideos = videos.filter(v => v.brand_name === brand.name);
  const postedVideos = brandVideos.filter(v => v.recording_status === 'POSTED');
  const brandWinners = winners.filter(w => w.brand === brand.name);
  const brandProducts = products.filter(p => p.brand === brand.name);

  // Calculate average engagement from posted videos with stats
  const engagements = postedVideos
    .map(v => {
      const views = v.tiktok_views || 0;
      const likes = v.tiktok_likes || 0;
      return views > 0 ? (likes / views) * 100 : 0;
    })
    .filter(e => e > 0);
  const avgEngagement = engagements.length > 0
    ? engagements.reduce((a, b) => a + b, 0) / engagements.length
    : 0;

  // Health score: weighted factors
  let score = 50; // base
  const quotaUsage = brand.monthly_video_quota > 0
    ? brand.videos_this_month / brand.monthly_video_quota
    : 0;

  // Quota utilization (30 points)
  if (brand.monthly_video_quota > 0) {
    if (quotaUsage >= 0.5 && quotaUsage <= 1.0) score += 30;
    else if (quotaUsage >= 0.25) score += 15;
    else score -= 10;
  } else {
    score += 15; // unlimited = neutral
  }

  // Content production (20 points)
  if (postedVideos.length >= 5) score += 20;
  else if (postedVideos.length >= 2) score += 10;
  else score -= 10;

  // Winners (20 points)
  if (brandWinners.length >= 3) score += 20;
  else if (brandWinners.length >= 1) score += 10;

  // Engagement (10 points)
  if (avgEngagement >= 5) score += 10;
  else if (avgEngagement >= 2) score += 5;

  score = Math.min(100, Math.max(0, score));

  const health_label: BrandStats['health_label'] =
    score >= 80 ? 'excellent' :
    score >= 60 ? 'good' :
    score >= 40 ? 'needs_attention' : 'critical';

  // Suggest product that has fewest recent videos
  const productVideoCounts = brandProducts.map(p => ({
    name: p.name,
    count: brandVideos.filter(v => v.product_name === p.name).length,
  }));
  const leastCoveredProduct = productVideoCounts.sort((a, b) => a.count - b.count)[0];

  return {
    brand: brand.name,
    total_videos: brandVideos.length,
    posted_videos: postedVideos.length,
    winner_count: brandWinners.length,
    avg_engagement: Math.round(avgEngagement * 10) / 10,
    products: brandProducts.map(p => p.name),
    health_score: score,
    health_label,
    suggested_product: leastCoveredProduct?.name || null,
  };
}
