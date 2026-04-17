/**
 * Cron: Daily Telegram Digest — 9 AM ET
 *
 * Full-picture morning brief:
 *   Section 1 — Money: in / out / net (last 24h)
 *   Section 2 — Your plate: urgent operator-feed items needing action
 *   Section 3 — Agents: who's working, who's idle, cost yesterday
 *   Section 4 — Tasks: shipped / stuck / needing you
 *   Section 5 — Video pipeline: rendered / awaiting / posted
 *   Section 6 — Credits: Runway + HeyGen remaining
 *
 * All sections are best-effort — a missing table just omits that section.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTelegramLog, remindersEnabled, sanitizeTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 30;

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfTodayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function yesterdayIso(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Section builders (each returns lines or []) ──────────────────────────────

async function moneySection(): Promise<string[]> {
  try {
    const todayStart = startOfTodayUtc();
    const { data } = await supabaseAdmin
      .from("finance_transactions")
      .select("direction, amount_cents")
      .gte("occurred_at", yesterdayIso());
    if (!data || data.length === 0) return [];
    let inCents = 0, outCents = 0;
    for (const tx of data as Array<{ direction: string; amount_cents: number }>) {
      if (tx.direction === "in") inCents += tx.amount_cents || 0;
      else if (tx.direction === "out") outCents += tx.amount_cents || 0;
    }
    const net = inCents - outCents;
    const netEmoji = net >= 0 ? "🟢" : "🔴";
    return [
      "<b>Money (24h)</b>",
      `  💰 In: ${fmtUsd(inCents)}  |  Out: ${fmtUsd(outCents)}`,
      `  ${netEmoji} Net: ${fmtUsd(net)}`,
    ];
  } catch { return []; }
}

async function plateSection(): Promise<string[]> {
  try {
    const nowIso = new Date().toISOString();
    const { data } = await supabaseAdmin
      .from("mc_operator_feed")
      .select("title, urgency, kind")
      .is("dismissed_at", null)
      .is("acted_at", null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(10);
    const items = (data || []) as Array<{ title: string; urgency: string; kind: string }>;
    if (items.length === 0) return [];
    const urgent = items.filter((i) => i.urgency === "urgent" || i.urgency === "high");
    const lines = [`<b>On Your Plate (${items.length} items)</b>`];
    const show = urgent.length > 0 ? urgent : items.slice(0, 3);
    for (const item of show.slice(0, 5)) {
      const badge = item.urgency === "urgent" ? "🔴" : item.urgency === "high" ? "🟠" : "▪️";
      lines.push(`  ${badge} ${item.title}`);
    }
    if (items.length > show.length) {
      lines.push(`  ... +${items.length - show.length} more`);
    }
    return lines;
  } catch { return []; }
}

async function agentSection(): Promise<string[]> {
  try {
    const yday = yesterdayIso();
    const { data } = await supabaseAdmin
      .from("agent_runs")
      .select("agent_id, status, cost_usd")
      .gte("started_at", yday);
    if (!data || data.length === 0) return [];
    const agents = new Map<string, { runs: number; ok: number; fail: number; cost: number }>();
    for (const r of data as Array<{ agent_id: string; status: string; cost_usd: number | null }>) {
      const a = agents.get(r.agent_id) || { runs: 0, ok: 0, fail: 0, cost: 0 };
      a.runs++;
      if (r.status === "ok" || r.status === "completed") a.ok++;
      else if (r.status === "error" || r.status === "failed") a.fail++;
      a.cost += Number(r.cost_usd || 0);
      agents.set(r.agent_id, a);
    }
    const lines = [`<b>Agents (24h)</b>`];
    const sorted = [...agents.entries()].sort((a, b) => b[1].runs - a[1].runs);
    for (const [id, s] of sorted.slice(0, 5)) {
      const emoji = s.fail === 0 ? "🟢" : s.fail > s.ok ? "🔴" : "🟡";
      lines.push(`  ${emoji} ${id}: ${s.runs} runs, $${s.cost.toFixed(2)}`);
    }
    if (sorted.length > 5) lines.push(`  ... +${sorted.length - 5} more agents`);
    return lines;
  } catch { return []; }
}

async function taskSection(): Promise<string[]> {
  try {
    const yday = yesterdayIso();
    const lines: string[] = [];

    // Shipped
    const { count: shipped } = await supabaseAdmin
      .from("project_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "done")
      .gte("completed_at", yday);

    // In flight
    const { count: inFlight } = await supabaseAdmin
      .from("project_tasks")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "active"]);

    // Needing you
    const { count: needsYou } = await supabaseAdmin
      .from("project_tasks")
      .select("id", { count: "exact", head: true })
      .or("requires_human_review.eq.true,status.eq.blocked");

    const s = shipped ?? 0;
    const f = inFlight ?? 0;
    const n = needsYou ?? 0;
    if (s + f + n === 0) return [];

    lines.push("<b>Tasks</b>");
    lines.push(`  ✅ Shipped (24h): ${s}  |  🔄 In flight: ${f}`);
    if (n > 0) lines.push(`  👆 <b>${n} need${n > 1 ? "" : "s"} your attention</b>`);
    return lines;
  } catch { return []; }
}

async function videoPipelineSection(): Promise<string[]> {
  try {
    const yday = yesterdayIso();

    const [rendered, awaiting, approved, posted, failed, pipeline] = await Promise.all([
      supabaseAdmin.from("video_events").select("id", { count: "exact", head: true })
        .eq("to_status", "READY_FOR_REVIEW").gte("created_at", yday).then(r => r.count ?? 0),
      supabaseAdmin.from("videos").select("id", { count: "exact", head: true })
        .eq("recording_status", "READY_FOR_REVIEW").then(r => r.count ?? 0),
      supabaseAdmin.from("video_events").select("id", { count: "exact", head: true })
        .eq("event_type", "admin_review_approve").gte("created_at", yday).then(r => r.count ?? 0),
      supabaseAdmin.from("video_events").select("id", { count: "exact", head: true })
        .eq("to_status", "POSTED").gte("created_at", yday).then(r => r.count ?? 0),
      supabaseAdmin.from("video_events").select("id", { count: "exact", head: true })
        .in("event_type", ["render_failed", "compose_failed"]).gte("created_at", yday).then(r => r.count ?? 0),
      supabaseAdmin.from("videos").select("id", { count: "exact", head: true })
        .not("recording_status", "in", '("POSTED","REJECTED")').then(r => r.count ?? 0),
    ]);

    if (rendered + awaiting + approved + posted + failed + pipeline === 0) return [];

    const healthEmoji = failed === 0 ? "🟢" : failed <= 2 ? "🟡" : "🔴";
    const lines = [
      "<b>Video Pipeline</b>",
      `  🎬 Rendered: ${rendered}  |  ✅ Approved: ${approved}  |  📱 Posted: ${posted}`,
    ];
    if (awaiting > 0) lines.push(`  👀 Review queue: <b>${awaiting}</b>`);
    if (failed > 0) lines.push(`  ${healthEmoji} Failures: ${failed}`);
    if (pipeline > 0) lines.push(`  📦 In pipeline: ${pipeline}`);
    return lines;
  } catch { return []; }
}

async function creditsSection(): Promise<string[]> {
  try {
    const { data: settings } = await supabaseAdmin
      .from("system_settings")
      .select("key, value")
      .in("key", ["runway_credits_remaining", "heygen_credits_remaining"]);
    if (!settings || settings.length === 0) return [];
    let runway = "?", heygen = "?";
    for (const s of settings) {
      if (s.key === "runway_credits_remaining") runway = String(s.value);
      if (s.key === "heygen_credits_remaining") heygen = String(s.value);
    }
    return [`<b>Credits</b>  🎥 Runway: ${runway}  |  🗣 HeyGen: ${heygen}`];
  } catch { return []; }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry_run") === "true";

  if (!remindersEnabled() && !dryRun) {
    return NextResponse.json({ ok: true, skipped: true, reason: "REMINDERS_ENABLED=false" });
  }

  try {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    // Build all sections in parallel
    const [money, plate, agents, tasks, video, credits] = await Promise.all([
      moneySection(),
      plateSection(),
      agentSection(),
      taskSection(),
      videoPipelineSection(),
      creditsSection(),
    ]);

    // Assemble only non-empty sections
    const sections = [money, plate, agents, tasks, video, credits].filter((s) => s.length > 0);

    if (sections.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no_activity" });
    }

    const lines = [`<b>📊 Morning Brief — ${dateStr}</b>`];
    for (const section of sections) {
      lines.push("", ...section);
    }

    // Closing link to dashboard
    lines.push("", "→ flashflowai.com/admin/command-center");

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
      sections_sent: sections.length,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error("[cron/daily-digest] Failed:", err);
    return NextResponse.json({ error: "Digest failed" }, { status: 500 });
  }
}
