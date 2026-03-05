/**
 * Viral Score Predictor
 *
 * Estimates viral potential (0-100) based on historical winner patterns.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface ViralScoreInput {
  hook: string | null;
  format: string | null;
  length: string | null;
  product_id: string | null;
}

export interface ViralScoreResult {
  score: number;
  reason: string;
  breakdown: {
    hook_strength: number;
    format_success: number;
    length_success: number;
    product_performance: number;
    trend_bonus: number;
  };
}

/**
 * Predict viral score for a content combination.
 *
 * Hook strength (30%) + Format success rate (25%) +
 * Length success (15%) + Product performance (20%) + Recent trend (10%)
 */
export async function predictViralScore(
  workspaceId: string,
  input: ViralScoreInput,
): Promise<ViralScoreResult> {
  // Fetch relevant winner patterns for this workspace
  const { data: patterns } = await supabaseAdmin
    .from('winner_patterns_v2')
    .select('hook_text, format_tag, length_bucket, product_id, score, sample_size, last_win_at')
    .eq('workspace_id', workspaceId)
    .order('score', { ascending: false })
    .limit(100);

  const allPatterns = patterns || [];

  if (allPatterns.length === 0) {
    return {
      score: 50,
      reason: 'Not enough historical data — generate more content to improve predictions.',
      breakdown: { hook_strength: 50, format_success: 50, length_success: 50, product_performance: 50, trend_bonus: 50 },
    };
  }

  // 1. Hook strength (30%) — do any winning patterns share a similar hook?
  let hookScore = 50;
  let hookReason = '';
  if (input.hook) {
    const hookLower = input.hook.toLowerCase();
    const hookMatches = allPatterns.filter(p =>
      p.hook_text && hookLower.includes(p.hook_text.toLowerCase().slice(0, 20))
    );
    if (hookMatches.length > 0) {
      const best = hookMatches.reduce((a, b) => a.score > b.score ? a : b);
      hookScore = Math.min(100, best.score * 1.2);
      hookReason = `Hook type historically performs ${(best.score / 50).toFixed(1)}x higher`;
    } else {
      // Novel hook — slightly above average (novelty can be good)
      hookScore = 55;
    }
  }

  // 2. Format success rate (25%)
  let formatScore = 50;
  if (input.format) {
    const formatMatches = allPatterns.filter(p => p.format_tag === input.format);
    if (formatMatches.length > 0) {
      formatScore = formatMatches.reduce((sum, p) => sum + p.score, 0) / formatMatches.length;
    }
  }

  // 3. Length success (15%)
  let lengthScore = 50;
  if (input.length) {
    const lengthMatches = allPatterns.filter(p => p.length_bucket === input.length);
    if (lengthMatches.length > 0) {
      lengthScore = lengthMatches.reduce((sum, p) => sum + p.score, 0) / lengthMatches.length;
    }
  }

  // 4. Product performance (20%)
  let productScore = 50;
  if (input.product_id) {
    const productMatches = allPatterns.filter(p => p.product_id === input.product_id);
    if (productMatches.length > 0) {
      productScore = productMatches.reduce((sum, p) => sum + p.score, 0) / productMatches.length;
    }
  }

  // 5. Recent trend bonus (10%) — patterns with recent wins score higher
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
  const recentPatterns = allPatterns.filter(p => p.last_win_at && p.last_win_at > fourteenDaysAgo);
  const trendScore = recentPatterns.length > 0
    ? Math.min(100, (recentPatterns.length / allPatterns.length) * 200)
    : 40;

  // Weighted final score
  const finalScore = Math.round(
    hookScore * 0.30 +
    formatScore * 0.25 +
    lengthScore * 0.15 +
    productScore * 0.20 +
    trendScore * 0.10
  );

  const clampedScore = Math.max(0, Math.min(100, finalScore));

  // Build reason
  const reasons: string[] = [];
  if (hookReason) reasons.push(hookReason);
  if (formatScore > 60) reasons.push(`${input.format} format has strong historical performance`);
  if (productScore > 60) reasons.push('This product has performed well before');
  if (trendScore > 60) reasons.push('Recent winning trends align with this combo');
  if (reasons.length === 0) {
    reasons.push(clampedScore >= 70 ? 'Good combination based on historical patterns' : 'Limited pattern data for this combination');
  }

  return {
    score: clampedScore,
    reason: reasons[0],
    breakdown: {
      hook_strength: Math.round(hookScore),
      format_success: Math.round(formatScore),
      length_success: Math.round(lengthScore),
      product_performance: Math.round(productScore),
      trend_bonus: Math.round(trendScore),
    },
  };
}
