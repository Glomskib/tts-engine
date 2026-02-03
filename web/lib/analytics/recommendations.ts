/**
 * Analytics Recommendations
 *
 * Generate AI-powered recommendations based on winners data
 */

import type {
  WinnersAnalytics,
  Recommendation,
} from './types';

/**
 * Generate actionable recommendations based on analytics data
 */
export function generateRecommendations(data: WinnersAnalytics): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const { overview, topPerformers } = data;

  // Need at least 3 winners for meaningful recommendations
  if (overview.totalWinners < 3) {
    return [];
  }

  // KEEP DOING: Top hook type performer with significant sample
  const topHook = topPerformers.hookTypes[0];
  if (topHook && topHook.count >= 3) {
    recommendations.push({
      type: 'keep_doing',
      title: `${topHook.label} hooks are working`,
      description: `${topHook.count} of your ${overview.totalWinners} winners used ${topHook.label} hooks with ${topHook.avgEngagement.toFixed(1)}% avg engagement.`,
      confidence: topHook.count >= 5 ? 'high' : 'medium',
    });
  }

  // KEEP DOING: Top content format
  const topFormat = topPerformers.contentFormats[0];
  if (topFormat && topFormat.count >= 3) {
    recommendations.push({
      type: 'keep_doing',
      title: `${topFormat.label} format performs well`,
      description: `${topFormat.count} winners use ${topFormat.label} format with ${topFormat.avgEngagement.toFixed(1)}% engagement. Keep creating this type of content.`,
      confidence: topFormat.count >= 5 ? 'high' : 'medium',
    });
  }

  // TRY MORE: High engagement but low usage format
  const underusedFormat = topPerformers.contentFormats.find(
    f => f.avgEngagement > overview.avgWinnerEngagement && f.count >= 2 && f.count < 5
  );
  if (underusedFormat) {
    recommendations.push({
      type: 'try_more',
      title: `Explore ${underusedFormat.label} more`,
      description: `${underusedFormat.label} shows ${underusedFormat.avgEngagement.toFixed(1)}% engagement but you've only created ${underusedFormat.count}. Could be untapped potential.`,
      confidence: 'medium',
    });
  }

  // TRY MORE: High engagement hook type with low usage
  const underusedHook = topPerformers.hookTypes.find(
    h => h.avgEngagement > overview.avgWinnerEngagement && h.count >= 2 && h.count < 4
  );
  if (underusedHook && underusedHook !== topHook) {
    recommendations.push({
      type: 'try_more',
      title: `${underusedHook.label} hooks show promise`,
      description: `${underusedHook.avgEngagement.toFixed(1)}% engagement from ${underusedHook.count} winners. Consider using this hook type more often.`,
      confidence: 'medium',
    });
  }

  // AVOID: Below-average hook performers
  const weakHook = topPerformers.hookTypes.find(
    h => h.count >= 2 && h.avgEngagement < overview.avgWinnerEngagement * 0.7
  );
  if (weakHook) {
    recommendations.push({
      type: 'avoid',
      title: `${weakHook.label} hooks underperform`,
      description: `${weakHook.avgEngagement.toFixed(1)}% avg engagement vs your overall ${overview.avgWinnerEngagement.toFixed(1)}%. Consider using other hook types.`,
      confidence: weakHook.count >= 3 ? 'high' : 'low',
    });
  }

  // AVOID: Below-average content format
  const weakFormat = topPerformers.contentFormats.find(
    f => f.count >= 2 && f.avgEngagement < overview.avgWinnerEngagement * 0.7
  );
  if (weakFormat) {
    recommendations.push({
      type: 'avoid',
      title: `${weakFormat.label} format underperforms`,
      description: `Only ${weakFormat.avgEngagement.toFixed(1)}% engagement compared to ${overview.avgWinnerEngagement.toFixed(1)}% average. Try different formats.`,
      confidence: weakFormat.count >= 3 ? 'high' : 'low',
    });
  }

  // VIDEO LENGTH recommendation
  if (topPerformers.videoLengths.sweetSpot) {
    const { min, max } = topPerformers.videoLengths.sweetSpot;
    recommendations.push({
      type: 'keep_doing',
      title: `${min}-${max}s is your sweet spot`,
      description: `Your best performing videos are in this length range. Stay within it for optimal results.`,
      confidence: 'high',
    });
  }

  // Win rate recommendation
  if (overview.winRate > 5) {
    recommendations.push({
      type: 'keep_doing',
      title: `Strong ${overview.winRate.toFixed(1)}% win rate`,
      description: `You're creating winners at an above-average rate. Keep applying the patterns that work.`,
      confidence: 'high',
    });
  } else if (overview.winRate < 2 && overview.totalScriptsGenerated >= 20) {
    recommendations.push({
      type: 'try_more',
      title: `Improve your win rate`,
      description: `Only ${overview.winRate.toFixed(1)}% of scripts become winners. Focus on your top-performing hook types and formats.`,
      confidence: 'medium',
    });
  }

  // Limit to top 5 most relevant recommendations
  return recommendations.slice(0, 5);
}

/**
 * Get recommendation icon color based on type
 */
export function getRecommendationColor(type: Recommendation['type']) {
  switch (type) {
    case 'keep_doing':
      return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: '🎯' };
    case 'try_more':
      return { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: '💡' };
    case 'avoid':
      return { bg: 'bg-red-500/20', text: 'text-red-400', icon: '⚠️' };
    default:
      return { bg: 'bg-zinc-500/20', text: 'text-zinc-400', icon: '📊' };
  }
}

/**
 * Get confidence indicator
 */
export function getConfidenceIndicator(confidence: Recommendation['confidence']) {
  switch (confidence) {
    case 'high':
      return { label: 'High confidence', dots: 3 };
    case 'medium':
      return { label: 'Medium confidence', dots: 2 };
    case 'low':
      return { label: 'Low confidence', dots: 1 };
    default:
      return { label: 'Unknown', dots: 0 };
  }
}
