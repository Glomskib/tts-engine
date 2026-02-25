/**
 * Client Daily Cap Guard
 *
 * Launch-safety layer that checks whether a client can submit a new video.
 * Extends the existing usage.ts daily cap check with SLA backlog awareness.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUsageToday } from "@/lib/marketplace/usage";
import type { JobStatus } from "@/lib/marketplace/types";

// ── Types ──────────────────────────────────────────────────

export interface CapGuardResult {
  allowed: boolean;
  reason?: string;
}

// ── Backlog thresholds ─────────────────────────────────────

/**
 * If a client has this many or more active (non-terminal) jobs,
 * block new submissions to prevent queue overload at launch.
 */
const MAX_ACTIVE_JOBS_PER_CLIENT = 20;

// ── Core logic ─────────────────────────────────────────────

/**
 * Check whether a client can submit a new video.
 *
 * Checks (in order):
 *   1. Daily cap from plan tier (delegates to existing usage.ts)
 *   2. SLA backlog: active jobs count vs threshold
 */
export async function canSubmitNewVideo(
  clientId: string,
): Promise<CapGuardResult> {
  // 1. Daily cap check (reuses canonical marketplace logic)
  const usage = await getUsageToday(clientId);
  if (usage.remaining_today <= 0) {
    return {
      allowed: false,
      reason: `Daily cap reached: ${usage.used_today}/${usage.daily_cap} videos submitted today (${usage.plan_label} plan). Resets at ${usage.resets_at}.`,
    };
  }

  // 2. SLA backlog check — count active (non-terminal) jobs for this client
  const activeStatuses: JobStatus[] = [
    "queued",
    "claimed",
    "in_progress",
    "submitted",
    "changes_requested",
    "blocked",
  ];

  const { count, error } = await supabaseAdmin
    .from("edit_jobs")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .in("job_status", activeStatuses);

  if (error) {
    // Fail open — don't block submissions on a query error
    console.error("[capGuard] Failed to check backlog:", error.message);
    return { allowed: true };
  }

  const activeJobs = count ?? 0;
  if (activeJobs >= MAX_ACTIVE_JOBS_PER_CLIENT) {
    return {
      allowed: false,
      reason: `SLA backlog limit: ${activeJobs} active jobs in queue (max ${MAX_ACTIVE_JOBS_PER_CLIENT}). Wait for current jobs to complete.`,
    };
  }

  return { allowed: true };
}
