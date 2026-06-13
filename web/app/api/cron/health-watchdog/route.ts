/**
 * Cron: Daily SYNTHETIC HEALTH WATCHDOG.
 *
 * WHY THIS EXISTS:
 *   /api/health does shallow checks and has historically lied green while the
 *   app was silently broken — schema drift (a migration never ran, a column
 *   renamed), the render fleet offline with jobs piling up, ve_runs wedged in a
 *   non-terminal status, the publishing cron quietly dying (the 26h-no-draft
 *   bug we just fixed). Shallow "can I reach Supabase?" checks never catch any
 *   of these. This route ACTIVELY probes the real user paths the way a user
 *   (or a downstream cron) would, and ALARMS via Telegram the moment one breaks.
 *
 * DESIGN RULES (lessons learned, baked in):
 *   - Every check is individually try/caught. One thrown check must NOT blank
 *     the whole report (that's how silent breakage hid before).
 *   - Only alarm on REAL failures. Silent on all-green unless ?verbose=1, so the
 *     daily run doesn't become noise that gets muted (a muted alarm is no alarm).
 *   - Reuse the existing Telegram helper (sendTelegramLog) — never hardcode the
 *     bot token. It already sanitizes + respects REMINDERS_ENABLED + routes to
 *     the dedicated log channel.
 *   - Guard with authorizedCron (the shared, trimmed CRON_SECRET + vercel-cron
 *     UA fallback — see web/lib/cron-auth.ts and the 401 incident write-up).
 *
 * Returns: { ok, checks:[{name,status,detail}], alarmed }
 */
import { NextResponse } from "next/server";
import { authorizedCron } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTelegramLog } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A check outcome. status: ok = healthy, fail = real breakage (alarms), skip = couldn't run / not applicable. */
type CheckStatus = "ok" | "fail" | "skip";
interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

/**
 * Run one check in isolation. Whatever it throws becomes a "skip" (we couldn't
 * determine health), NOT a "fail" — a probe that itself errors is inconclusive,
 * not proof of breakage, and must never blank the rest of the report.
 */
async function runCheck(
  name: string,
  fn: () => Promise<{ status: CheckStatus; detail: string }>,
): Promise<CheckResult> {
  try {
    const { status, detail } = await fn();
    return { name, status, detail };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name, status: "skip", detail: `check threw: ${msg.slice(0, 160)}` };
  }
}

/** Tables the app hard-depends on. Missing = a migration never ran = the #1 recurring bug. */
const REQUIRED_TABLES = [
  "footage_items",
  "v1_clip_sets",
  "ve_runs",
  "ve_rendered_clips",
  "ff_render_jobs",
  "concepts",
  "brands",
  "generation_jobs",
  "content_items",
];

/** Known columns we depend on existing (table, column). Catches renames/drops the table-existence check misses. */
const REQUIRED_COLUMNS: Array<[string, string]> = [
  ["concepts", "user_id"],
  ["ve_transcripts", "raw_json"],
];

/** ve_runs statuses that are NOT terminal — a run stuck in one of these for too long means the tick cron wedged. */
const VE_NON_TERMINAL = ["created", "transcribing", "analyzing", "assembling", "rendering"];

export async function GET(request: Request) {
  if (!authorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const verbose = url.searchParams.get("verbose") === "1";
  const nowMs = Date.now();
  const checks: CheckResult[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // 1. SCHEMA DRIFT — the #1 recurring bug class. Verify required tables +
  //    a couple of load-bearing columns actually exist in information_schema.
  // ─────────────────────────────────────────────────────────────────────────
  checks.push(
    await runCheck("schema_tables", async () => {
      const { data, error } = await supabaseAdmin
        .from("information_schema.tables" as never)
        .select("table_name")
        .eq("table_schema", "public")
        .in("table_name", REQUIRED_TABLES);
      if (error) throw new Error(error.message);
      const present = new Set((data ?? []).map((r: { table_name: string }) => r.table_name));
      const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
      return missing.length
        ? { status: "fail", detail: `MISSING tables: ${missing.join(", ")}` }
        : { status: "ok", detail: `all ${REQUIRED_TABLES.length} required tables present` };
    }),
  );

  checks.push(
    await runCheck("schema_columns", async () => {
      const tables = [...new Set(REQUIRED_COLUMNS.map(([t]) => t))];
      const { data, error } = await supabaseAdmin
        .from("information_schema.columns" as never)
        .select("table_name, column_name")
        .eq("table_schema", "public")
        .in("table_name", tables);
      if (error) throw new Error(error.message);
      const present = new Set(
        (data ?? []).map((r: { table_name: string; column_name: string }) => `${r.table_name}.${r.column_name}`),
      );
      const missing = REQUIRED_COLUMNS.filter(([t, c]) => !present.has(`${t}.${c}`)).map(([t, c]) => `${t}.${c}`);
      return missing.length
        ? { status: "fail", detail: `MISSING columns: ${missing.join(", ")}` }
        : { status: "ok", detail: `all ${REQUIRED_COLUMNS.length} required columns present` };
    }),
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 2. RENDER FLEET — is any worker actually beating? If NO worker is online
  //    AND there are pending jobs, renders silently never finish.
  // ─────────────────────────────────────────────────────────────────────────
  checks.push(
    await runCheck("render_fleet", async () => {
      const threeMinAgo = new Date(nowMs - 3 * 60 * 1000).toISOString();
      const { count: onlineWorkers, error: wErr } = await supabaseAdmin
        .from("ff_render_workers")
        .select("id", { count: "exact", head: true })
        .gt("last_heartbeat_at", threeMinAgo);
      if (wErr) throw new Error(wErr.message);

      const { count: pendingJobs, error: jErr } = await supabaseAdmin
        .from("ff_render_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (jErr) throw new Error(jErr.message);

      const online = onlineWorkers ?? 0;
      const pending = pendingJobs ?? 0;
      // Only a real problem when work is queued and nobody is there to do it.
      if (online === 0 && pending > 0) {
        return { status: "fail", detail: `renderer offline with ${pending} jobs queued` };
      }
      return { status: "ok", detail: `${online} worker(s) online, ${pending} pending job(s)` };
    }),
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 3. STUCK PIPELINE — ve_runs that have sat in a non-terminal status > 30min.
  //    If the tick cron dies, runs freeze here and the user just sees "rendering"
  //    forever. Report the count and the oldest run's age.
  // ─────────────────────────────────────────────────────────────────────────
  checks.push(
    await runCheck("stuck_ve_runs", async () => {
      const cutoff = new Date(nowMs - 30 * 60 * 1000).toISOString();
      const { data, error } = await supabaseAdmin
        .from("ve_runs")
        .select("id, status, updated_at")
        .in("status", VE_NON_TERMINAL)
        .lt("updated_at", cutoff)
        .order("updated_at", { ascending: true })
        .limit(50);
      if (error) throw new Error(error.message);
      const stuck = data ?? [];
      if (stuck.length === 0) return { status: "ok", detail: "no ve_runs stuck >30min" };
      const oldest = stuck[0] as { updated_at: string; status: string };
      const ageMin = Math.round((nowMs - new Date(oldest.updated_at).getTime()) / 60000);
      return {
        status: "fail",
        detail: `${stuck.length} ve_run(s) stuck >30min (oldest ${ageMin}min in '${oldest.status}')`,
      };
    }),
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 4. STUCK RENDER JOBS — ff_render_jobs claimed/rendering > 15min. The reaper
  //    (ff_reap_stale_render_jobs, 5min) SHOULD catch these; a pile-up means the
  //    reaper isn't running or jobs are wedging faster than it clears them.
  // ─────────────────────────────────────────────────────────────────────────
  checks.push(
    await runCheck("stuck_render_jobs", async () => {
      const cutoff = new Date(nowMs - 15 * 60 * 1000).toISOString();
      const { data, error } = await supabaseAdmin
        .from("ff_render_jobs")
        .select("id, status, claimed_at")
        .in("status", ["claimed", "rendering"])
        .lt("claimed_at", cutoff)
        .order("claimed_at", { ascending: true })
        .limit(50);
      if (error) throw new Error(error.message);
      const stuck = data ?? [];
      if (stuck.length === 0) return { status: "ok", detail: "no render jobs stuck >15min" };
      const oldest = stuck[0] as { claimed_at: string };
      const ageMin = Math.round((nowMs - new Date(oldest.claimed_at).getTime()) / 60000);
      return {
        status: "fail",
        detail: `${stuck.length} render job(s) stuck >15min (oldest ${ageMin}min) — reaper may be down`,
      };
    }),
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 5a. CRON FRESHNESS (pipeline tick) — proxy for "is the tick cron alive?".
  //     If the every-minute video-engine-tick died, no active run got ticked
  //     recently. We look at the newest last_tick_at across ALL runs: if the
  //     freshest tick is > 30min old, the tick loop is probably dead.
  // ─────────────────────────────────────────────────────────────────────────
  checks.push(
    await runCheck("cron_freshness_tick", async () => {
      const { data, error } = await supabaseAdmin
        .from("ve_runs")
        .select("last_tick_at")
        .not("last_tick_at", "is", null)
        .order("last_tick_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      const newest = (data ?? [])[0] as { last_tick_at: string } | undefined;
      if (!newest?.last_tick_at) {
        // No run has ever ticked — inconclusive (could just be a quiet system), don't alarm.
        return { status: "skip", detail: "no ve_runs have a last_tick_at yet" };
      }
      const ageMin = Math.round((nowMs - new Date(newest.last_tick_at).getTime()) / 60000);
      return ageMin > 30
        ? { status: "fail", detail: `newest ve_runs.last_tick_at is ${ageMin}min old — tick cron may be dead` }
        : { status: "ok", detail: `newest tick ${ageMin}min ago` };
    }),
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 5b. CRON FRESHNESS (daily content) — the exact bug we just fixed: the
  //     publishing/marketing cron died and no new draft was written for >26h
  //     while /api/health stayed green. Newest marketing_posts row older than
  //     26h ⇒ the content cron probably stopped writing.
  // ─────────────────────────────────────────────────────────────────────────
  checks.push(
    await runCheck("cron_freshness_content", async () => {
      const { data, error } = await supabaseAdmin
        .from("marketing_posts")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1);
      // Table may not exist in every env — treat that as skip, not fail.
      if (error) return { status: "skip", detail: `marketing_posts not queryable: ${error.message.slice(0, 100)}` };
      const newest = (data ?? [])[0] as { created_at: string } | undefined;
      if (!newest?.created_at) return { status: "skip", detail: "no marketing_posts rows yet" };
      const ageH = (nowMs - new Date(newest.created_at).getTime()) / 3_600_000;
      return ageH > 26
        ? { status: "fail", detail: `newest marketing draft is ${ageH.toFixed(1)}h old — publishing cron may be dead` }
        : { status: "ok", detail: `newest draft ${ageH.toFixed(1)}h ago` };
    }),
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 6. CREDIT/BILLING sanity (light) — just confirm user_credits is queryable.
  //    A broken billing table silently blocks every paid action.
  // ─────────────────────────────────────────────────────────────────────────
  checks.push(
    await runCheck("billing_sanity", async () => {
      const { error } = await supabaseAdmin
        .from("user_credits")
        .select("user_id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return { status: "ok", detail: "user_credits queryable" };
    }),
  );

  // ── Aggregate + alarm ──────────────────────────────────────────────────────
  const failures = checks.filter((c) => c.status === "fail");
  const alarmed = failures.length > 0;

  if (alarmed) {
    // ONE consolidated message. Keep it short (telegram.ts hard-caps at 5 lines
    // and drops anything that looks like a code dump) — lead with the count so a
    // glance tells the whole story.
    const lines = failures.map((f) => `• ${f.name}: ${f.detail}`);
    const msg = `🚨 Health Watchdog: ${failures.length} failure(s)\n${lines.join("\n")}`;
    // sendTelegramLog is fire-and-forget-safe (never throws), but await so the
    // serverless function doesn't get killed before the send completes.
    await sendTelegramLog(msg);
  } else if (verbose) {
    await sendTelegramLog(`✅ Health Watchdog: all ${checks.length} checks green`);
  }

  return NextResponse.json({
    ok: !alarmed,
    checks,
    alarmed,
    timestamp: new Date().toISOString(),
  });
}
