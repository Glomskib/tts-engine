import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getClientToday } from "@/lib/marketplace/types";
import {
  getMpPlanConfig,
  MP_PLAN_CONFIGS,
  type MpPlanTier,
} from "@/lib/marketplace/plan-config";
import { getStalledJobs } from "@/lib/marketplace/queries";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/admin/marketplace/ops
 *
 * Admin-only operational overview of all marketplace clients.
 * Returns per-client data + queue_health, throughput, tier_revenue.
 */
export async function GET(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();
  const auth = await getApiAuthContext(request);

  if (!auth.isAdmin) {
    return createApiErrorResponse(
      "FORBIDDEN",
      "Admin access required",
      403,
      correlationId,
    );
  }

  // 1. Get all clients with their plans
  const { data: clients, error: clientsErr } = await supabaseAdmin
    .from("clients")
    .select(
      `
      id, name, client_code, timezone, created_at,
      client_plans(plan_tier, daily_cap, sla_hours, status, priority_weight, current_period_end, stripe_subscription_id)
    `,
    )
    .order("created_at", { ascending: true });

  if (clientsErr) {
    console.error(`[${correlationId}] ops query error:`, clientsErr);
    return createApiErrorResponse(
      "DB_ERROR",
      "Failed to query clients",
      500,
      correlationId,
    );
  }

  // 2. Get all edit jobs (expanded for queue_health + throughput)
  const { data: allJobs } = await supabaseAdmin
    .from("edit_jobs")
    .select(
      "client_id, job_status, due_at, created_at, approved_at, claimed_at, started_at, submitted_at, claimed_by",
    );

  const jobsByClient = new Map<string, typeof allJobs>();
  for (const j of allJobs || []) {
    const arr = jobsByClient.get(j.client_id) || [];
    arr.push(j);
    jobsByClient.set(j.client_id, arr);
  }

  // 3. Get today's usage for all clients
  const allUsageDates = new Map<string, string>(); // clientId -> today string
  const usageByClient = new Map<string, number>();

  for (const c of clients || []) {
    const today = getClientToday(c.timezone);
    allUsageDates.set(c.id, today);
  }

  // Batch-fetch all usage rows for today's dates
  const uniqueDates = [...new Set(allUsageDates.values())];
  const { data: allUsage } = await supabaseAdmin
    .from("plan_usage_daily")
    .select("client_id, date, submitted_count")
    .in("date", uniqueDates);

  for (const u of allUsage || []) {
    const clientToday = allUsageDates.get(u.client_id);
    if (u.date === clientToday) {
      usageByClient.set(u.client_id, u.submitted_count);
    }
  }

  // 4. Build response rows
  const now = Date.now();
  const d7 = now - 7 * 86_400_000;
  const ACTIVE_STATUSES = new Set([
    "queued",
    "claimed",
    "in_progress",
    "submitted",
    "changes_requested",
  ]);

  const rows = (clients || []).map((c) => {
    const planArr = c.client_plans as unknown as Array<
      Record<string, unknown>
    > | null;
    const plan = planArr && planArr.length > 0 ? planArr[0] : null;
    const tier = (plan?.plan_tier as MpPlanTier) || "pool_15";
    const cfg = getMpPlanConfig(tier);
    const dailyCap = (plan?.daily_cap as number) ?? cfg.daily_cap;
    const usedToday = usageByClient.get(c.id) || 0;
    const planStatus = (plan?.status as string) || "active";

    const jobs = jobsByClient.get(c.id) || [];
    const activeJobs = jobs.filter((j) => ACTIVE_STATUSES.has(j.job_status));
    const overdueJobs = activeJobs.filter(
      (j) => j.due_at && new Date(j.due_at).getTime() < now,
    );

    // Avg turnaround (7d) — jobs approved in last 7 days
    const recentApproved = jobs.filter(
      (j) => j.approved_at && new Date(j.approved_at).getTime() >= d7,
    );
    let avgTurnaround7d: number | null = null;
    if (recentApproved.length > 0) {
      const totalHrs = recentApproved.reduce((sum, j) => {
        return (
          sum +
          (new Date(j.approved_at!).getTime() -
            new Date(j.created_at).getTime()) /
            3_600_000
        );
      }, 0);
      avgTurnaround7d =
        Math.round((totalHrs / recentApproved.length) * 10) / 10;
    }

    // Last activity: most recent job event timestamp
    const lastJobTs =
      jobs.length > 0
        ? jobs.reduce((latest, j) => {
            const ts = j.approved_at || j.created_at;
            return ts > latest ? ts : latest;
          }, jobs[0].created_at)
        : null;

    return {
      client_code: c.client_code,
      tier: cfg.label,
      plan_tier: tier,
      plan_status: planStatus,
      used_today: usedToday,
      daily_cap: dailyCap,
      remaining_today: Math.max(0, dailyCap - usedToday),
      active_jobs: activeJobs.length,
      overdue_jobs: overdueJobs.length,
      avg_turnaround_7d: avgTurnaround7d,
      last_activity: lastJobTs,
      sla_hours: (plan?.sla_hours as number) ?? cfg.sla_hours,
      priority_weight: (plan?.priority_weight as number) ?? cfg.priority_weight,
      has_stripe: !!plan?.stripe_subscription_id,
      current_period_end: plan?.current_period_end ?? null,
    };
  });

  // 5. Stalled job detection
  let stalledJobs: Awaited<ReturnType<typeof getStalledJobs>> = [];
  try {
    stalledJobs = await getStalledJobs();
  } catch {
    /* non-critical */
  }

  // 6. Queue health — aggregate counts from allJobs
  const allJobsArr = allJobs || [];
  const queueHealth = {
    queued: 0,
    claimed: 0,
    in_progress: 0,
    submitted: 0,
    stalled: stalledJobs.length,
    overdue: 0,
  };
  for (const j of allJobsArr) {
    if (j.job_status === "queued") queueHealth.queued++;
    else if (j.job_status === "claimed") queueHealth.claimed++;
    else if (j.job_status === "in_progress") queueHealth.in_progress++;
    else if (j.job_status === "submitted") queueHealth.submitted++;
    if (
      ACTIVE_STATUSES.has(j.job_status) &&
      j.due_at &&
      new Date(j.due_at).getTime() < now
    ) {
      queueHealth.overdue++;
    }
  }

  // 7. Throughput metrics — computed from allJobs (7d/30d windows)
  const d30 = now - 30 * 86_400_000;
  const completed7d = allJobsArr.filter(
    (j) => j.approved_at && new Date(j.approved_at).getTime() >= d7,
  );
  const completed30d = allJobsArr.filter(
    (j) => j.approved_at && new Date(j.approved_at).getTime() >= d30,
  );

  // Avg claim time (created_at → claimed_at) for 7d completed
  const claimTimes7d = completed7d
    .filter((j) => j.claimed_at)
    .map(
      (j) =>
        (new Date(j.claimed_at!).getTime() -
          new Date(j.created_at).getTime()) /
        3_600_000,
    );
  const avgClaimTimeHours =
    claimTimes7d.length > 0
      ? Math.round(
          (claimTimes7d.reduce((a, b) => a + b, 0) / claimTimes7d.length) * 10,
        ) / 10
      : null;

  // Avg submit time (started_at → submitted_at) for 7d completed
  const submitTimes7d = completed7d
    .filter((j) => j.started_at && j.submitted_at)
    .map(
      (j) =>
        (new Date(j.submitted_at!).getTime() -
          new Date(j.started_at!).getTime()) /
        3_600_000,
    );
  const avgSubmitTimeHours =
    submitTimes7d.length > 0
      ? Math.round(
          (submitTimes7d.reduce((a, b) => a + b, 0) / submitTimes7d.length) *
            10,
        ) / 10
      : null;

  // Per-editor throughput
  const editorMap = new Map<
    string,
    {
      completed_7d: number;
      completed_30d: number;
      turnaroundSum: number;
      turnaroundCount: number;
    }
  >();
  for (const j of completed30d) {
    if (!j.claimed_by) continue;
    const entry = editorMap.get(j.claimed_by) || {
      completed_7d: 0,
      completed_30d: 0,
      turnaroundSum: 0,
      turnaroundCount: 0,
    };
    entry.completed_30d++;
    if (j.approved_at && new Date(j.approved_at).getTime() >= d7)
      entry.completed_7d++;
    if (j.claimed_at && j.approved_at) {
      entry.turnaroundSum +=
        (new Date(j.approved_at).getTime() -
          new Date(j.claimed_at).getTime()) /
        3_600_000;
      entry.turnaroundCount++;
    }
    editorMap.set(j.claimed_by, entry);
  }

  // Fetch editor display names
  const editorIds = [...editorMap.keys()];
  const editorNames = new Map<string, string>();
  if (editorIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("mp_profiles")
      .select("id, full_name")
      .in("id", editorIds);
    for (const p of profiles || []) {
      editorNames.set(p.id, p.full_name || p.id.slice(0, 8));
    }
  }

  const jobsPerEditor = editorIds
    .map((eid) => {
      const e = editorMap.get(eid)!;
      return {
        editor_id: eid,
        display_name: editorNames.get(eid) || eid.slice(0, 8),
        completed_7d: e.completed_7d,
        completed_30d: e.completed_30d,
        avg_turnaround_hours:
          e.turnaroundCount > 0
            ? Math.round((e.turnaroundSum / e.turnaroundCount) * 10) / 10
            : null,
      };
    })
    .sort((a, b) => b.completed_7d - a.completed_7d);

  const throughput = {
    avg_claim_time_hours: avgClaimTimeHours,
    avg_submit_time_hours: avgSubmitTimeHours,
    completed_7d: completed7d.length,
    completed_30d: completed30d.length,
    jobs_per_editor: jobsPerEditor,
  };

  // 8. Tier revenue snapshot — computed from existing clients data
  const tierCounts = new Map<MpPlanTier, number>();
  for (const c of clients || []) {
    const planArr = c.client_plans as unknown as Array<
      Record<string, unknown>
    > | null;
    const plan = planArr && planArr.length > 0 ? planArr[0] : null;
    if (!plan || (plan.status as string) !== "active") continue;
    const tier = (plan.plan_tier as MpPlanTier) || "pool_15";
    tierCounts.set(tier, (tierCounts.get(tier) || 0) + 1);
  }

  let totalMrr = 0;
  const tierRevenue = (
    Object.entries(MP_PLAN_CONFIGS) as [
      MpPlanTier,
      (typeof MP_PLAN_CONFIGS)[MpPlanTier],
    ][]
  ).map(([tier, cfg]) => {
    const activeCount = tierCounts.get(tier) || 0;
    const monthlyRevenue = activeCount * cfg.price_usd;
    totalMrr += monthlyRevenue;
    return {
      tier,
      label: cfg.label,
      active_count: activeCount,
      price_usd: cfg.price_usd,
      monthly_revenue: monthlyRevenue,
    };
  });

  return NextResponse.json({
    ok: true,
    data: rows,
    total_clients: rows.length,
    total_active_jobs: rows.reduce((s, r) => s + r.active_jobs, 0),
    total_overdue: rows.reduce((s, r) => s + r.overdue_jobs, 0),
    stalled_jobs: stalledJobs,
    total_stalled: stalledJobs.length,
    queue_health: queueHealth,
    throughput,
    tier_revenue: { tiers: tierRevenue, total_mrr: totalMrr },
  });
}
