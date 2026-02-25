/**
 * Job Health Detection
 *
 * Detects stalled/overdue jobs based on SLA windows and status age.
 * Used by /api/admin/job-health to surface operational issues.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMpPlanConfig, type MpPlanTier } from "@/lib/marketplace/plan-config";
import type { JobStatus } from "@/lib/marketplace/types";

// ── Thresholds ─────────────────────────────────────────────

/** Max hours a job can sit in_progress before it's considered stalled */
const IN_PROGRESS_STALL_HOURS = 24;

/** Max hours a job can sit in submitted (awaiting review) before warning */
const AWAITING_REVIEW_STALL_HOURS = 12;

// ── Types ──────────────────────────────────────────────────

export type HealthStatus = "healthy" | "warning" | "critical";

export interface JobHealthFlag {
  job_id: string;
  health_status: HealthStatus;
  reason: string;
  sla_hours_remaining: number | null;
}

export interface JobHealthSummary {
  stalled_jobs: number;
  overdue_jobs: number;
  avg_queue_time_hours: number | null;
  flags: JobHealthFlag[];
}

// ── Core logic ─────────────────────────────────────────────

function hoursAgo(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / 3_600_000;
}

function slaHoursRemaining(dueAt: string | null): number | null {
  if (!dueAt) return null;
  return (new Date(dueAt).getTime() - Date.now()) / 3_600_000;
}

/**
 * Evaluate health for a single job row.
 */
function evaluateJobHealth(row: {
  id: string;
  job_status: JobStatus;
  created_at: string;
  started_at: string | null;
  submitted_at: string | null;
  due_at: string | null;
  plan_tier: MpPlanTier | null;
}): JobHealthFlag {
  const remaining = slaHoursRemaining(row.due_at);

  // 1. Overdue: past SLA deadline
  if (remaining !== null && remaining < 0) {
    return {
      job_id: row.id,
      health_status: "critical",
      reason: `Overdue by ${Math.abs(Math.round(remaining))}h (past SLA deadline)`,
      sla_hours_remaining: Math.round(remaining),
    };
  }

  // 2. In-progress stall: editing for > 24h
  if (row.job_status === "in_progress" && row.started_at) {
    const editHours = hoursAgo(row.started_at);
    if (editHours > IN_PROGRESS_STALL_HOURS) {
      return {
        job_id: row.id,
        health_status: "critical",
        reason: `In-progress for ${Math.round(editHours)}h (>${IN_PROGRESS_STALL_HOURS}h threshold)`,
        sla_hours_remaining: remaining !== null ? Math.round(remaining) : null,
      };
    }
  }

  // 3. Awaiting review stall: submitted > 12h
  if (row.job_status === "submitted" && row.submitted_at) {
    const reviewHours = hoursAgo(row.submitted_at);
    if (reviewHours > AWAITING_REVIEW_STALL_HOURS) {
      return {
        job_id: row.id,
        health_status: "warning",
        reason: `Awaiting review for ${Math.round(reviewHours)}h (>${AWAITING_REVIEW_STALL_HOURS}h threshold)`,
        sla_hours_remaining: remaining !== null ? Math.round(remaining) : null,
      };
    }
  }

  // 4. Queued stall: queued longer than SLA window
  if (row.job_status === "queued") {
    const tier = row.plan_tier ?? "pool_15";
    const cfg = getMpPlanConfig(tier as MpPlanTier);
    const queueHours = hoursAgo(row.created_at);
    if (queueHours > cfg.sla_hours) {
      return {
        job_id: row.id,
        health_status: "critical",
        reason: `Queued for ${Math.round(queueHours)}h (SLA window: ${cfg.sla_hours}h)`,
        sla_hours_remaining: remaining !== null ? Math.round(remaining) : null,
      };
    }
    // Warning at 75% of SLA window
    if (queueHours > cfg.sla_hours * 0.75) {
      return {
        job_id: row.id,
        health_status: "warning",
        reason: `Queued for ${Math.round(queueHours)}h (75% of ${cfg.sla_hours}h SLA)`,
        sla_hours_remaining: remaining !== null ? Math.round(remaining) : null,
      };
    }
  }

  return {
    job_id: row.id,
    health_status: "healthy",
    reason: "On track",
    sla_hours_remaining: remaining !== null ? Math.round(remaining) : null,
  };
}

// ── Public API ─────────────────────────────────────────────

/**
 * Aggregate job health across all active (non-terminal) jobs.
 */
export async function getJobHealthSummary(): Promise<JobHealthSummary> {
  const activeStatuses: JobStatus[] = [
    "queued", "claimed", "in_progress", "submitted", "changes_requested",
  ];

  // Fetch active jobs + their client's plan tier via two queries
  // (avoids Supabase join type inference issues)
  const { data: jobs, error } = await supabaseAdmin
    .from("edit_jobs")
    .select("id, client_id, job_status, created_at, started_at, submitted_at, due_at")
    .in("job_status", activeStatuses);

  if (error) {
    throw new Error(`Failed to fetch jobs: ${error.message}`);
  }

  // Build client_id → plan_tier lookup
  const clientIds = [...new Set((jobs ?? []).map((j) => j.client_id as string))];
  const tierMap = new Map<string, MpPlanTier>();

  if (clientIds.length > 0) {
    const { data: plans } = await supabaseAdmin
      .from("client_plans")
      .select("client_id, plan_tier")
      .in("client_id", clientIds);

    for (const p of plans ?? []) {
      tierMap.set(p.client_id as string, p.plan_tier as MpPlanTier);
    }
  }

  const rows = (jobs ?? []).map((j) => ({
    id: j.id as string,
    job_status: j.job_status as JobStatus,
    created_at: j.created_at as string,
    started_at: j.started_at as string | null,
    submitted_at: j.submitted_at as string | null,
    due_at: j.due_at as string | null,
    plan_tier: tierMap.get(j.client_id as string) ?? null,
  }));

  const flags = rows.map(evaluateJobHealth);

  const stalledFlags = flags.filter(
    (f) => f.health_status === "warning" || f.health_status === "critical"
  );
  const overdueFlags = flags.filter(
    (f) => f.sla_hours_remaining !== null && f.sla_hours_remaining < 0
  );

  // Avg queue time for currently-queued jobs
  const queuedRows = rows.filter((r) => r.job_status === "queued");
  const avgQueueTime =
    queuedRows.length > 0
      ? queuedRows.reduce((sum, r) => sum + hoursAgo(r.created_at), 0) / queuedRows.length
      : null;

  return {
    stalled_jobs: stalledFlags.length,
    overdue_jobs: overdueFlags.length,
    avg_queue_time_hours: avgQueueTime !== null ? Math.round(avgQueueTime * 10) / 10 : null,
    flags: stalledFlags, // Only return non-healthy flags to keep payload lean
  };
}
