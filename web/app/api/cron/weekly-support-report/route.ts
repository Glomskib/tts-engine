/**
 * Cron: Weekly Support Report — Every Monday 9:30 AM PST (5:30 PM UTC)
 *
 * Queries last 7 days of support_threads + support_messages, computes:
 * - Top 10 issues (most common thread subjects/intents)
 * - Top 10 feature requests (from user_feedback where type = 'feature')
 * - Time-to-first-response (avg time between thread creation and first bot/admin message)
 * - Deflection rate (% of threads resolved by bot without admin intervention)
 *
 * Posts MC doc and writes summary to user_feedback for weekly trainer visibility.
 *
 * Schedule: 30 17 * * 1 (vercel.json)
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { postMCDoc } from "@/lib/flashflow/mission-control";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  // Cron auth
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const end = now.toISOString();
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // ── Fetch threads from last 7 days ────────────────────────
    const { data: threads, error: threadsErr } = await supabaseAdmin
      .from("support_threads")
      .select("id, subject, status, intent, tags, created_at")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false });

    if (threadsErr) {
      console.error("[cron/weekly-support-report] Threads query error:", threadsErr);
      return NextResponse.json({ error: threadsErr.message }, { status: 500 });
    }

    const threadList = threads ?? [];
    const threadIds = threadList.map((t) => t.id);

    // ── Fetch messages for those threads ──────────────────────
    let messageList: Array<{
      thread_id: string;
      sender_type: string;
      created_at: string;
    }> = [];

    if (threadIds.length > 0) {
      const { data: msgs, error: msgsErr } = await supabaseAdmin
        .from("support_messages")
        .select("thread_id, sender_type, created_at")
        .in("thread_id", threadIds)
        .eq("is_internal", false)
        .order("created_at", { ascending: true });

      if (msgsErr) {
        console.error("[cron/weekly-support-report] Messages query error:", msgsErr);
      } else {
        messageList = msgs ?? [];
      }
    }

    // ── Fetch feature requests from user_feedback ─────────────
    const { data: featureRequests } = await supabaseAdmin
      .from("user_feedback")
      .select("id, title, created_at")
      .eq("type", "feature")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(50);

    // ── Compute Top 10 Issues ─────────────────────────────────
    // Group by intent, then by keyword similarity in subjects
    const intentCounts: Record<string, number> = {};
    const subjectGroups: Record<string, string[]> = {};

    for (const t of threadList) {
      const intent = t.intent || "general";
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;

      // Simple keyword grouping: take first 3 meaningful words
      const key = (t.subject || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w: string) => w.length > 2)
        .slice(0, 3)
        .join(" ")
        || "other";
      if (!subjectGroups[key]) subjectGroups[key] = [];
      subjectGroups[key].push(t.subject);
    }

    const topIssues = Object.entries(subjectGroups)
      .map(([key, subjects]) => ({ key, count: subjects.length, example: subjects[0] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Top 10 Feature Requests ───────────────────────────────
    const featureList = (featureRequests ?? []).slice(0, 10);

    // ── Time-to-First-Response ────────────────────────────────
    const ttfrValues: number[] = [];
    const threadCreatedMap = new Map(threadList.map((t) => [t.id, new Date(t.created_at).getTime()]));

    for (const threadId of threadIds) {
      const firstResponse = messageList.find(
        (m) => m.thread_id === threadId && (m.sender_type === "system" || m.sender_type === "admin"),
      );
      if (firstResponse) {
        const created = threadCreatedMap.get(threadId);
        if (created) {
          const responseTime = new Date(firstResponse.created_at).getTime() - created;
          ttfrValues.push(responseTime);
        }
      }
    }

    const avgTTFR = ttfrValues.length > 0
      ? ttfrValues.reduce((a, b) => a + b, 0) / ttfrValues.length
      : 0;
    const avgTTFRSeconds = Math.round(avgTTFR / 1000);

    // ── Deflection Rate ───────────────────────────────────────
    // Threads resolved/closed with only user + system messages (no admin)
    let deflectedCount = 0;
    const resolvedStatuses = new Set(["resolved", "closed"]);

    for (const t of threadList) {
      if (!resolvedStatuses.has(t.status)) continue;

      const threadMsgs = messageList.filter((m) => m.thread_id === t.id);
      const hasAdmin = threadMsgs.some((m) => m.sender_type === "admin");
      if (!hasAdmin) {
        deflectedCount++;
      }
    }

    const resolvedCount = threadList.filter((t) => resolvedStatuses.has(t.status)).length;
    const deflectionRate = resolvedCount > 0 ? deflectedCount / resolvedCount : 0;

    // ── Build report ──────────────────────────────────────────
    const dateStr = now.toISOString().slice(0, 10);

    const topIssuesSection = topIssues.length > 0
      ? topIssues
          .map((i, idx) => `${idx + 1}. **${i.example}** (${i.count} threads)`)
          .join("\n")
      : "_No issues this period._";

    const featureSection = featureList.length > 0
      ? featureList
          .map((f, idx) => `${idx + 1}. ${f.title}`)
          .join("\n")
      : "_No feature requests this period._";

    const intentBreakdown = Object.entries(intentCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([intent, count]) => `- **${intent}**: ${count} threads`)
      .join("\n");

    const content = `# FlashFlow Weekly Support Report — ${dateStr}

## Period
${start.slice(0, 10)} to ${dateStr}

## Summary
| Metric | Value |
|--------|-------|
| Total threads | ${threadList.length} |
| Resolved/Closed | ${resolvedCount} |
| Avg time-to-first-response | ${avgTTFRSeconds}s |
| Deflection rate (bot-only resolution) | ${(deflectionRate * 100).toFixed(1)}% |
| Feature requests | ${(featureRequests ?? []).length} |

## Intent Breakdown
${intentBreakdown || "_No intents classified yet._"}

## Top 10 Issues
${topIssuesSection}

## Top 10 Feature Requests
${featureSection}

---
_Auto-generated by FlashFlow Weekly Support Report cron on ${now.toISOString()}_
`;

    // ── Post to Mission Control ───────────────────────────────
    const mcResult = await postMCDoc({
      title: `FlashFlow Weekly Support Report — ${dateStr}`,
      content,
      category: "reports",
      lane: "FlashFlow",
      tags: ["weekly-support-report", "support"],
    });

    console.log(
      `[cron/weekly-support-report] Done. ${threadList.length} threads, ${(featureRequests ?? []).length} feature requests, MC posted: ${mcResult.ok}`,
    );

    return NextResponse.json({
      ok: true,
      total_threads: threadList.length,
      resolved_count: resolvedCount,
      deflection_rate: deflectionRate,
      avg_ttfr_seconds: avgTTFRSeconds,
      feature_request_count: (featureRequests ?? []).length,
      mc_posted: mcResult.ok,
      mc_doc_id: mcResult.id ?? null,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error("[cron/weekly-support-report] Fatal error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
