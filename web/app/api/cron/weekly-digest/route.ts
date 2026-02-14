/**
 * Cron: Weekly Digest — Every Monday 8 AM PST (4 PM UTC)
 *
 * Sends personalized weekly reports to all active paid subscribers:
 *   - Scripts generated this week
 *   - Top scoring script
 *   - Credits remaining
 *   - Retainer progress (if applicable)
 *   - Content idea recommendation
 *
 * Stores weekly snapshots in the database for dashboard analytics.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTelegramNotification } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

interface UserDigestData {
  user_id: string;
  email: string;
  plan_id: string;
  scripts_generated: number;
  top_script?: {
    id: string;
    title: string;
    score: number;
  };
  credits_used: number;
  creditsRemaining: number;
  videos_posted: number;
  retainer_data?: {
    videos_posted: number;
    videos_goal: number;
    brand_name?: string;
  };
  content_idea?: {
    persona: string;
    product: string;
    angle_lift: number;
  };
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Last Sunday
    weekStart.setHours(0, 0, 0, 0);
    const weekStartISO = weekStart.toISOString();

    console.log("[cron/weekly-digest] Starting weekly digest for week starting", weekStart.toDateString());

    // --- 1. Get all active paid subscribers ---
    const { data: subscribers, error: subError } = await supabaseAdmin
      .from("user_subscriptions")
      .select("user_id, plan_id, status")
      .in("status", ["active", "trialing"])
      .in("plan_id", ["pro", "unlimited", "agency"]); // Only paid tiers

    if (subError || !subscribers) {
      console.error("[weekly-digest] Failed to fetch subscribers:", subError);
      return NextResponse.json({ error: "Subscriber fetch failed" }, { status: 500 });
    }

    console.log(`[weekly-digest] Processing ${subscribers.length} active paid subscribers`);

    const digests: UserDigestData[] = [];
    const errors: Array<{ user_id: string; error: string }> = [];

    // --- 2. Compile data for each user ---
    for (const sub of subscribers) {
      const userId = sub.user_id;

      try {
        // Get user email
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
        const email = authUser?.user?.email || "unknown";

        // --- 2a. Scripts generated this week ---
        const { data: scriptGens, count: scriptsCount } = await supabaseAdmin
          .from("public_script_generations")
          .select("id, score, created_at", { count: "exact" })
          .eq("user_id", userId)
          .gte("created_at", weekStartISO)
          .order("created_at", { ascending: false });

        const scriptsGenerated = scriptsCount ?? 0;

        // --- 2b. Top scoring script this week ---
        let topScript: UserDigestData["top_script"] | undefined;
        if (scriptGens && scriptGens.length > 0) {
          const sorted = [...scriptGens].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          if (sorted[0].score) {
            topScript = {
              id: sorted[0].id,
              title: `Script ${sorted[0].id.substring(0, 8)}`,
              score: sorted[0].score,
            };
          }
        }

        // --- 2c. Credits remaining ---
        const { data: credits } = await supabaseAdmin
          .from("user_credits")
          .select("credits_remaining, credits_used_this_period")
          .eq("user_id", userId)
          .single();

        const creditsUsed = credits?.credits_used_this_period ?? 0;
        const creditsRemaining = credits?.credits_remaining ?? 0;

        // --- 2d. Videos posted this week ---
        const { count: videosPosted } = await supabaseAdmin
          .from("video_events")
          .select("id", { count: "exact", head: true })
          .eq("to_status", "POSTED")
          .gte("created_at", weekStartISO)
          .eq("user_id", userId);

        // --- 2e. Retainer progress (if applicable) ---
        let retainerData: UserDigestData["retainer_data"];
        const { data: brandAssignments } = await supabaseAdmin
          .from("brand_user_assignments")
          .select("brand_id, retainer_video_goal")
          .eq("user_id", userId)
          .single();

        if (brandAssignments?.brand_id) {
          const { data: brand } = await supabaseAdmin
            .from("brands")
            .select("name")
            .eq("id", brandAssignments.brand_id)
            .single();

          const { count: retainerVideosPosted } = await supabaseAdmin
            .from("video_events")
            .select("id", { count: "exact", head: true })
            .eq("to_status", "POSTED")
            .eq("brand_id", brandAssignments.brand_id)
            .gte("created_at", weekStartISO);

          retainerData = {
            videos_posted: retainerVideosPosted ?? 0,
            videos_goal: brandAssignments.retainer_video_goal ?? 50,
            brand_name: brand?.name,
          };
        }

        // --- 2f. Content idea (top performing angle this week) ---
        const { data: topAngles } = await supabaseAdmin
          .from("video_performance")
          .select("concept_id, avg_engagement_rate")
          .eq("user_id", userId)
          .gte("created_at", weekStartISO)
          .order("avg_engagement_rate", { ascending: false })
          .limit(3);

        let contentIdea: UserDigestData["content_idea"];
        if (topAngles && topAngles.length > 0) {
          const { data: concept } = await supabaseAdmin
            .from("concepts")
            .select("persona, product_id")
            .eq("id", topAngles[0].concept_id)
            .single();

          if (concept) {
            const { data: product } = await supabaseAdmin
              .from("products")
              .select("name")
              .eq("id", concept.product_id)
              .single();

            contentIdea = {
              persona: concept.persona || "Unknown",
              product: product?.name || "Unknown",
              angle_lift: topAngles[0].avg_engagement_rate ?? 0,
            };
          }
        }

        digests.push({
          user_id: userId,
          email,
          plan_id: sub.plan_id || "unknown",
          scripts_generated: scriptsGenerated,
          top_script: topScript,
          credits_used: creditsUsed,
          creditsRemaining,
          videos_posted: videosPosted ?? 0,
          retainer_data: retainerData,
          content_idea: contentIdea,
        });
      } catch (userErr) {
        console.error(`[weekly-digest] Error processing user ${userId}:`, userErr);
        errors.push({ user_id: userId, error: String(userErr) });
      }
    }

    // --- 3. Send digests and store snapshots ---
    let sentCount = 0;
    let snapshotCount = 0;

    for (const digest of digests) {
      try {
        // Build the message
        const lines: string[] = [];
        const weekEndDate = new Date(now);
        weekEndDate.setDate(weekEndDate.getDate() - weekEndDate.getDay() + 6);

        lines.push(`<b>📊 Your FlashFlow Week in Review</b>`);
        lines.push(`<i>${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(weekStart))} – ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(weekEndDate)}</i>`);
        lines.push("");

        lines.push(`<b>Scripts Generated This Week:</b> ${digest.scripts_generated}`);

        if (digest.top_script) {
          lines.push(`<b>Top Scoring Script:</b> ${digest.top_script.title} (score: ${digest.top_script.score}/10)`);
        }

        lines.push(`<b>Credits:</b> ${digest.credits_used} used | ${digest.creditsRemaining} remaining`);

        if (digest.retainer_data) {
          const pct = Math.round(
            (digest.retainer_data.videos_posted / digest.retainer_data.videos_goal) * 100
          );
          lines.push(`<b>Retainer Progress</b> ${digest.retainer_data.brand_name ? `(${digest.retainer_data.brand_name})` : ""}: ${digest.retainer_data.videos_posted}/${digest.retainer_data.videos_goal} videos (${pct}%)`);
        }

        if (digest.content_idea) {
          lines.push(`<b>Content Idea:</b> Try <b>${digest.content_idea.persona}</b> for <b>${digest.content_idea.product}</b> — this angle scored ${digest.content_idea.angle_lift}% higher this week`);
        }

        const message = lines.join("\n");

        // Send via Telegram
        await sendTelegramNotification(message);
        sentCount++;

        // Store weekly snapshot
        const { error: snapError } = await supabaseAdmin
          .from("weekly_snapshots")
          .upsert(
            {
              user_id: digest.user_id,
              week_start: weekStart.toISOString().split("T")[0],
              scripts_generated: digest.scripts_generated,
              top_script_id: digest.top_script?.id,
              top_script_score: digest.top_script?.score,
              top_script_title: digest.top_script?.title,
              credits_used: digest.credits_used,
              videos_posted: digest.videos_posted,
              retainer_videos_posted: digest.retainer_data?.videos_posted,
              retainer_videos_goal: digest.retainer_data?.videos_goal,
              content_idea_persona: digest.content_idea?.persona,
              content_idea_product: digest.content_idea?.product,
              content_idea_angle_lift: digest.content_idea?.angle_lift,
            },
            { onConflict: "user_id,week_start" }
          );

        if (snapError) {
          console.warn(`[weekly-digest] Failed to store snapshot for ${digest.user_id}:`, snapError);
        } else {
          snapshotCount++;
        }
      } catch (digestErr) {
        console.error(`[weekly-digest] Error sending digest for ${digest.email}:`, digestErr);
      }
    }

    console.log(`[weekly-digest] Sent ${sentCount} digests, stored ${snapshotCount} snapshots`);

    return NextResponse.json({
      ok: true,
      processed: digests.length,
      sent: sentCount,
      snapshots_stored: snapshotCount,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error("[cron/weekly-digest] Fatal error:", err);
    return NextResponse.json({ error: "Weekly digest failed" }, { status: 500 });
  }
}
