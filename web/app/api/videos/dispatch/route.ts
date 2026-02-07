import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  computeStageInfo,
  computeSlaInfo,
  type VideoForValidation,
} from "@/lib/execution-stages";
import { expireAssignmentsForRole } from "@/lib/assignment-expiry";
import { triggerEmailNotification } from "@/lib/email-notifications";
import { canPerformGatedAction } from "@/lib/subscription";
import { checkIncidentReadOnlyBlock } from "@/lib/settings";

export const runtime = "nodejs";

const VALID_DISPATCH_ROLES = ["recorder", "editor", "uploader"] as const;
type DispatchRole = typeof VALID_DISPATCH_ROLES[number];

// Lane configuration: which recording_status each role works on
const LANE_CONFIG: Record<DispatchRole, { status: string; canAction: keyof ReturnType<typeof computeStageInfo> }> = {
  recorder: { status: "NOT_RECORDED", canAction: "can_record" },
  editor: { status: "RECORDED", canAction: "can_mark_edited" },
  uploader: { status: "READY_TO_POST", canAction: "can_mark_posted" },
};

async function writeVideoEvent(
  videoId: string,
  eventType: string,
  correlationId: string,
  actor: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from("video_events").insert({
      video_id: videoId,
      event_type: eventType,
      correlation_id: correlationId,
      actor,
      from_status: null,
      to_status: null,
      details,
    });
  } catch (err) {
    console.error("Failed to write video event:", err);
  }
}

async function insertNotification(
  userId: string,
  type: string,
  videoId: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type,
      video_id: videoId,
      payload,
    });
  } catch (err) {
    console.error("Failed to insert notification:", err);
  }
}

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required for dispatch", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const userId = authContext.user.id;
  const userRole = authContext.role;
  const isAdmin = authContext.isAdmin;

  // Incident mode read-only check (admin bypass)
  const incidentCheck = await checkIncidentReadOnlyBlock(userId, isAdmin);
  if (incidentCheck.blocked) {
    return NextResponse.json({
      ok: false,
      error: "incident_mode_read_only",
      message: incidentCheck.message || "System is in maintenance mode.",
      correlation_id: correlationId,
    }, { status: 503 });
  }

  // Subscription gating check (fail-safe: allows if not configured)
  const subscriptionCheck = await canPerformGatedAction(userId, isAdmin);
  if (!subscriptionCheck.allowed) {
    return NextResponse.json({
      ok: false,
      error: subscriptionCheck.reason || "subscription_required",
      message: "Upgrade required to use auto-dispatch.",
      correlation_id: correlationId,
    }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const {
    role: requestedRole,
    force = false,
    ttl_minutes,
  } = body as Record<string, unknown>;

  // Determine dispatch role
  let dispatchRole: DispatchRole;

  if (requestedRole && typeof requestedRole === "string") {
    if (!VALID_DISPATCH_ROLES.includes(requestedRole as DispatchRole)) {
      const err = apiError("BAD_REQUEST", `role must be one of: ${VALID_DISPATCH_ROLES.join(", ")}`, 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    // Non-admin can only dispatch for their own role
    if (!isAdmin && userRole !== requestedRole && userRole !== "admin") {
      const err = apiError("FORBIDDEN", `You can only dispatch for your own role: ${userRole}`, 403);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    dispatchRole = requestedRole as DispatchRole;
  } else if (userRole && VALID_DISPATCH_ROLES.includes(userRole as DispatchRole)) {
    dispatchRole = userRole as DispatchRole;
  } else {
    const err = apiError("BAD_REQUEST", "role is required for admin users or users without a dispatch role", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Force is admin-only
  if (force === true && !isAdmin) {
    const err = apiError("FORBIDDEN", "force=true is only allowed for admin users", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    const existingColumns = await getVideosColumns();
    const hasWorkPackageColumns = existingColumns.has("assignment_state") && existingColumns.has("assigned_expires_at");
    const hasClaimColumns = existingColumns.has("claimed_by") && existingColumns.has("claim_expires_at");

    if (!hasWorkPackageColumns) {
      const err = apiError("BAD_REQUEST", "Dispatch requires work package columns (migration 019)", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const laneConfig = LANE_CONFIG[dispatchRole];
    const now = new Date();
    const nowIso = now.toISOString();

    // Opportunistically expire any expired assignments for this lane before selecting
    await expireAssignmentsForRole(dispatchRole, now, correlationId);

    // Build query for eligible videos
    // Select videos in the appropriate recording_status for this role
    let selectCols = "id,recording_status,last_status_changed_at,script_locked_text,final_video_url,google_drive_url,posted_url,posted_platform,recording_notes,editor_notes,uploader_notes";
    selectCols += ",assignment_state,assigned_to,assigned_expires_at,assigned_ttl_minutes,assigned_role";
    if (hasClaimColumns) {
      selectCols += ",claimed_by,claim_expires_at";
    }

    let query = supabaseAdmin
      .from("videos")
      .select(selectCols)
      .eq("recording_status", laneConfig.status)
      .limit(50); // Get candidates, we'll filter and sort

    // Filter for unassigned or expired assignments
    query = query.or(`assignment_state.eq.UNASSIGNED,assignment_state.eq.EXPIRED,assigned_expires_at.lt.${nowIso}`);

    const { data: candidates, error: fetchError } = await query;

    if (fetchError) {
      console.error("Dispatch query error:", fetchError);
      const err = apiError("DB_ERROR", fetchError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    if (!candidates || candidates.length === 0) {
      const err = apiError("NO_WORK_AVAILABLE", `No work available for ${dispatchRole} lane`, 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Filter and score candidates
    const scoredCandidates: Array<{
      video: Record<string, unknown>;
      stageInfo: ReturnType<typeof computeStageInfo>;
      slaInfo: ReturnType<typeof computeSlaInfo>;
      priority: number;
    }> = [];

    for (const candidate of candidates as unknown as Record<string, unknown>[]) {
      // Check if video is claimed by someone else (unless force or include_unclaimed=false)
      if (hasClaimColumns && !force) {
        const claimedBy = candidate.claimed_by as string | null;
        const claimExpires = candidate.claim_expires_at as string | null;
        const isClaimedByOther = claimedBy && claimedBy !== userId && claimExpires && claimExpires > nowIso;

        if (isClaimedByOther) {
          continue; // Skip videos claimed by others
        }
      }

      // Compute stage info
      const videoForValidation: VideoForValidation = {
        recording_status: candidate.recording_status as string | null,
        recording_notes: candidate.recording_notes as string | null,
        editor_notes: candidate.editor_notes as string | null,
        uploader_notes: candidate.uploader_notes as string | null,
        posted_url: candidate.posted_url as string | null,
        posted_platform: candidate.posted_platform as string | null,
        final_video_url: candidate.final_video_url as string | null,
        google_drive_url: candidate.google_drive_url as string | null,
        script_locked_text: candidate.script_locked_text as string | null,
        script_not_required: candidate.script_not_required as boolean | null,
      };

      const stageInfo = computeStageInfo(videoForValidation);
      const slaInfo = computeSlaInfo(
        candidate.recording_status as string | null,
        candidate.last_status_changed_at as string | null,
        now
      );

      // Check if video can be actioned by this role
      const canAction = stageInfo[laneConfig.canAction];
      if (!canAction) {
        continue; // Skip videos that can't be actioned
      }

      scoredCandidates.push({
        video: candidate,
        stageInfo,
        slaInfo,
        priority: slaInfo.priority_score,
      });
    }

    if (scoredCandidates.length === 0) {
      const err = apiError("NO_WORK_AVAILABLE", `No actionable work available for ${dispatchRole} lane`, 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Sort by priority (highest first) and then by overdue/due_soon status
    scoredCandidates.sort((a, b) => {
      // First sort by SLA status (overdue > due_soon > on_track)
      const slaOrder = { overdue: 0, due_soon: 1, on_track: 2 };
      const slaCompare = slaOrder[a.slaInfo.sla_status] - slaOrder[b.slaInfo.sla_status];
      if (slaCompare !== 0) return slaCompare;

      // Then by priority score (higher is more urgent)
      return b.priority - a.priority;
    });

    // Pick the best candidate
    const best = scoredCandidates[0];
    const videoId = best.video.id as string;

    // Calculate TTL
    const defaultTtl = (best.video.assigned_ttl_minutes as number) || 240;
    const ttl = typeof ttl_minutes === "number" && ttl_minutes > 0 ? ttl_minutes : defaultTtl;
    const expiresAt = new Date(now.getTime() + ttl * 60 * 1000).toISOString();

    // Update the video with assignment
    const updatePayload: Record<string, unknown> = {
      assigned_to: userId,
      assigned_at: nowIso,
      assigned_expires_at: expiresAt,
      assigned_role: dispatchRole,
      assignment_state: "ASSIGNED",
      work_priority: best.priority,
      work_lane: dispatchRole,
    };

    const { error: updateError } = await supabaseAdmin
      .from("videos")
      .update(updatePayload)
      .eq("id", videoId)
      .select("id,recording_status,assigned_to,assigned_role,assigned_expires_at,assignment_state")
      .single();

    if (updateError) {
      console.error("Dispatch update error:", updateError);
      const err = apiError("DB_ERROR", "Failed to assign video", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Write event
    await writeVideoEvent(videoId, "assigned", correlationId, userId, {
      role: dispatchRole,
      ttl_minutes: ttl,
      priority_score: best.priority,
      sla_status: best.slaInfo.sla_status,
    });

    // Insert notification for the assignee
    await insertNotification(userId, "assigned", videoId, {
      role: dispatchRole,
      expires_at: expiresAt,
      sla_status: best.slaInfo.sla_status,
    });

    // Trigger email notification (fail-safe)
    triggerEmailNotification("assigned", videoId, {
      assignedUserId: userId,
      role: dispatchRole,
    });

    return NextResponse.json({
      ok: true,
      data: {
        video_id: videoId,
        assigned_to: userId,
        assigned_role: dispatchRole,
        assigned_expires_at: expiresAt,
        priority_score: best.priority,
        recording_status: best.video.recording_status,
        next_action: best.stageInfo.next_action,
        sla_status: best.slaInfo.sla_status,
      },
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("POST /api/videos/dispatch error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
