/**
 * Cron: Weekly Report Card — Every Monday 9 AM PST
 *
 * For each active user with TikTok videos:
 *   1. Computes this week vs last week metrics
 *   2. Calls Claude Haiku for AI-generated insights
 *   3. Inserts report card into DB
 *   4. Sends email via SendGrid
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmailWithAudit } from "@/lib/email";
import { reportCardEmails, type ReportCardEmailData } from "@/lib/email/templates/report-card";

export const runtime = "nodejs";
export const maxDuration = 60;

interface WeekMetrics {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  videosPublished: number;
  engagementRate: number;
  bestVideo: { id: string; title: string; views: number } | null;
  worstVideo: { id: string; title: string; views: number } | null;
}

interface AIInsights {
  grade: string;
  summary: string;
  wins: string[];
  improvements: string[];
  tip: string;
}

function computeChangePct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDateDisplay(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

async function getWeekMetrics(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<WeekMetrics> {
  const startEpoch = Math.floor(startDate.getTime() / 1000);
  const endEpoch = Math.floor(endDate.getTime() / 1000);

  const { data: videos } = await supabaseAdmin
    .from("tiktok_videos")
    .select("id, title, description, view_count, like_count, comment_count, share_count, create_time")
    .eq("user_id", userId)
    .gte("create_time", startEpoch)
    .lt("create_time", endEpoch)
    .order("view_count", { ascending: false });

  if (!videos || videos.length === 0) {
    return {
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      videosPublished: 0,
      engagementRate: 0,
      bestVideo: null,
      worstVideo: null,
    };
  }

  const totalViews = videos.reduce((s, v) => s + (v.view_count || 0), 0);
  const totalLikes = videos.reduce((s, v) => s + (v.like_count || 0), 0);
  const totalComments = videos.reduce((s, v) => s + (v.comment_count || 0), 0);
  const totalShares = videos.reduce((s, v) => s + (v.share_count || 0), 0);
  const engagementRate = totalViews > 0
    ? ((totalLikes + totalComments + totalShares) / totalViews) * 100
    : 0;

  const best = videos[0];
  const worst = videos[videos.length - 1];

  return {
    totalViews,
    totalLikes,
    totalComments,
    totalShares,
    videosPublished: videos.length,
    engagementRate: Math.round(engagementRate * 100) / 100,
    bestVideo: best ? { id: best.id, title: best.title || best.description?.slice(0, 50) || "Untitled", views: best.view_count || 0 } : null,
    worstVideo: worst && videos.length > 1 ? { id: worst.id, title: worst.title || worst.description?.slice(0, 50) || "Untitled", views: worst.view_count || 0 } : null,
  };
}

async function generateAIInsights(
  metrics: WeekMetrics,
  prevMetrics: WeekMetrics
): Promise<AIInsights> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fallbackInsights(metrics);
  }

  const viewsChange = computeChangePct(metrics.totalViews, prevMetrics.totalViews);
  const engChange = computeChangePct(metrics.engagementRate, prevMetrics.engagementRate);

  const prompt = `You are a TikTok content coach reviewing a creator's weekly performance.

THIS WEEK:
- Views: ${metrics.totalViews.toLocaleString()} ${viewsChange !== null ? `(${viewsChange >= 0 ? '+' : ''}${viewsChange.toFixed(1)}% vs last week)` : '(first week)'}
- Likes: ${metrics.totalLikes.toLocaleString()}
- Comments: ${metrics.totalComments.toLocaleString()}
- Shares: ${metrics.totalShares.toLocaleString()}
- Videos Published: ${metrics.videosPublished}
- Engagement Rate: ${metrics.engagementRate.toFixed(2)}% ${engChange !== null ? `(${engChange >= 0 ? '+' : ''}${engChange.toFixed(1)}% vs last week)` : ''}
${metrics.bestVideo ? `- Best Video: "${metrics.bestVideo.title}" (${metrics.bestVideo.views.toLocaleString()} views)` : ''}
${metrics.worstVideo ? `- Lowest Video: "${metrics.worstVideo.title}" (${metrics.worstVideo.views.toLocaleString()} views)` : ''}

LAST WEEK:
- Views: ${prevMetrics.totalViews.toLocaleString()}
- Videos: ${prevMetrics.videosPublished}
- Engagement Rate: ${prevMetrics.engagementRate.toFixed(2)}%

Respond in ONLY valid JSON (no markdown):
{
  "grade": "<A+/A/A-/B+/B/B-/C+/C/C-/D/F based on week-over-week momentum and absolute performance>",
  "summary": "<2-3 sentence personalized performance summary in a friendly, coaching tone>",
  "wins": ["<specific win 1>", "<specific win 2>"],
  "improvements": ["<actionable improvement 1>", "<actionable improvement 2>"],
  "tip": "<one concrete, actionable tip for next week>"
}

Grade guide: A+ = exceptional growth + high engagement, A = strong, B = solid/stable, C = needs attention, D = significant decline, F = no activity.
Be specific and reference the actual numbers. Keep each item under 100 characters.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        temperature: 0.4,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`[report-card] Anthropic ${response.status}`);
      return fallbackInsights(metrics);
    }

    const data = await response.json();
    const textBlock = data.content?.find(
      (b: { type: string; text?: string }) => b.type === "text"
    );
    const raw = (textBlock?.text || "").trim();

    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) {
      return fallbackInsights(metrics);
    }

    const parsed = JSON.parse(raw.substring(firstBrace, lastBrace + 1));

    return {
      grade: parsed.grade || "B",
      summary: parsed.summary || "",
      wins: Array.isArray(parsed.wins) ? parsed.wins.map(String) : [],
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements.map(String) : [],
      tip: parsed.tip || "",
    };
  } catch (err) {
    console.error("[report-card] AI generation failed:", err);
    return fallbackInsights(metrics);
  }
}

function fallbackInsights(metrics: WeekMetrics): AIInsights {
  const grade = metrics.videosPublished === 0 ? "F"
    : metrics.totalViews > 10000 ? "A"
    : metrics.totalViews > 1000 ? "B"
    : "C";

  return {
    grade,
    summary: metrics.videosPublished > 0
      ? `You published ${metrics.videosPublished} video${metrics.videosPublished > 1 ? "s" : ""} this week with ${metrics.totalViews.toLocaleString()} total views.`
      : "No videos published this week. Consistency is key to growth!",
    wins: metrics.bestVideo
      ? [`Your top video "${metrics.bestVideo.title}" hit ${metrics.bestVideo.views.toLocaleString()} views`]
      : [],
    improvements: metrics.videosPublished === 0
      ? ["Try publishing at least 3 videos this week"]
      : ["Focus on hooks that create curiosity in the first 2 seconds"],
    tip: "Post consistently at the same times each day to train the algorithm.",
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

    // This week: last 7 days
    const weekEnd = new Date(now);
    weekEnd.setHours(0, 0, 0, 0);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);

    // Previous week: 7-14 days ago
    const prevWeekEnd = new Date(weekStart);
    const prevWeekStart = new Date(prevWeekEnd);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    console.log(`[report-card] Generating report cards for ${formatDate(weekStart)} to ${formatDate(weekEnd)}`);

    // Get all users who have tiktok_videos
    const { data: userRows } = await supabaseAdmin
      .from("tiktok_videos")
      .select("user_id")
      .gte("create_time", Math.floor(weekStart.getTime() / 1000))
      .lt("create_time", Math.floor(weekEnd.getTime() / 1000));

    const userIds = [...new Set((userRows || []).map((r) => r.user_id))];

    if (userIds.length === 0) {
      console.log("[report-card] No users with videos this week");
      return NextResponse.json({ ok: true, processed: 0, timestamp: now.toISOString() });
    }

    console.log(`[report-card] Processing ${userIds.length} users`);

    let processed = 0;
    let emailsSent = 0;
    const errors: Array<{ user_id: string; error: string }> = [];

    for (const userId of userIds) {
      try {
        // Get metrics for both weeks
        const metrics = await getWeekMetrics(userId, weekStart, weekEnd);
        const prevMetrics = await getWeekMetrics(userId, prevWeekStart, prevWeekEnd);

        // Skip users with no activity
        if (metrics.videosPublished === 0 && metrics.totalViews === 0) continue;

        // Generate AI insights
        const insights = await generateAIInsights(metrics, prevMetrics);

        // Insert report card
        const { error: insertError } = await supabaseAdmin
          .from("content_report_cards")
          .upsert({
            user_id: userId,
            week_start: formatDate(weekStart),
            week_end: formatDate(weekEnd),
            total_views: metrics.totalViews,
            total_likes: metrics.totalLikes,
            total_comments: metrics.totalComments,
            total_shares: metrics.totalShares,
            videos_published: metrics.videosPublished,
            engagement_rate: metrics.engagementRate,
            views_change_pct: computeChangePct(metrics.totalViews, prevMetrics.totalViews),
            likes_change_pct: computeChangePct(metrics.totalLikes, prevMetrics.totalLikes),
            engagement_change_pct: computeChangePct(metrics.engagementRate, prevMetrics.engagementRate),
            videos_change_pct: computeChangePct(metrics.videosPublished, prevMetrics.videosPublished),
            best_video_id: metrics.bestVideo?.id || null,
            best_video_title: metrics.bestVideo?.title || null,
            best_video_views: metrics.bestVideo?.views || null,
            worst_video_id: metrics.worstVideo?.id || null,
            worst_video_title: metrics.worstVideo?.title || null,
            worst_video_views: metrics.worstVideo?.views || null,
            grade: insights.grade,
            ai_summary: insights.summary,
            wins: insights.wins,
            improvements: insights.improvements,
            tip_of_the_week: insights.tip,
            ai_model: "claude-haiku-4-5-20251001",
          }, { onConflict: "user_id,week_start" });

        if (insertError) {
          console.error(`[report-card] Insert failed for ${userId}:`, insertError);
          errors.push({ user_id: userId, error: String(insertError.message) });
          continue;
        }

        processed++;

        // Send email
        try {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
          const email = authUser?.user?.email;

          if (email) {
            const template = reportCardEmails[0];
            const emailData: ReportCardEmailData = {
              userName: authUser?.user?.user_metadata?.full_name || email.split("@")[0],
              weekStart: formatDateDisplay(weekStart),
              weekEnd: formatDateDisplay(weekEnd),
              grade: insights.grade,
              totalViews: metrics.totalViews,
              viewsChangePct: computeChangePct(metrics.totalViews, prevMetrics.totalViews),
              engagementRate: metrics.engagementRate,
              engagementChangePct: computeChangePct(metrics.engagementRate, prevMetrics.engagementRate),
              videosPublished: metrics.videosPublished,
              aiSummary: insights.summary,
              wins: insights.wins,
              improvements: insights.improvements,
              tipOfTheWeek: insights.tip,
            };

            const result = await sendEmailWithAudit(supabaseAdmin, {
              to: email,
              subject: `${template.subject} — Grade: ${insights.grade}`,
              html: template.getHtml(emailData),
              templateKey: "report_card_weekly",
              context: { user_id: userId, grade: insights.grade, week_start: formatDate(weekStart) },
            });

            if (result.status === "sent") emailsSent++;
          }
        } catch (emailErr) {
          console.warn(`[report-card] Email failed for ${userId}:`, emailErr);
        }
      } catch (userErr) {
        console.error(`[report-card] Error for user ${userId}:`, userErr);
        errors.push({ user_id: userId, error: String(userErr) });
      }
    }

    console.log(`[report-card] Done: ${processed} cards, ${emailsSent} emails`);

    return NextResponse.json({
      ok: true,
      processed,
      emails_sent: emailsSent,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error("[cron/weekly-report-card] Fatal error:", err);
    return NextResponse.json({ error: "Report card generation failed" }, { status: 500 });
  }
}
