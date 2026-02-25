/**
 * Cron: Daily Telegram Digest — 9 AM ET
 *
 * Sends a summary of overnight activity:
 *   - Videos rendered overnight
 *   - Videos awaiting review
 *   - Videos approved / rejected (last 24h)
 *   - Credits remaining (Runway + HeyGen)
 *   - Pipeline health
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTelegramLog, remindersEnabled, sanitizeTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry_run") === "true";

  // Early exit: skip all DB work if reminders disabled (unless dry_run)
  if (!remindersEnabled() && !dryRun) {
    return NextResponse.json({ ok: true, skipped: true, reason: "REMINDERS_ENABLED=false" });
  }

  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayIso = yesterday.toISOString();

    // --- 1. Videos rendered overnight (moved to READY_FOR_REVIEW in last 24h) ---
    const { count: renderedCount } = await supabaseAdmin
      .from("video_events")
      .select("id", { count: "exact", head: true })
      .eq("to_status", "READY_FOR_REVIEW")
      .gte("created_at", yesterdayIso);

    // --- 2. Videos currently awaiting review ---
    const { data: awaitingReview, count: awaitingCount } = await supabaseAdmin
      .from("videos")
      .select("id, product_id", { count: "exact" })
      .eq("recording_status", "READY_FOR_REVIEW")
      .limit(10);

    // --- 3. Videos approved in last 24h ---
    const { count: approvedCount } = await supabaseAdmin
      .from("video_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "admin_review_approve")
      .gte("created_at", yesterdayIso);

    // --- 4. Videos rejected in last 24h (manual + auto) ---
    const { count: rejectedCount } = await supabaseAdmin
      .from("video_events")
      .select("id", { count: "exact", head: true })
      .eq("to_status", "REJECTED")
      .gte("created_at", yesterdayIso);

    // --- 5. Currently rendering ---
    const { count: renderingCount } = await supabaseAdmin
      .from("videos")
      .select("id", { count: "exact", head: true })
      .eq("recording_status", "AI_RENDERING");

    // --- 6. Ready to post (approved, not yet posted) ---
    const { count: readyToPostCount } = await supabaseAdmin
      .from("videos")
      .select("id", { count: "exact", head: true })
      .eq("recording_status", "READY_TO_POST");

    // --- 7. Posted in last 24h ---
    const { count: postedCount } = await supabaseAdmin
      .from("video_events")
      .select("id", { count: "exact", head: true })
      .eq("to_status", "POSTED")
      .gte("created_at", yesterdayIso);

    // --- 8. Credits remaining ---
    let runwayCredits = "unknown";
    let heygenCredits = "unknown";
    try {
      const { data: settings } = await supabaseAdmin
        .from("system_settings")
        .select("key, value")
        .in("key", ["runway_credits_remaining", "heygen_credits_remaining"]);
      if (settings) {
        for (const s of settings) {
          if (s.key === "runway_credits_remaining") runwayCredits = String(s.value);
          if (s.key === "heygen_credits_remaining") heygenCredits = String(s.value);
        }
      }
    } catch { /* ignore — table may not exist */ }

    // --- 9. Pipeline health: failures in last 24h ---
    const { count: failedCount } = await supabaseAdmin
      .from("video_events")
      .select("id", { count: "exact", head: true })
      .in("event_type", ["render_failed", "compose_failed"])
      .gte("created_at", yesterdayIso);

    // --- 10. Total videos in pipeline (not terminal states) ---
    const { count: pipelineTotal } = await supabaseAdmin
      .from("videos")
      .select("id", { count: "exact", head: true })
      .not("recording_status", "in", '("POSTED","REJECTED")');

    // --- Build the message ---
    const rendered = renderedCount ?? 0;
    const awaiting = awaitingCount ?? 0;
    const approved = approvedCount ?? 0;
    const rejected = rejectedCount ?? 0;
    const rendering = renderingCount ?? 0;
    const readyToPost = readyToPostCount ?? 0;
    const posted = postedCount ?? 0;
    const failed = failedCount ?? 0;
    const pipeline = pipelineTotal ?? 0;

    // Skip sending if nothing happened and nothing is pending
    const hasActivity = rendered + approved + rejected + posted + failed > 0;
    const hasPending = awaiting + rendering + readyToPost > 0;
    if (!hasActivity && !hasPending && pipeline === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no_activity" });
    }

    const healthEmoji = failed === 0 ? "🟢" : failed <= 2 ? "🟡" : "🔴";
    const awaitingEmoji = awaiting > 5 ? "⚠️" : awaiting > 0 ? "👀" : "✅";

    const lines = [
      `<b>📊 Daily Digest — ${now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</b>`,
      "",
      "<b>Overnight Activity</b>",
      `  🎬 Rendered: ${rendered}`,
      `  ✅ Approved: ${approved}`,
      `  ❌ Rejected: ${rejected}`,
      `  📱 Posted: ${posted}`,
      "",
      `<b>Awaiting Action</b>`,
      `  ${awaitingEmoji} Review queue: <b>${awaiting}</b>`,
      `  🚀 Ready to post: ${readyToPost}`,
      `  ⏳ Rendering now: ${rendering}`,
      "",
      `<b>Credits</b>`,
      `  🎥 Runway: ${runwayCredits}`,
      `  🗣 HeyGen: ${heygenCredits}`,
      "",
      `<b>Pipeline Health</b>`,
      `  ${healthEmoji} Failures (24h): ${failed}`,
      `  📦 Total in pipeline: ${pipeline}`,
    ];

    // Add urgency callouts
    if (awaiting > 0) {
      lines.push("");
      lines.push(`👆 <b>${awaiting} video${awaiting > 1 ? "s" : ""} waiting for your review</b>`);
    }

    const message = lines.join("\n");

    if (dryRun) {
      const sanitized = sanitizeTelegramMessage(message);
      return NextResponse.json({
        ok: true,
        dry_run: true,
        message_raw: message,
        message_sanitized: sanitized,
        would_send: sanitized !== null,
        timestamp: now.toISOString(),
      });
    }

    await sendTelegramLog(message);

    return NextResponse.json({
      ok: true,
      digest: {
        rendered,
        awaiting,
        approved,
        rejected,
        posted,
        rendering,
        readyToPost,
        failed,
        pipeline,
        runwayCredits,
        heygenCredits,
      },
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error("[cron/daily-digest] Failed:", err);
    return NextResponse.json({ error: "Digest failed" }, { status: 500 });
  }
}
