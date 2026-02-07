/**
 * Shared summary computation logic for weekly and monthly Clawbot summaries.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// --- Scoring helpers ---

export function scoreFeedback(type: string): number {
  if (type === "positive" || type === "winner") return 1;
  if (type === "negative" || type === "loser") return -1;
  if (type === "neutral" || type === "flagged") return -2;
  return 0;
}

export function retentionWeight(metrics: Record<string, unknown> | null): number {
  if (!metrics?.retention_half) return 0;
  const val = Number(metrics.retention_half);
  if (isNaN(val)) return 0;
  return Math.max(-0.5, Math.min(0.5, val - 0.3));
}

export interface AngleBucket {
  angle: string;
  winners: number;
  losers: number;
  flagged: number;
  total: number;
  score: number;
}

export interface ProductPatterns {
  winning: string[];
  losing: string[];
  volume: number;
}

interface FeedbackRow {
  id: string;
  skit_id: string;
  feedback_type: string;
  strategy_used: unknown;
  performance_outcome: unknown;
  created_at: string;
  video_id?: string | null;
}

/**
 * Compute a full Clawbot summary for a user over a given date range.
 */
export async function computeSummary(
  userId: string,
  periodStart: Date,
  periodEnd: Date
) {
  // 1. Fetch feedback in range
  const { data: feedbackRows, error: fbError } = await supabaseAdmin
    .from("clawbot_feedback")
    .select("id, skit_id, video_id, feedback_type, strategy_used, performance_outcome, created_at")
    .eq("created_by", userId)
    .gte("created_at", periodStart.toISOString())
    .lte("created_at", periodEnd.toISOString())
    .order("created_at", { ascending: false });

  if (fbError) {
    throw new Error(`Failed to fetch feedback: ${fbError.message}`);
  }

  const feedback = (feedbackRows ?? []) as FeedbackRow[];

  // 2. Fetch associated skits to get strategy_metadata + product_id
  const skitIds = [...new Set(feedback.map((f) => f.skit_id))];
  const skitMap: Record<string, Record<string, unknown>> = {};
  const skitProductMap: Record<string, string | null> = {};

  if (skitIds.length > 0) {
    const { data: skits } = await supabaseAdmin
      .from("saved_skits")
      .select("id, strategy_metadata, product_id")
      .in("id", skitIds);

    if (skits) {
      for (const s of skits) {
        skitMap[s.id] = (s.strategy_metadata as Record<string, unknown>) ?? {};
        skitProductMap[s.id] = (s.product_id as string) ?? null;
      }
    }
  }

  // 3. Fetch product_id from videos for feedback that has video_id
  const videoIds = [...new Set(feedback.map(f => f.video_id).filter(Boolean))] as string[];
  const videoProductMap: Record<string, string | null> = {};

  if (videoIds.length > 0) {
    const { data: videos } = await supabaseAdmin
      .from("videos")
      .select("id, product_id")
      .in("id", videoIds);

    if (videos) {
      for (const v of videos) {
        videoProductMap[v.id] = (v.product_id as string) ?? null;
      }
    }
  }

  // 4. Compute pattern scores by angle (global + per-product)
  const angleBuckets: Record<string, AngleBucket> = {};
  const productBuckets: Record<string, Record<string, AngleBucket>> = {};

  for (const fb of feedback) {
    const strategyUsed = (fb.strategy_used as Record<string, unknown>) ?? {};
    const skitStrategy = skitMap[fb.skit_id] ?? {};
    const angle = String(
      strategyUsed.recommended_angle || skitStrategy.recommended_angle || "unknown"
    );

    // Resolve product_id: skit → video → null
    const productId = skitProductMap[fb.skit_id] ??
      (fb.video_id ? videoProductMap[fb.video_id] : null) ??
      null;

    const baseScore = scoreFeedback(fb.feedback_type);
    const retention = retentionWeight(
      (fb.performance_outcome as Record<string, unknown>) ?? null
    );
    const totalScore = baseScore + retention;

    // Global bucket
    if (!angleBuckets[angle]) {
      angleBuckets[angle] = { angle, winners: 0, losers: 0, flagged: 0, total: 0, score: 0 };
    }
    const bucket = angleBuckets[angle];
    bucket.total += 1;
    bucket.score += totalScore;
    if (fb.feedback_type === "positive" || fb.feedback_type === "winner") bucket.winners += 1;
    else if (fb.feedback_type === "negative" || fb.feedback_type === "loser") bucket.losers += 1;
    else if (fb.feedback_type === "neutral" || fb.feedback_type === "flagged") bucket.flagged += 1;

    // Product-level bucket
    if (productId) {
      if (!productBuckets[productId]) productBuckets[productId] = {};
      if (!productBuckets[productId][angle]) {
        productBuckets[productId][angle] = { angle, winners: 0, losers: 0, flagged: 0, total: 0, score: 0 };
      }
      const pBucket = productBuckets[productId][angle];
      pBucket.total += 1;
      pBucket.score += totalScore;
      if (fb.feedback_type === "positive" || fb.feedback_type === "winner") pBucket.winners += 1;
      else if (fb.feedback_type === "negative" || fb.feedback_type === "loser") pBucket.losers += 1;
      else if (fb.feedback_type === "neutral" || fb.feedback_type === "flagged") pBucket.flagged += 1;
    }
  }

  const allBuckets = Object.values(angleBuckets);

  const winning_patterns = allBuckets
    .filter((b) => b.score > 0)
    .sort((a, b) => b.score - a.score);

  const losing_patterns = allBuckets
    .filter((b) => b.score < 0)
    .sort((a, b) => a.score - b.score);

  const suppression_rules = allBuckets
    .filter((b) => b.losers + b.flagged >= 3 && b.total >= 10)
    .map((b) => ({
      pattern_id: b.angle,
      reason: `${b.losers} losers + ${b.flagged} flagged out of ${b.total} total`,
      losers: b.losers,
      flagged: b.flagged,
      total: b.total,
    }));

  // Recommendations
  const recommended_next: Array<{ goal: string; angle: string; why: string }> = [];
  if (winning_patterns.length > 0) {
    const top = winning_patterns[0];
    recommended_next.push({
      goal: top.score > 2 ? "sales" : "engagement",
      angle: top.angle,
      why: `Your "${top.angle}" content has ${top.winners} winners`,
    });
  }

  // Product-level patterns (only products with ≥3 feedback events)
  const product_patterns: Record<string, ProductPatterns> = {};
  for (const [pid, angles] of Object.entries(productBuckets)) {
    const pBuckets = Object.values(angles);
    const totalVolume = pBuckets.reduce((sum, b) => sum + b.total, 0);
    if (totalVolume < 3) continue;

    product_patterns[pid] = {
      winning: pBuckets.filter(b => b.score > 0).sort((a, b) => b.score - a.score).map(b => b.angle),
      losing: pBuckets.filter(b => b.score < 0).sort((a, b) => a.score - b.score).map(b => b.angle),
      volume: totalVolume,
    };
  }

  return {
    window: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
    },
    totals: {
      feedback_events: feedback.length,
      unique_skits: skitIds.length,
      unique_angles: allBuckets.length,
    },
    winning_patterns,
    losing_patterns,
    suppression_rules,
    recommended_next,
    product_patterns,
  };
}
