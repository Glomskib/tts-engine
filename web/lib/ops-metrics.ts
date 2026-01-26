/**
 * ops-metrics.ts
 *
 * Centralized operational metrics computation for queue health,
 * stuck detection, and throughput analysis.
 *
 * Used by observability API endpoints and admin dashboard.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { VIDEO_STATUSES, QUEUE_STATUSES, isQueueStatus } from "./video-pipeline";
import {
  getClaimExpiringSoonMinutes,
  getStuckThresholdHours,
  getActivityStaleHours,
  getThroughputWindowDays,
} from "./settings";

// ============================================================================
// Types
// ============================================================================

export interface QueueHealthMetrics {
  generated_at: string;
  queue_statuses: {
    status: string;
    total: number;
    claimed: number;
    unclaimed: number;
    claim_expiring_soon: number;
  }[];
  totals: {
    total_in_queue: number;
    total_claimed: number;
    total_unclaimed: number;
    total_expiring_soon: number;
  };
  thresholds: {
    claim_expiring_soon_minutes: number;
  };
}

export interface StuckVideo {
  video_id: string;
  status: string;
  stuck_hours: number;
  last_activity_at: string | null;
  claimed_by: string | null;
  claim_expires_at: string | null;
  assigned_to: string | null;
}

export interface StuckMetrics {
  generated_at: string;
  stuck_videos: StuckVideo[];
  totals: {
    total_stuck: number;
    by_status: Record<string, number>;
  };
  thresholds: {
    stuck_threshold_hours: number;
    activity_stale_hours: number;
  };
}

export interface ThroughputMetrics {
  generated_at: string;
  window_days: number;
  daily_throughput: {
    date: string;
    transitions: {
      to_status: string;
      count: number;
    }[];
  }[];
  summary: {
    total_transitions: number;
    avg_per_day: number;
    by_status: Record<string, number>;
  };
}

// ============================================================================
// Queue Health Computation
// ============================================================================

interface VideoForHealth {
  id: string;
  status: string;
  claimed_by: string | null;
  claim_expires_at: string | null;
}

export async function computeQueueHealth(
  supabase: SupabaseClient
): Promise<{ ok: boolean; data?: QueueHealthMetrics; error?: string }> {
  try {
    const now = new Date();
    const claimExpiringSoonMinutes = await getClaimExpiringSoonMinutes();
    const expiringSoonThreshold = new Date(
      now.getTime() + claimExpiringSoonMinutes * 60 * 1000
    ).toISOString();

    // Fetch all videos in queue statuses
    const { data: videos, error: fetchError } = await supabase
      .from("videos")
      .select("id, status, claimed_by, claim_expires_at")
      .in("status", QUEUE_STATUSES);

    if (fetchError) {
      return { ok: false, error: fetchError.message };
    }

    const allVideos = (videos || []) as VideoForHealth[];

    // Compute per-status metrics
    const queueStatuses: QueueHealthMetrics["queue_statuses"] = [];

    for (const status of QUEUE_STATUSES) {
      const statusVideos = allVideos.filter((v) => v.status === status);
      let claimed = 0;
      let unclaimed = 0;
      let expiringSoon = 0;

      for (const video of statusVideos) {
        const hasActiveClaim =
          video.claimed_by &&
          video.claim_expires_at &&
          video.claim_expires_at > now.toISOString();

        if (hasActiveClaim) {
          claimed++;
          // Check if expiring soon
          if (video.claim_expires_at! <= expiringSoonThreshold) {
            expiringSoon++;
          }
        } else {
          unclaimed++;
        }
      }

      queueStatuses.push({
        status,
        total: statusVideos.length,
        claimed,
        unclaimed,
        claim_expiring_soon: expiringSoon,
      });
    }

    // Compute totals
    const totals = queueStatuses.reduce(
      (acc, qs) => ({
        total_in_queue: acc.total_in_queue + qs.total,
        total_claimed: acc.total_claimed + qs.claimed,
        total_unclaimed: acc.total_unclaimed + qs.unclaimed,
        total_expiring_soon: acc.total_expiring_soon + qs.claim_expiring_soon,
      }),
      {
        total_in_queue: 0,
        total_claimed: 0,
        total_unclaimed: 0,
        total_expiring_soon: 0,
      }
    );

    return {
      ok: true,
      data: {
        generated_at: now.toISOString(),
        queue_statuses: queueStatuses,
        totals,
        thresholds: {
          claim_expiring_soon_minutes: claimExpiringSoonMinutes,
        },
      },
    };
  } catch (err) {
    console.error("Error computing queue health:", err);
    return { ok: false, error: String(err) };
  }
}

// ============================================================================
// Stuck Video Detection
// ============================================================================

interface VideoForStuck {
  id: string;
  status: string;
  claimed_by: string | null;
  claim_expires_at: string | null;
  assigned_to: string | null;
  last_status_changed_at: string | null;
  updated_at: string | null;
  created_at: string;
}

export async function computeStuckVideos(
  supabase: SupabaseClient,
  options?: { limit?: number }
): Promise<{ ok: boolean; data?: StuckMetrics; error?: string }> {
  try {
    const now = new Date();
    const stuckThresholdHours = await getStuckThresholdHours();
    const activityStaleHours = await getActivityStaleHours();

    // Calculate stuck threshold timestamp
    const stuckThreshold = new Date(
      now.getTime() - stuckThresholdHours * 60 * 60 * 1000
    ).toISOString();

    // Fetch videos in queue statuses that might be stuck
    // We look at last_status_changed_at or updated_at or created_at
    const { data: videos, error: fetchError } = await supabase
      .from("videos")
      .select(
        "id, status, claimed_by, claim_expires_at, assigned_to, last_status_changed_at, updated_at, created_at"
      )
      .in("status", [...QUEUE_STATUSES, "draft"]);

    if (fetchError) {
      return { ok: false, error: fetchError.message };
    }

    const allVideos = (videos || []) as VideoForStuck[];

    // Find stuck videos
    const stuckVideos: StuckVideo[] = [];
    const byStatus: Record<string, number> = {};

    for (const video of allVideos) {
      // Determine last activity timestamp
      const lastActivity =
        video.last_status_changed_at || video.updated_at || video.created_at;
      const lastActivityDate = new Date(lastActivity);

      // Check if stuck (older than threshold)
      if (lastActivity <= stuckThreshold) {
        const stuckHours = Math.floor(
          (now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60)
        );

        stuckVideos.push({
          video_id: video.id,
          status: video.status,
          stuck_hours: stuckHours,
          last_activity_at: lastActivity,
          claimed_by: video.claimed_by,
          claim_expires_at: video.claim_expires_at,
          assigned_to: video.assigned_to,
        });

        byStatus[video.status] = (byStatus[video.status] || 0) + 1;
      }
    }

    // Sort by stuck hours descending
    stuckVideos.sort((a, b) => b.stuck_hours - a.stuck_hours);

    // Apply limit if specified
    const limitedVideos = options?.limit
      ? stuckVideos.slice(0, options.limit)
      : stuckVideos;

    return {
      ok: true,
      data: {
        generated_at: now.toISOString(),
        stuck_videos: limitedVideos,
        totals: {
          total_stuck: stuckVideos.length,
          by_status: byStatus,
        },
        thresholds: {
          stuck_threshold_hours: stuckThresholdHours,
          activity_stale_hours: activityStaleHours,
        },
      },
    };
  } catch (err) {
    console.error("Error computing stuck videos:", err);
    return { ok: false, error: String(err) };
  }
}

// ============================================================================
// Throughput Computation
// ============================================================================

interface EventRow {
  video_id: string;
  event_type: string;
  to_status: string | null;
  created_at: string;
}

export async function computeThroughput(
  supabase: SupabaseClient,
  options?: { window_days?: number }
): Promise<{ ok: boolean; data?: ThroughputMetrics; error?: string }> {
  try {
    const now = new Date();
    const windowDays = options?.window_days || (await getThroughputWindowDays());

    // Calculate window start
    const windowStart = new Date(
      now.getTime() - windowDays * 24 * 60 * 60 * 1000
    ).toISOString();

    // Fetch status change events within the window
    const { data: events, error: fetchError } = await supabase
      .from("video_events")
      .select("video_id, event_type, to_status, created_at")
      .eq("event_type", "status_change")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: true });

    if (fetchError) {
      return { ok: false, error: fetchError.message };
    }

    const allEvents = (events || []) as EventRow[];

    // Group by day and to_status
    const dailyMap: Record<string, Record<string, number>> = {};
    const statusTotals: Record<string, number> = {};

    for (const event of allEvents) {
      if (!event.to_status) continue;

      const day = event.created_at.split("T")[0];

      if (!dailyMap[day]) {
        dailyMap[day] = {};
      }
      dailyMap[day][event.to_status] =
        (dailyMap[day][event.to_status] || 0) + 1;
      statusTotals[event.to_status] = (statusTotals[event.to_status] || 0) + 1;
    }

    // Build daily throughput array
    const dailyThroughput: ThroughputMetrics["daily_throughput"] = [];

    // Generate all days in window (even if no events)
    for (let i = 0; i < windowDays; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStr = date.toISOString().split("T")[0];
      const dayData = dailyMap[dayStr] || {};

      dailyThroughput.push({
        date: dayStr,
        transitions: Object.entries(dayData).map(([to_status, count]) => ({
          to_status,
          count,
        })),
      });
    }

    // Sort by date ascending
    dailyThroughput.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate totals
    const totalTransitions = Object.values(statusTotals).reduce(
      (sum, n) => sum + n,
      0
    );
    const avgPerDay = totalTransitions / windowDays;

    return {
      ok: true,
      data: {
        generated_at: now.toISOString(),
        window_days: windowDays,
        daily_throughput: dailyThroughput,
        summary: {
          total_transitions: totalTransitions,
          avg_per_day: Math.round(avgPerDay * 100) / 100,
          by_status: statusTotals,
        },
      },
    };
  } catch (err) {
    console.error("Error computing throughput:", err);
    return { ok: false, error: String(err) };
  }
}

// ============================================================================
// Combined Health Check (for monitoring)
// ============================================================================

export interface HealthCheckResult {
  healthy: boolean;
  generated_at: string;
  checks: {
    name: string;
    status: "ok" | "warning" | "critical";
    message: string;
    value?: number;
    threshold?: number;
  }[];
}

export async function performHealthCheck(
  supabase: SupabaseClient
): Promise<{ ok: boolean; data?: HealthCheckResult; error?: string }> {
  try {
    const now = new Date();
    const checks: HealthCheckResult["checks"] = [];
    let hasWarning = false;
    let hasCritical = false;

    // Check 1: Queue health
    const queueResult = await computeQueueHealth(supabase);
    if (queueResult.ok && queueResult.data) {
      const { totals } = queueResult.data;

      // Check for high unclaimed backlog
      if (totals.total_unclaimed > 50) {
        checks.push({
          name: "unclaimed_backlog",
          status: "critical",
          message: `${totals.total_unclaimed} videos unclaimed in queue`,
          value: totals.total_unclaimed,
          threshold: 50,
        });
        hasCritical = true;
      } else if (totals.total_unclaimed > 20) {
        checks.push({
          name: "unclaimed_backlog",
          status: "warning",
          message: `${totals.total_unclaimed} videos unclaimed in queue`,
          value: totals.total_unclaimed,
          threshold: 20,
        });
        hasWarning = true;
      } else {
        checks.push({
          name: "unclaimed_backlog",
          status: "ok",
          message: `${totals.total_unclaimed} videos unclaimed (healthy)`,
          value: totals.total_unclaimed,
        });
      }

      // Check for expiring claims
      if (totals.total_expiring_soon > 10) {
        checks.push({
          name: "expiring_claims",
          status: "warning",
          message: `${totals.total_expiring_soon} claims expiring soon`,
          value: totals.total_expiring_soon,
          threshold: 10,
        });
        hasWarning = true;
      } else {
        checks.push({
          name: "expiring_claims",
          status: "ok",
          message: `${totals.total_expiring_soon} claims expiring soon`,
          value: totals.total_expiring_soon,
        });
      }
    }

    // Check 2: Stuck videos
    const stuckResult = await computeStuckVideos(supabase, { limit: 10 });
    if (stuckResult.ok && stuckResult.data) {
      const { totals } = stuckResult.data;

      if (totals.total_stuck > 10) {
        checks.push({
          name: "stuck_videos",
          status: "critical",
          message: `${totals.total_stuck} videos stuck for ${stuckResult.data.thresholds.stuck_threshold_hours}+ hours`,
          value: totals.total_stuck,
          threshold: 10,
        });
        hasCritical = true;
      } else if (totals.total_stuck > 0) {
        checks.push({
          name: "stuck_videos",
          status: "warning",
          message: `${totals.total_stuck} videos stuck for ${stuckResult.data.thresholds.stuck_threshold_hours}+ hours`,
          value: totals.total_stuck,
          threshold: 0,
        });
        hasWarning = true;
      } else {
        checks.push({
          name: "stuck_videos",
          status: "ok",
          message: "No stuck videos",
          value: 0,
        });
      }
    }

    // Determine overall health
    const healthy = !hasCritical && !hasWarning;

    return {
      ok: true,
      data: {
        healthy,
        generated_at: now.toISOString(),
        checks,
      },
    };
  } catch (err) {
    console.error("Error performing health check:", err);
    return { ok: false, error: String(err) };
  }
}
