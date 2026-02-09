// Winner thresholds — configurable per account/product in the future
export const WINNER_THRESHOLDS = {
  // Engagement-based (any ONE triggers winner candidacy)
  engagement_rate: 5.0,       // 5% engagement rate
  views: 10000,               // 10k views
  likes: 500,                 // 500 likes
  comments: 50,               // 50 comments
  shares: 100,                // 100 shares

  // Sales-based (from TikTok Shop)
  sales_count: 5,             // 5 sales from video
  revenue: 100,               // $100 revenue
  conversion_rate: 2.0,       // 2% click-to-purchase

  // Time-based (minimum age before evaluation)
  min_hours_live: 24,         // Must be live 24h before judging

  // Relative performance
  above_average_multiplier: 1.5, // 1.5x above product's average
};

export interface VideoStats {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  sales_count?: number;
  revenue?: number;
  clicks?: number;
  published_at?: string;
}

export interface WinnerResult {
  is_winner: boolean;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  score: number;
  recommendation: string;
}

export function detectWinner(
  stats: VideoStats,
  productAverage?: VideoStats | null
): WinnerResult {
  const reasons: string[] = [];
  let score = 0;

  // Calculate engagement rate
  const engagementRate =
    stats.views > 0
      ? ((stats.likes + stats.comments + stats.shares) / stats.views) * 100
      : 0;

  // Check absolute thresholds
  if (engagementRate >= WINNER_THRESHOLDS.engagement_rate) {
    reasons.push(`High engagement: ${engagementRate.toFixed(1)}%`);
    score += 30;
  }

  if (stats.views >= WINNER_THRESHOLDS.views) {
    reasons.push(`Strong views: ${stats.views.toLocaleString()}`);
    score += 25;
  }

  if (stats.likes >= WINNER_THRESHOLDS.likes) {
    reasons.push(`High likes: ${stats.likes.toLocaleString()}`);
    score += 15;
  }

  if (stats.comments >= WINNER_THRESHOLDS.comments) {
    reasons.push(`Good comments: ${stats.comments}`);
    score += 15;
  }

  if (stats.shares >= WINNER_THRESHOLDS.shares) {
    reasons.push(`Viral shares: ${stats.shares}`);
    score += 20;
  }

  // Sales metrics (highest weight)
  if (stats.sales_count && stats.sales_count >= WINNER_THRESHOLDS.sales_count) {
    reasons.push(`Converting: ${stats.sales_count} sales`);
    score += 40;
  }

  if (stats.revenue && stats.revenue >= WINNER_THRESHOLDS.revenue) {
    reasons.push(`Revenue: $${stats.revenue.toFixed(2)}`);
    score += 35;
  }

  // Conversion rate
  if (stats.clicks && stats.sales_count) {
    const conversionRate = (stats.sales_count / stats.clicks) * 100;
    if (conversionRate >= WINNER_THRESHOLDS.conversion_rate) {
      reasons.push(`High conversion: ${conversionRate.toFixed(1)}%`);
      score += 30;
    }
  }

  // Relative performance (compared to product average)
  if (productAverage && productAverage.views > 0) {
    const viewsMultiplier = stats.views / productAverage.views;
    if (viewsMultiplier >= WINNER_THRESHOLDS.above_average_multiplier) {
      reasons.push(`${viewsMultiplier.toFixed(1)}x above product average`);
      score += 20;
    }
  }

  // Determine winner status (at least one strong signal = score >= 30)
  const is_winner = score >= 30;

  // Confidence based on total score
  let confidence: "high" | "medium" | "low";
  if (score >= 70) confidence = "high";
  else if (score >= 45) confidence = "medium";
  else confidence = "low";

  // Generate recommendation
  let recommendation: string;
  if (is_winner && confidence === "high") {
    recommendation = "Strong winner — analyze and replicate this approach";
  } else if (is_winner) {
    recommendation = "Winner detected — monitor for continued performance";
  } else if (score >= 20) {
    recommendation = "Promising — give it more time or boost promotion";
  } else {
    recommendation = "Underperforming — consider new angle or product";
  }

  return { is_winner, confidence, reasons, score, recommendation };
}
