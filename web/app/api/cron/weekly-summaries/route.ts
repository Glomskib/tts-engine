import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  score: number;
  winners: number;
  losers: number;
  flagged: number;
  total: number;
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodEnd.getDate() - 7);

  try {
    // Find users with recent feedback
    const { data: activeUsers } = await supabaseAdmin
      .from("clawbot_feedback")
      .select("created_by")
      .gte("created_at", periodStart.toISOString())
      .not("created_by", "is", null);

    const uniqueUserIds = [...new Set(activeUsers?.map(f => f.created_by).filter(Boolean))] as string[];

    console.error(`[cron/weekly-summaries] Processing ${uniqueUserIds.length} users with recent feedback`);

    let processed = 0;
    let errors = 0;

    for (const userId of uniqueUserIds) {
      try {
        // Fetch feedback for this user
        const { data: feedback } = await supabaseAdmin
          .from("clawbot_feedback")
          .select("id, skit_id, feedback_type, strategy_used, performance_outcome, created_at")
          .eq("created_by", userId)
          .gte("created_at", periodStart.toISOString())
          .order("created_at", { ascending: false });

        if (!feedback?.length) continue;

        // Fetch associated skits to get strategy_metadata
        const skitIds = [...new Set(feedback.map(f => f.skit_id))];
        const skitMap: Record<string, Record<string, unknown>> = {};

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

        // Aggregate patterns by angle
        const angleBuckets: Record<string, AngleBucket> = {};

        for (const fb of feedback) {
          const strategyUsed = (fb.strategy_used as Record<string, unknown>) ?? {};
          const skitStrategy = skitMap[fb.skit_id] ?? {};
          const angle = String(
            strategyUsed.recommended_angle || skitStrategy.recommended_angle || "unknown"
          );

          if (!angleBuckets[angle]) {
            angleBuckets[angle] = { angle, score: 0, winners: 0, losers: 0, flagged: 0, total: 0 };
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

        const summary = {
          window: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
          totals: {
            feedback_events: feedback.length,
            unique_skits: skitIds.length,
            unique_angles: allBuckets.length,
          },
          winning_patterns: allBuckets
            .filter(b => b.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5),
          losing_patterns: allBuckets
            .filter(b => b.score < 0)
            .sort((a, b) => a.score - b.score)
            .slice(0, 5),
          suppression_rules: allBuckets
            .filter(b => b.losers + b.flagged >= 3 && b.total >= 10)
            .map(b => ({
              pattern_id: b.angle,
              reason: `${b.losers} losers + ${b.flagged} flagged out of ${b.total} total`,
              status: "warn",
              until: new Date(Date.now() + 30 * 86400000).toISOString(),
            })),
          generated_by: "cron",
        };

        // Upsert summary
        const { error: upsertError } = await supabaseAdmin
          .from("clawbot_summaries")
          .upsert(
            {
              user_id: userId,
              period_start: periodStart.toISOString().slice(0, 10),
              period_end: periodEnd.toISOString().slice(0, 10),
              summary_type: "weekly",
              summary,
            },
            { onConflict: "user_id,summary_type,period_start,period_end" }
          );

        if (upsertError) {
          console.error(`[cron/weekly-summaries] Upsert error for user ${userId}:`, upsertError.message);
          errors++;
        } else {
          processed++;
        }
      } catch (userError) {
        console.error(`[cron/weekly-summaries] Error processing user ${userId}:`, userError);
        errors++;
      }
    }

    console.error(`[cron/weekly-summaries] Done: ${processed} processed, ${errors} errors`);

    return NextResponse.json({
      ok: true,
      processed,
      errors,
      total_users: uniqueUserIds.length,
    });
  } catch (error) {
    console.error("[cron/weekly-summaries] Cron job failed:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
