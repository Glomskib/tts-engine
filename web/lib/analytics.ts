/**
 * Analytics Module
 * Computes SLA metrics, throughput, and productivity from video_events.
 * No migrations required - uses existing events table.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Stage transitions we track for SLA
const STAGE_TRANSITIONS = [
  { from: "NOT_RECORDED", to: "RECORDED", label: "recording" },
  { from: "RECORDED", to: "EDITED", label: "editing" },
  { from: "EDITED", to: "READY_TO_POST", label: "post_prep" },
  { from: "READY_TO_POST", to: "POSTED", label: "posting" },
] as const;

export type StageName = typeof STAGE_TRANSITIONS[number]["label"];

export interface StageStats {
  stage: StageName;
  from_status: string;
  to_status: string;
  count: number;
  avg_minutes: number;
  median_minutes: number;
  p90_minutes: number;
}

export interface ThroughputDay {
  date: string;
  recorded: number;
  edited: number;
  ready_to_post: number;
  posted: number;
}

export interface UserProductivity {
  user_id: string;
  email: string | null;
  role: string;
  completed: number;
  last_active_at: string | null;
}

export interface AnalyticsSummary {
  window_days: number;
  computed_at: string;
  stage_stats: StageStats[];
  throughput_by_day: ThroughputDay[];
  productivity: UserProductivity[];
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(index, sortedArr.length - 1))];
}

/**
 * Calculate average from array
 */
function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Compute stage duration stats from status transition events.
 * Uses video_events with event_type containing status transitions.
 */
export async function computeStageStats(windowDays: number): Promise<StageStats[]> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const results: StageStats[] = [];

  try {
    // Fetch all status-change events within window
    const { data: events, error } = await supabaseAdmin
      .from("video_events")
      .select("video_id, event_type, from_status, to_status, created_at, details")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching events for stage stats:", error);
      return results;
    }

    if (!events || events.length === 0) {
      // Return empty stats for each stage
      return STAGE_TRANSITIONS.map(t => ({
        stage: t.label,
        from_status: t.from,
        to_status: t.to,
        count: 0,
        avg_minutes: 0,
        median_minutes: 0,
        p90_minutes: 0,
      }));
    }

    // Build timeline per video
    const videoTimelines: Map<string, { status: string; timestamp: string }[]> = new Map();

    for (const event of events) {
      if (!event.video_id) continue;

      // Track status transitions (from admin force status or status_change events)
      if (event.to_status && event.from_status) {
        if (!videoTimelines.has(event.video_id)) {
          videoTimelines.set(event.video_id, []);
        }
        videoTimelines.get(event.video_id)!.push({
          status: event.to_status,
          timestamp: event.created_at,
        });
      }

      // Also track from details if present (for execution events)
      const details = event.details as Record<string, unknown> | null;
      if (details?.to_status && typeof details.to_status === "string") {
        if (!videoTimelines.has(event.video_id)) {
          videoTimelines.set(event.video_id, []);
        }
        videoTimelines.get(event.video_id)!.push({
          status: details.to_status,
          timestamp: event.created_at,
        });
      }
    }

    // Compute durations for each stage transition
    for (const transition of STAGE_TRANSITIONS) {
      const durations: number[] = [];

      for (const [, timeline] of videoTimelines) {
        // Find first occurrence of 'from' status and first occurrence of 'to' status after it
        let fromTime: Date | null = null;
        let toTime: Date | null = null;

        for (const entry of timeline) {
          if (entry.status === transition.from && !fromTime) {
            fromTime = new Date(entry.timestamp);
          }
          if (entry.status === transition.to && fromTime && !toTime) {
            toTime = new Date(entry.timestamp);
            break;
          }
        }

        if (fromTime && toTime) {
          const durationMinutes = (toTime.getTime() - fromTime.getTime()) / (1000 * 60);
          if (durationMinutes > 0 && durationMinutes < 60 * 24 * 30) { // Sanity check: < 30 days
            durations.push(durationMinutes);
          }
        }
      }

      // Sort for percentile calculation
      durations.sort((a, b) => a - b);

      results.push({
        stage: transition.label,
        from_status: transition.from,
        to_status: transition.to,
        count: durations.length,
        avg_minutes: Math.round(average(durations) * 10) / 10,
        median_minutes: Math.round(percentile(durations, 50) * 10) / 10,
        p90_minutes: Math.round(percentile(durations, 90) * 10) / 10,
      });
    }

    return results;
  } catch (err) {
    console.error("Error computing stage stats:", err);
    return STAGE_TRANSITIONS.map(t => ({
      stage: t.label,
      from_status: t.from,
      to_status: t.to,
      count: 0,
      avg_minutes: 0,
      median_minutes: 0,
      p90_minutes: 0,
    }));
  }
}

/**
 * Compute daily throughput counts for each milestone.
 */
export async function computeThroughputByDay(windowDays: number): Promise<ThroughputDay[]> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const results: ThroughputDay[] = [];

  try {
    // Fetch status transition events within window
    const { data: events, error } = await supabaseAdmin
      .from("video_events")
      .select("video_id, to_status, created_at, details")
      .gte("created_at", windowStart.toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching events for throughput:", error);
      return results;
    }

    // Initialize daily buckets
    const dailyCounts: Map<string, { recorded: Set<string>; edited: Set<string>; ready_to_post: Set<string>; posted: Set<string> }> = new Map();

    // Generate all dates in window
    for (let d = 0; d < windowDays; d++) {
      const date = new Date(windowStart.getTime() + d * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split("T")[0];
      dailyCounts.set(dateStr, {
        recorded: new Set(),
        edited: new Set(),
        ready_to_post: new Set(),
        posted: new Set(),
      });
    }

    if (!events) {
      // Return empty counts for each day
      return Array.from(dailyCounts.entries()).map(([date, counts]) => ({
        date,
        recorded: counts.recorded.size,
        edited: counts.edited.size,
        ready_to_post: counts.ready_to_post.size,
        posted: counts.posted.size,
      }));
    }

    // Count first occurrence of each status per video per day
    for (const event of events) {
      if (!event.video_id) continue;

      const dateStr = event.created_at.split("T")[0];
      const bucket = dailyCounts.get(dateStr);
      if (!bucket) continue;

      const toStatus = event.to_status || (event.details as Record<string, unknown> | null)?.to_status;
      if (!toStatus) continue;

      switch (toStatus) {
        case "RECORDED":
          bucket.recorded.add(event.video_id);
          break;
        case "EDITED":
          bucket.edited.add(event.video_id);
          break;
        case "READY_TO_POST":
          bucket.ready_to_post.add(event.video_id);
          break;
        case "POSTED":
          bucket.posted.add(event.video_id);
          break;
      }
    }

    // Convert to array
    return Array.from(dailyCounts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({
        date,
        recorded: counts.recorded.size,
        edited: counts.edited.size,
        ready_to_post: counts.ready_to_post.size,
        posted: counts.posted.size,
      }));
  } catch (err) {
    console.error("Error computing throughput:", err);
    return results;
  }
}

/**
 * Compute user productivity from assignment_completed events.
 */
export async function computeProductivity(windowDays: number): Promise<UserProductivity[]> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const results: UserProductivity[] = [];

  try {
    // Fetch assignment_completed events within window
    const { data: events, error } = await supabaseAdmin
      .from("video_events")
      .select("actor, created_at, details")
      .eq("event_type", "assignment_completed")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching events for productivity:", error);
      return results;
    }

    if (!events || events.length === 0) {
      return results;
    }

    // Aggregate by user and role
    const userStats: Map<string, { roles: Map<string, number>; lastActive: string }> = new Map();

    for (const event of events) {
      if (!event.actor || event.actor === "system") continue;

      const details = event.details as Record<string, unknown> | null;
      const role = (details?.role as string) || (details?.completed_by_role as string) || "unknown";

      if (!userStats.has(event.actor)) {
        userStats.set(event.actor, {
          roles: new Map(),
          lastActive: event.created_at,
        });
      }

      const stats = userStats.get(event.actor)!;
      stats.roles.set(role, (stats.roles.get(role) || 0) + 1);

      // Update last active if more recent
      if (event.created_at > stats.lastActive) {
        stats.lastActive = event.created_at;
      }
    }

    // Fetch user emails
    const userIds = Array.from(userStats.keys());
    const userEmails: Map<string, string | null> = new Map();

    if (userIds.length > 0) {
      try {
        // Try to get emails from user profiles or auth
        for (const userId of userIds) {
          try {
            const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
            userEmails.set(userId, user?.email || null);
          } catch {
            userEmails.set(userId, null);
          }
        }
      } catch {
        // Ignore email lookup errors
      }
    }

    // Convert to array - one entry per user/role combination
    for (const [userId, stats] of userStats) {
      for (const [role, count] of stats.roles) {
        results.push({
          user_id: userId,
          email: userEmails.get(userId) || null,
          role,
          completed: count,
          last_active_at: stats.lastActive,
        });
      }
    }

    // Sort by completed count descending
    results.sort((a, b) => b.completed - a.completed);

    return results;
  } catch (err) {
    console.error("Error computing productivity:", err);
    return results;
  }
}

/**
 * Generate CSV content from data
 */
export function generateCsv(data: Record<string, unknown>[], columns: string[]): string {
  if (data.length === 0) {
    return columns.join(",") + "\n";
  }

  const header = columns.join(",");
  const rows = data.map(row =>
    columns.map(col => {
      const value = row[col];
      if (value === null || value === undefined) return "";
      const str = String(value);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",")
  );

  return header + "\n" + rows.join("\n");
}

/**
 * Generate stage stats CSV
 */
export function generateStageStatsCsv(stats: StageStats[]): string {
  return generateCsv(
    stats as unknown as Record<string, unknown>[],
    ["stage", "from_status", "to_status", "count", "avg_minutes", "median_minutes", "p90_minutes"]
  );
}

/**
 * Generate throughput CSV
 */
export function generateThroughputCsv(throughput: ThroughputDay[]): string {
  return generateCsv(
    throughput as unknown as Record<string, unknown>[],
    ["date", "recorded", "edited", "ready_to_post", "posted"]
  );
}

/**
 * Generate productivity CSV
 */
export function generateProductivityCsv(productivity: UserProductivity[]): string {
  return generateCsv(
    productivity as unknown as Record<string, unknown>[],
    ["user_id", "email", "role", "completed", "last_active_at"]
  );
}
