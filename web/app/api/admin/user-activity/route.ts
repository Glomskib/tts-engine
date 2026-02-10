import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

interface EventRow {
  actor: string;
  event_type: string;
  created_at: string;
}

interface UserActivitySummary {
  user_id: string;
  email: string | null;
  role: string | null;
  last_active_at: string | null;
  stats_7d: {
    assignments_completed: number;
    assignments_expired: number;
    status_changes: number;
    total_events: number;
  };
  stats_30d: {
    assignments_completed: number;
    assignments_expired: number;
    status_changes: number;
    total_events: number;
  };
}

/**
 * GET /api/admin/user-activity
 * Admin-only. Returns per-user activity summary for the last 7 and 30 days.
 * Query params:
 *   - limit: number (default: 50, max: 200)
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  // Admin-only check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const limitParam = parseInt(searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(1, limitParam), 200);

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch events from last 30 days (we'll compute 7d from this too)
    // Limit to relevant event types and non-system actors
    const { data: eventsData, error: eventsError } = await supabaseAdmin
      .from("video_events")
      .select("actor,event_type,created_at")
      .gte("created_at", thirtyDaysAgo)
      .in("event_type", [
        "assignment_completed",
        "assignment_expired",
        "recording_status_changed",
        "assigned",
        "handoff",
        "claim",
        "release",
      ])
      .neq("actor", "system")
      .order("created_at", { ascending: false })
      .limit(10000); // Reasonable limit for 30d data

    if (eventsError) {
      console.error("GET /api/admin/user-activity events error:", eventsError);
      const err = apiError("DB_ERROR", eventsError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const events = (eventsData || []) as EventRow[];

    // Build per-user stats
    const userStats: Record<string, {
      last_active_at: string | null;
      events_7d: EventRow[];
      events_30d: EventRow[];
    }> = {};

    for (const event of events) {
      const userId = event.actor;
      if (!userId || userId === "system" || userId === "admin") continue;

      if (!userStats[userId]) {
        userStats[userId] = {
          last_active_at: null,
          events_7d: [],
          events_30d: [],
        };
      }

      // Track last active
      if (!userStats[userId].last_active_at || event.created_at > userStats[userId].last_active_at) {
        userStats[userId].last_active_at = event.created_at;
      }

      // Categorize by time window
      userStats[userId].events_30d.push(event);
      if (event.created_at >= sevenDaysAgo) {
        userStats[userId].events_7d.push(event);
      }
    }

    // Fetch user profiles for email/role info
    const userIds = Object.keys(userStats);
    const userProfiles: Record<string, { email: string | null; role: string | null }> = {};

    if (userIds.length > 0) {
      const { data: profilesData } = await supabaseAdmin
        .from("user_profiles")
        .select("user_id,role")
        .in("user_id", userIds.slice(0, limit));

      if (profilesData) {
        for (const profile of profilesData as { user_id: string; role: string | null }[]) {
          userProfiles[profile.user_id] = {
            email: null, // We don't store email in user_profiles
            role: profile.role,
          };
        }
      }
    }

    // Compute summary stats per user
    const computeStats = (eventsList: EventRow[]) => {
      let assignmentsCompleted = 0;
      let assignmentsExpired = 0;
      let statusChanges = 0;

      for (const e of eventsList) {
        if (e.event_type === "assignment_completed") assignmentsCompleted++;
        else if (e.event_type === "assignment_expired") assignmentsExpired++;
        else if (e.event_type === "recording_status_changed") statusChanges++;
      }

      return {
        assignments_completed: assignmentsCompleted,
        assignments_expired: assignmentsExpired,
        status_changes: statusChanges,
        total_events: eventsList.length,
      };
    };

    const users: UserActivitySummary[] = userIds.slice(0, limit).map((userId) => {
      const stats = userStats[userId];
      const profile = userProfiles[userId];

      return {
        user_id: userId,
        email: profile?.email || null,
        role: profile?.role || null,
        last_active_at: stats.last_active_at,
        stats_7d: computeStats(stats.events_7d),
        stats_30d: computeStats(stats.events_30d),
      };
    });

    // Sort by last_active_at (most recent first)
    users.sort((a, b) => {
      if (!a.last_active_at && !b.last_active_at) return 0;
      if (!a.last_active_at) return 1;
      if (!b.last_active_at) return -1;
      return b.last_active_at.localeCompare(a.last_active_at);
    });

    return NextResponse.json({
      ok: true,
      data: {
        users,
        summary: {
          total_users_active: users.length,
          generated_at: now.toISOString(),
        },
      },
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("GET /api/admin/user-activity error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
