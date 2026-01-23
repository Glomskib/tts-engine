import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";

export interface ExpireResult {
  expired_count: number;
  expired_ids: string[];
  error?: string;
}

interface ExpiredVideo {
  id: string;
  assigned_to: string | null;
  assigned_role: string | null;
  assigned_expires_at: string | null;
  recording_status: string | null;
}

/**
 * Write an assignment_expired event to video_events
 */
async function writeExpiryEvent(
  videoId: string,
  correlationId: string,
  previousAssignee: string | null,
  previousRole: string | null,
  expiredAt: string | null,
  now: string
): Promise<void> {
  try {
    await supabaseAdmin.from("video_events").insert({
      video_id: videoId,
      event_type: "assignment_expired",
      correlation_id: correlationId,
      actor: "system",
      from_status: null,
      to_status: null,
      details: {
        previous_assignee: previousAssignee,
        role: previousRole,
        expired_at: expiredAt,
        detected_at: now,
      },
    });
  } catch (err) {
    console.error("Failed to write assignment_expired event:", err);
  }
}

/**
 * Insert a notification for the user whose assignment expired
 */
async function notifyAssignmentExpired(
  userId: string,
  videoId: string,
  role: string | null
): Promise<void> {
  if (!userId) return;
  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type: "assignment_expired",
      video_id: videoId,
      payload: {
        role,
        message: "Your assignment expired and was re-queued",
      },
    });
  } catch (err) {
    console.error("Failed to insert assignment_expired notification:", err);
  }
}

/**
 * Expire assignments for a specific role/lane.
 * Sets assignment_state=EXPIRED where assigned_expires_at < now.
 */
export async function expireAssignmentsForRole(
  role: string,
  now: Date,
  correlationId: string
): Promise<ExpireResult> {
  const nowIso = now.toISOString();

  try {
    const existingColumns = await getVideosColumns();
    if (!existingColumns.has("assignment_state") || !existingColumns.has("assigned_expires_at")) {
      return { expired_count: 0, expired_ids: [] };
    }

    // Map role to recording_status lane
    const laneMap: Record<string, string[]> = {
      recorder: ["NOT_RECORDED"],
      editor: ["RECORDED", "EDITED"],
      uploader: ["READY_TO_POST"],
    };
    const laneStatuses = laneMap[role];
    if (!laneStatuses) {
      return { expired_count: 0, expired_ids: [] };
    }

    // Find expired assignments in this lane
    const { data: expired, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id,assigned_to,assigned_role,assigned_expires_at,recording_status")
      .eq("assignment_state", "ASSIGNED")
      .in("recording_status", laneStatuses)
      .lt("assigned_expires_at", nowIso);

    if (fetchError) {
      console.error("expireAssignmentsForRole fetch error:", fetchError);
      return { expired_count: 0, expired_ids: [], error: fetchError.message };
    }

    if (!expired || expired.length === 0) {
      return { expired_count: 0, expired_ids: [] };
    }

    const expiredVideos = expired as ExpiredVideo[];
    const expiredIds = expiredVideos.map((v) => v.id);

    // Update to EXPIRED state
    const { error: updateError } = await supabaseAdmin
      .from("videos")
      .update({ assignment_state: "EXPIRED" })
      .in("id", expiredIds);

    if (updateError) {
      console.error("expireAssignmentsForRole update error:", updateError);
      return { expired_count: 0, expired_ids: [], error: updateError.message };
    }

    // Write events and notifications
    for (const video of expiredVideos) {
      await writeExpiryEvent(
        video.id,
        correlationId,
        video.assigned_to,
        video.assigned_role,
        video.assigned_expires_at,
        nowIso
      );
      if (video.assigned_to) {
        await notifyAssignmentExpired(video.assigned_to, video.id, video.assigned_role);
      }
    }

    return { expired_count: expiredIds.length, expired_ids: expiredIds };
  } catch (err) {
    console.error("expireAssignmentsForRole error:", err);
    return { expired_count: 0, expired_ids: [], error: String(err) };
  }
}

/**
 * Expire all assignments across all lanes.
 * Sets assignment_state=EXPIRED where assigned_expires_at < now.
 */
export async function expireAllAssignments(
  now: Date,
  correlationId: string
): Promise<ExpireResult> {
  const nowIso = now.toISOString();

  try {
    const existingColumns = await getVideosColumns();
    if (!existingColumns.has("assignment_state") || !existingColumns.has("assigned_expires_at")) {
      return { expired_count: 0, expired_ids: [] };
    }

    // Find all expired assignments
    const { data: expired, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id,assigned_to,assigned_role,assigned_expires_at,recording_status")
      .eq("assignment_state", "ASSIGNED")
      .lt("assigned_expires_at", nowIso);

    if (fetchError) {
      console.error("expireAllAssignments fetch error:", fetchError);
      return { expired_count: 0, expired_ids: [], error: fetchError.message };
    }

    if (!expired || expired.length === 0) {
      return { expired_count: 0, expired_ids: [] };
    }

    const expiredVideos = expired as ExpiredVideo[];
    const expiredIds = expiredVideos.map((v) => v.id);

    // Update to EXPIRED state
    const { error: updateError } = await supabaseAdmin
      .from("videos")
      .update({ assignment_state: "EXPIRED" })
      .in("id", expiredIds);

    if (updateError) {
      console.error("expireAllAssignments update error:", updateError);
      return { expired_count: 0, expired_ids: [], error: updateError.message };
    }

    // Write events and notifications
    for (const video of expiredVideos) {
      await writeExpiryEvent(
        video.id,
        correlationId,
        video.assigned_to,
        video.assigned_role,
        video.assigned_expires_at,
        nowIso
      );
      if (video.assigned_to) {
        await notifyAssignmentExpired(video.assigned_to, video.id, video.assigned_role);
      }
    }

    return { expired_count: expiredIds.length, expired_ids: expiredIds };
  } catch (err) {
    console.error("expireAllAssignments error:", err);
    return { expired_count: 0, expired_ids: [], error: String(err) };
  }
}

/**
 * Check if a user had an assignment that just expired (for UI messaging).
 * Returns the expired video IDs if any were found and expired.
 */
export async function checkAndExpireUserAssignment(
  userId: string,
  role: string | null,
  now: Date,
  correlationId: string
): Promise<{ hadExpired: boolean; expiredVideoIds: string[] }> {
  const nowIso = now.toISOString();

  try {
    const existingColumns = await getVideosColumns();
    if (!existingColumns.has("assignment_state") || !existingColumns.has("assigned_expires_at")) {
      return { hadExpired: false, expiredVideoIds: [] };
    }

    // Find assignments for this user that are ASSIGNED but expired
    let query = supabaseAdmin
      .from("videos")
      .select("id,assigned_to,assigned_role,assigned_expires_at,recording_status")
      .eq("assigned_to", userId)
      .eq("assignment_state", "ASSIGNED")
      .lt("assigned_expires_at", nowIso);

    const { data: expired, error: fetchError } = await query;

    if (fetchError || !expired || expired.length === 0) {
      return { hadExpired: false, expiredVideoIds: [] };
    }

    const expiredVideos = expired as ExpiredVideo[];
    const expiredIds = expiredVideos.map((v) => v.id);

    // Update to EXPIRED state
    const { error: updateError } = await supabaseAdmin
      .from("videos")
      .update({ assignment_state: "EXPIRED" })
      .in("id", expiredIds);

    if (updateError) {
      console.error("checkAndExpireUserAssignment update error:", updateError);
      return { hadExpired: false, expiredVideoIds: [] };
    }

    // Write events and notifications
    for (const video of expiredVideos) {
      await writeExpiryEvent(
        video.id,
        correlationId,
        video.assigned_to,
        video.assigned_role,
        video.assigned_expires_at,
        nowIso
      );
      // Notification already goes to this user, so we send it
      await notifyAssignmentExpired(userId, video.id, video.assigned_role);
    }

    return { hadExpired: true, expiredVideoIds: expiredIds };
  } catch (err) {
    console.error("checkAndExpireUserAssignment error:", err);
    return { hadExpired: false, expiredVideoIds: [] };
  }
}
