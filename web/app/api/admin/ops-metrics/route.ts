import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  RECORDING_STATUSES,
  SLA_DEADLINES_MINUTES,
  SLA_DUE_SOON_THRESHOLD_MINUTES,
  type SlaStatus,
} from "@/lib/execution-stages";
import { getIngestionMetrics } from "@/lib/ingestion";

export const runtime = "nodejs";

// Aging bucket definitions in minutes
const AGING_BUCKETS = [
  { label: "0-2h", min: 0, max: 120 },
  { label: "2-6h", min: 120, max: 360 },
  { label: "6-12h", min: 360, max: 720 },
  { label: "12-24h", min: 720, max: 1440 },
  { label: "24h+", min: 1440, max: Infinity },
] as const;

// Statuses that should be included in aging buckets (non-terminal)
const AGING_STATUSES = ["NOT_RECORDED", "RECORDED", "EDITED", "READY_TO_POST"] as const;

interface BlockerInfo {
  key: string;
  count: number;
  example_video_ids: string[];
}

interface VideoRow {
  id: string;
  recording_status: string | null;
  last_status_changed_at: string | null;
  updated_at: string | null;
  created_at: string;
  claimed_by: string | null;
  claim_expires_at: string | null;
  assigned_to: string | null;
  script_locked_text: string | null;
  final_video_url: string | null;
  google_drive_url: string | null;
  posted_url: string | null;
  posted_platform: string | null;
}

interface EventRow {
  video_id: string;
  event_type: string;
  to_status: string | null;
  created_at: string;
  details: Record<string, unknown>;
}

function computeSlaStatus(
  recordingStatus: string | null,
  lastStatusChangedAt: string | null,
  now: Date
): SlaStatus {
  const status = recordingStatus || "NOT_RECORDED";

  // Terminal states have no SLA
  if (status === "POSTED") {
    return "on_track";
  }

  // If no timestamp, treat as just entered (now)
  const enteredAt = lastStatusChangedAt ? new Date(lastStatusChangedAt) : now;
  const slaMinutes = SLA_DEADLINES_MINUTES[status] || SLA_DEADLINES_MINUTES["NOT_RECORDED"];
  const deadlineAt = new Date(enteredAt.getTime() + slaMinutes * 60 * 1000);
  const minutesUntilDeadline = Math.floor((deadlineAt.getTime() - now.getTime()) / (1000 * 60));

  if (minutesUntilDeadline < 0) {
    return "overdue";
  } else if (minutesUntilDeadline <= SLA_DUE_SOON_THRESHOLD_MINUTES) {
    return "due_soon";
  }
  return "on_track";
}

function computeAgeMinutes(
  video: VideoRow,
  now: Date
): number {
  const baseline = video.last_status_changed_at || video.updated_at || video.created_at;
  const enteredAt = new Date(baseline);
  return Math.floor((now.getTime() - enteredAt.getTime()) / (1000 * 60));
}

function getAgingBucket(minutes: number): string {
  for (const bucket of AGING_BUCKETS) {
    if (minutes >= bucket.min && minutes < bucket.max) {
      return bucket.label;
    }
  }
  return "24h+";
}

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Admin-only check
  const authContext = await getApiAuthContext();
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required for ops metrics", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    const now = new Date();

    // Check which columns exist
    const existingColumns = await getVideosColumns();
    const hasClaimColumns = existingColumns.has("claimed_by") && existingColumns.has("claim_expires_at");
    const hasAssignmentColumns = existingColumns.has("assigned_to");
    const hasExecutionColumns = existingColumns.has("recording_status") && existingColumns.has("last_status_changed_at");

    // Build select columns
    let selectCols = "id,created_at,google_drive_url,final_video_url,posted_url,posted_platform";
    if (hasExecutionColumns) {
      selectCols += ",recording_status,last_status_changed_at,script_locked_text";
    }
    if (hasClaimColumns) {
      selectCols += ",claimed_by,claim_expires_at";
    }
    if (hasAssignmentColumns) {
      selectCols += ",assigned_to";
    }
    // Check for updated_at
    if (existingColumns.has("updated_at")) {
      selectCols += ",updated_at";
    }

    // Fetch all non-terminal videos for metrics
    const { data: videosData, error: videosError } = await supabaseAdmin
      .from("videos")
      .select(selectCols);

    if (videosError) {
      console.error("GET /api/admin/ops-metrics videos error:", videosError);
      const err = apiError("DB_ERROR", videosError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const videos = (videosData || []) as unknown as VideoRow[];

    // Initialize totals
    const byStatus: Record<string, number> = {};
    for (const status of RECORDING_STATUSES) {
      byStatus[status] = 0;
    }

    const bySlaStatus: Record<SlaStatus, number> = {
      on_track: 0,
      due_soon: 0,
      overdue: 0,
    };

    let assignedUnclaimed = 0;
    let claimed = 0;

    // Initialize aging buckets
    const agingBuckets: Record<string, Record<string, number>> = {};
    for (const status of AGING_STATUSES) {
      agingBuckets[status] = {};
      for (const bucket of AGING_BUCKETS) {
        agingBuckets[status][bucket.label] = 0;
      }
    }

    // Blocker tracking
    const blockerMap: Record<string, { count: number; examples: string[] }> = {
      missing_locked_script: { count: 0, examples: [] },
      missing_final_video_url: { count: 0, examples: [] },
      missing_post_fields: { count: 0, examples: [] },
      assigned_to_other_user: { count: 0, examples: [] },
    };

    // Process each video
    for (const video of videos) {
      const status = video.recording_status || "NOT_RECORDED";

      // Count by status
      if (byStatus[status] !== undefined) {
        byStatus[status]++;
      }

      // Skip terminal states for SLA/aging
      if (status === "POSTED" || status === "REJECTED") {
        continue;
      }

      // SLA status
      const slaStatus = computeSlaStatus(video.recording_status, video.last_status_changed_at, now);
      bySlaStatus[slaStatus]++;

      // Claim status
      const isCurrentlyClaimed = video.claimed_by && video.claim_expires_at && new Date(video.claim_expires_at) > now;
      if (isCurrentlyClaimed) {
        claimed++;
      }

      // Assigned but unclaimed
      if (video.assigned_to && !isCurrentlyClaimed) {
        assignedUnclaimed++;
      }

      // Aging buckets (only for non-terminal statuses)
      if (AGING_STATUSES.includes(status as typeof AGING_STATUSES[number])) {
        const ageMinutes = computeAgeMinutes(video, now);
        const bucket = getAgingBucket(ageMinutes);
        agingBuckets[status][bucket]++;
      }

      // Blockers
      // Missing locked script (for NOT_RECORDED)
      if (status === "NOT_RECORDED" && !video.script_locked_text) {
        blockerMap.missing_locked_script.count++;
        if (blockerMap.missing_locked_script.examples.length < 5) {
          blockerMap.missing_locked_script.examples.push(video.id);
        }
      }

      // Missing final video URL (for EDITED)
      if (status === "EDITED") {
        const hasVideoUrl = video.final_video_url?.trim() || video.google_drive_url?.trim();
        if (!hasVideoUrl) {
          blockerMap.missing_final_video_url.count++;
          if (blockerMap.missing_final_video_url.examples.length < 5) {
            blockerMap.missing_final_video_url.examples.push(video.id);
          }
        }
      }

      // Missing post fields (for READY_TO_POST)
      if (status === "READY_TO_POST") {
        const hasPostedUrl = video.posted_url?.trim();
        const hasPlatform = video.posted_platform?.trim();
        if (!hasPostedUrl || !hasPlatform) {
          blockerMap.missing_post_fields.count++;
          if (blockerMap.missing_post_fields.examples.length < 5) {
            blockerMap.missing_post_fields.examples.push(video.id);
          }
        }
      }

      // Assigned to other user (has assigned_to but user might not be the claimer)
      // This is a potential bottleneck indicator
      if (video.assigned_to && isCurrentlyClaimed && video.assigned_to !== video.claimed_by) {
        blockerMap.assigned_to_other_user.count++;
        if (blockerMap.assigned_to_other_user.examples.length < 5) {
          blockerMap.assigned_to_other_user.examples.push(video.id);
        }
      }
    }

    // Fetch throughput from video_events (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: eventsData } = await supabaseAdmin
      .from("video_events")
      .select("video_id,event_type,to_status,created_at,details")
      .eq("event_type", "recording_status_changed")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: true });

    const events = (eventsData || []) as unknown as EventRow[];

    // Group events by day and status
    const postedPerDay: Record<string, number> = {};
    const recordedPerDay: Record<string, number> = {};
    const editedPerDay: Record<string, number> = {};

    for (const event of events) {
      const day = event.created_at.split("T")[0]; // YYYY-MM-DD
      const toStatus = event.to_status || (event.details?.new_recording_status as string);

      if (toStatus === "POSTED") {
        postedPerDay[day] = (postedPerDay[day] || 0) + 1;
      } else if (toStatus === "RECORDED") {
        recordedPerDay[day] = (recordedPerDay[day] || 0) + 1;
      } else if (toStatus === "EDITED") {
        editedPerDay[day] = (editedPerDay[day] || 0) + 1;
      }
    }

    // Convert to arrays sorted by day
    const formatDayArray = (dayMap: Record<string, number>) =>
      Object.entries(dayMap)
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => a.day.localeCompare(b.day));

    // Build blockers array
    const blockers: BlockerInfo[] = Object.entries(blockerMap)
      .filter(([, info]) => info.count > 0)
      .map(([key, info]) => ({
        key,
        count: info.count,
        example_video_ids: info.examples,
      }))
      .sort((a, b) => b.count - a.count);

    // Fetch ingestion metrics
    const ingestionResult = await getIngestionMetrics(supabaseAdmin);
    const ingestionHealth = ingestionResult.ok
      ? {
          total_jobs: ingestionResult.metrics!.total_jobs,
          jobs_by_status: ingestionResult.metrics!.jobs_by_status,
          jobs_by_source: ingestionResult.metrics!.jobs_by_source,
          failed_rows_24h: ingestionResult.metrics!.last_24h.rows_failed,
          committed_rows_24h: ingestionResult.metrics!.last_24h.rows_committed,
          partial_jobs: ingestionResult.metrics!.jobs_by_status.partial,
          has_recent_failures: ingestionResult.metrics!.recent_failures.length > 0,
          recent_failure_count: ingestionResult.metrics!.recent_failures.reduce(
            (sum, f) => sum + f.failure_count,
            0
          ),
        }
      : null;

    // Fetch uploader queue metrics (ready_to_post videos)
    const { data: uploaderVideos } = await supabaseAdmin
      .from("videos")
      .select("id, posting_meta")
      .eq("status", "ready_to_post");

    // Count by target_account and check for missing final_mp4
    const readyByAccount: Record<string, number> = {};
    const readyVideoIds = (uploaderVideos || []).map((v) => v.id);
    for (const video of uploaderVideos || []) {
      const pm = video.posting_meta as { target_account?: string } | null;
      const account = pm?.target_account || "unassigned";
      readyByAccount[account] = (readyByAccount[account] || 0) + 1;
    }

    // Check for final_mp4 assets
    let missingFinalMp4 = 0;
    if (readyVideoIds.length > 0) {
      const { data: mp4Assets } = await supabaseAdmin
        .from("video_assets")
        .select("video_id")
        .in("video_id", readyVideoIds)
        .eq("asset_type", "final_mp4")
        .is("deleted_at", null);

      const videosWithMp4 = new Set((mp4Assets || []).map((a) => a.video_id));
      missingFinalMp4 = readyVideoIds.filter((id) => !videosWithMp4.has(id)).length;
    }

    const uploaderQueue = {
      ready_to_post_total: readyVideoIds.length,
      ready_to_post_by_account: readyByAccount,
      missing_final_mp4: missingFinalMp4,
    };

    return NextResponse.json({
      ok: true,
      data: {
        generated_at: now.toISOString(),
        totals: {
          by_status: byStatus,
          by_sla_status: bySlaStatus,
          assigned_unclaimed: assignedUnclaimed,
          claimed: claimed,
        },
        aging_buckets: agingBuckets,
        throughput: {
          posted_per_day: formatDayArray(postedPerDay),
          recorded_per_day: formatDayArray(recordedPerDay),
          edited_per_day: formatDayArray(editedPerDay),
        },
        blockers,
        ingestion: ingestionHealth,
        uploader_queue: uploaderQueue,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/admin/ops-metrics error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
