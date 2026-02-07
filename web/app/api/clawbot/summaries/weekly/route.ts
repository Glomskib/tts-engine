import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";
import {
  enforceRateLimits,
  extractRateLimitContext,
} from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// --- Scoring helpers ---

function scoreFeedback(type: string): number {
  if (type === "positive" || type === "winner") return 1;
  if (type === "negative" || type === "loser") return -1;
  if (type === "neutral" || type === "flagged") return -2;
  return 0;
}

function retentionWeight(metrics: Record<string, unknown> | null): number {
  if (!metrics?.retention_half) return 0;
  const val = Number(metrics.retention_half);
  if (isNaN(val)) return 0;
  return Math.max(-0.5, Math.min(0.5, val - 0.3));
}

interface AngleBucket {
  angle: string;
  winners: number;
  losers: number;
  flagged: number;
  total: number;
  score: number;
}

/**
 * POST /api/clawbot/summaries/weekly
 * Generate weekly pattern summary from feedback data
 */
export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  // Auth — admin only
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  // Rate limit
  const rlContext = {
    ...extractRateLimitContext(request),
    userId: authContext.user.id,
  };
  const rateLimited = enforceRateLimits(rlContext, correlationId, { userLimit: 5 });
  if (rateLimited) return rateLimited;

  const userId = authContext.user.id;
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    // 1. Fetch feedback from last 7 days
    const { data: feedbackRows, error: fbError } = await supabaseAdmin
      .from("clawbot_feedback")
      .select("id, skit_id, feedback_type, strategy_used, performance_outcome, created_at")
      .eq("created_by", userId)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    if (fbError) {
      console.error(`[${correlationId}] Failed to fetch feedback:`, fbError.message);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch feedback data", 500, correlationId);
    }

    const feedback = feedbackRows ?? [];

    // 2. Fetch associated skits to get strategy_metadata (angles)
    const skitIds = [...new Set(feedback.map((f) => f.skit_id))];
    let skitMap: Record<string, Record<string, unknown>> = {};

    if (skitIds.length > 0) {
      const { data: skits } = await supabaseAdmin
        .from("saved_skits")
        .select("id, strategy_metadata")
        .in("id", skitIds);

      if (skits) {
        for (const s of skits) {
          skitMap[s.id] = (s.strategy_metadata as Record<string, unknown>) ?? {};
        }
      }
    }

    // 3. Compute pattern scores by angle
    const angleBuckets: Record<string, AngleBucket> = {};

    for (const fb of feedback) {
      // Get angle from either the feedback's strategy_used or the skit's strategy_metadata
      const strategyUsed = (fb.strategy_used as Record<string, unknown>) ?? {};
      const skitStrategy = skitMap[fb.skit_id] ?? {};
      const angle = String(
        strategyUsed.recommended_angle || skitStrategy.recommended_angle || "unknown"
      );

      if (!angleBuckets[angle]) {
        angleBuckets[angle] = { angle, winners: 0, losers: 0, flagged: 0, total: 0, score: 0 };
      }

      const bucket = angleBuckets[angle];
      bucket.total += 1;

      const baseScore = scoreFeedback(fb.feedback_type);
      const retention = retentionWeight(
        (fb.performance_outcome as Record<string, unknown>) ?? null
      );
      bucket.score += baseScore + retention;

      if (fb.feedback_type === "positive" || fb.feedback_type === "winner") {
        bucket.winners += 1;
      } else if (fb.feedback_type === "negative" || fb.feedback_type === "loser") {
        bucket.losers += 1;
      } else if (fb.feedback_type === "neutral" || fb.feedback_type === "flagged") {
        bucket.flagged += 1;
      }
    }

    const allBuckets = Object.values(angleBuckets);

    // 4. Split into winning, losing, suppression
    const winning_patterns = allBuckets
      .filter((b) => b.score > 0)
      .sort((a, b) => b.score - a.score);

    const losing_patterns = allBuckets
      .filter((b) => b.score < 0)
      .sort((a, b) => a.score - b.score);

    // Suppression: ≥3 losers+flagged AND total feedback ≥10
    const suppression_rules = allBuckets
      .filter((b) => b.losers + b.flagged >= 3 && b.total >= 10)
      .map((b) => ({
        pattern_id: b.angle,
        reason: `${b.losers} losers + ${b.flagged} flagged out of ${b.total} total`,
        losers: b.losers,
        flagged: b.flagged,
        total: b.total,
      }));

    // 5. Generate recommendations based on winning patterns
    const recommended_next: Array<{ goal: string; angle: string; why: string }> = [];
    if (winning_patterns.length > 0) {
      const top = winning_patterns[0];
      recommended_next.push({
        goal: top.score > 2 ? "sales" : "engagement",
        angle: top.angle,
        why: `Your "${top.angle}" content has ${top.winners} winners this week`,
      });
    }

    const summary = {
      window: {
        start: sevenDaysAgo.toISOString(),
        end: now.toISOString(),
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
    };

    // 5. Upsert to clawbot_summaries
    const periodStart = sevenDaysAgo.toISOString().slice(0, 10);
    const periodEnd = now.toISOString().slice(0, 10);

    const { error: upsertError } = await supabaseAdmin
      .from("clawbot_summaries")
      .upsert(
        {
          user_id: userId,
          period_start: periodStart,
          period_end: periodEnd,
          summary_type: "weekly",
          summary,
        },
        { onConflict: "user_id,summary_type,period_start,period_end" }
      );

    if (upsertError) {
      console.error(`[${correlationId}] Failed to upsert summary:`, upsertError.message);
      // Don't fail — still return the computed summary
    }

    const response = NextResponse.json(
      {
        ok: true,
        summary,
        correlation_id: correlationId,
      },
      { status: 201 }
    );
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (err) {
    console.error(`[${correlationId}] Weekly summary error:`, err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Failed to generate weekly summary",
      500,
      correlationId
    );
  }
}
