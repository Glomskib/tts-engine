/**
 * Launch Metrics Snapshot
 *
 * Single-call aggregation of key operational metrics for launch monitoring.
 * Exposed via /api/admin/launch-snapshot.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { JobStatus } from "@/lib/marketplace/types";

// ── Types ──────────────────────────────────────────────────

export interface LaunchSnapshot {
  active_clients: number;
  jobs_today: number;
  avg_turnaround_hours: number | null;
  editors_active: number;
  queue_depth: number;
  generated_at: string;
}

// ── Helpers ────────────────────────────────────────────────

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Core logic ─────────────────────────────────────────────

/**
 * Build a point-in-time snapshot of launch operations.
 *
 * All queries run in parallel for speed.
 */
export async function getLaunchSnapshot(): Promise<LaunchSnapshot> {
  const today = todayUTC();

  const [
    activeClientsRes,
    jobsTodayRes,
    turnaroundRes,
    editorsRes,
    queueRes,
  ] = await Promise.all([
    // 1. Active clients: clients with at least one non-terminal job
    supabaseAdmin
      .from("edit_jobs")
      .select("client_id", { count: "exact", head: false })
      .in("job_status", [
        "queued", "claimed", "in_progress", "submitted", "changes_requested",
      ] satisfies JobStatus[]),

    // 2. Jobs created today
    supabaseAdmin
      .from("edit_jobs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${today}T00:00:00Z`),

    // 3. Avg turnaround: approved/posted jobs in last 7 days (created_at → approved_at)
    supabaseAdmin
      .from("edit_jobs")
      .select("created_at, approved_at")
      .in("job_status", ["approved", "posted"] satisfies JobStatus[])
      .not("approved_at", "is", null)
      .gte("approved_at", new Date(Date.now() - 7 * 24 * 3_600_000).toISOString()),

    // 4. Active editors: distinct claimed_by in last 7 days
    supabaseAdmin
      .from("edit_jobs")
      .select("claimed_by")
      .not("claimed_by", "is", null)
      .gte("claimed_at", new Date(Date.now() - 7 * 24 * 3_600_000).toISOString()),

    // 5. Queue depth: jobs currently queued
    supabaseAdmin
      .from("edit_jobs")
      .select("id", { count: "exact", head: true })
      .eq("job_status", "queued" satisfies JobStatus),
  ]);

  // Active clients = distinct client_ids with active jobs
  const activeClientIds = new Set(
    (activeClientsRes.data ?? []).map((r) => r.client_id as string),
  );

  // Turnaround calculation
  let avgTurnaround: number | null = null;
  const turnaroundJobs = turnaroundRes.data ?? [];
  if (turnaroundJobs.length > 0) {
    const totalHours = turnaroundJobs.reduce((sum, j) => {
      const hours =
        (new Date(j.approved_at as string).getTime() -
          new Date(j.created_at as string).getTime()) /
        3_600_000;
      return sum + hours;
    }, 0);
    avgTurnaround = Math.round((totalHours / turnaroundJobs.length) * 10) / 10;
  }

  // Active editors = distinct claimed_by values
  const editorIds = new Set(
    (editorsRes.data ?? []).map((r) => r.claimed_by as string),
  );

  return {
    active_clients: activeClientIds.size,
    jobs_today: jobsTodayRes.count ?? 0,
    avg_turnaround_hours: avgTurnaround,
    editors_active: editorIds.size,
    queue_depth: queueRes.count ?? 0,
    generated_at: new Date().toISOString(),
  };
}
