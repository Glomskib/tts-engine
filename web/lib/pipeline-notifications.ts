/**
 * pipeline-notifications.ts
 *
 * Handles notifications for pipeline status transitions.
 * Sends in-app notifications and optionally emails when work moves between roles.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailWithAudit, isEmailEnabled } from "./email";

// Maps recording status to the role that should be notified
const STATUS_TO_NOTIFY_ROLE: Record<string, string | null> = {
  // When script is attached (NOT_RECORDED), notify recorder
  NOT_RECORDED: "recorder",
  // When recording is done, notify editor
  RECORDED: "editor",
  // When editing is done, notify admin for approval
  EDITED: "admin",
  // When approved, notify uploader
  READY_TO_POST: "uploader",
  // When posted, notify admin/insights
  POSTED: "admin",
  // Rejected goes back to relevant role
  REJECTED: null, // handled separately
};

interface NotifyPipelineParams {
  video_id: string;
  from_status: string | null;
  to_status: string;
  actor: string;
  correlation_id: string;
  video_info?: {
    brand_name?: string;
    product_sku?: string;
    account_name?: string;
  };
}

/**
 * Send in-app notification for a pipeline status change.
 * This creates notifications for users in the target role lane.
 */
export async function notifyPipelineTransition(
  supabase: SupabaseClient,
  params: NotifyPipelineParams
): Promise<void> {
  const { video_id, from_status, to_status, actor, correlation_id, video_info } = params;

  const targetRole = STATUS_TO_NOTIFY_ROLE[to_status];
  if (!targetRole) {
    return; // No notification needed for this status
  }

  // Build notification payload
  const notificationType = "status_changed";
  const payload = {
    video_id,
    from_status,
    to_status,
    actor,
    brand_name: video_info?.brand_name || null,
    product_sku: video_info?.product_sku || null,
    account_name: video_info?.account_name || null,
    message: getNotificationMessage(to_status, video_info),
  };

  try {
    // Get users with the target role
    const { data: roleUsers, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", targetRole);

    if (roleError) {
      console.error("Failed to fetch role users:", roleError);
      return;
    }

    if (!roleUsers || roleUsers.length === 0) {
      // No users in this role, skip
      return;
    }

    // Create notifications for each user in the role
    const notifications = roleUsers.map((u) => ({
      user_id: u.user_id,
      type: notificationType,
      video_id,
      payload,
      is_read: false,
    }));

    const { error: insertError } = await supabase
      .from("notifications")
      .insert(notifications);

    if (insertError) {
      console.error("Failed to insert notifications:", insertError);
    }

    // Send email notifications if enabled
    const emailEnabled = await isEmailEnabled();
    if (emailEnabled) {
      await sendPipelineEmails(supabase, {
        role: targetRole,
        to_status,
        video_id,
        video_info,
        correlation_id,
      });
    }
  } catch (err) {
    console.error("notifyPipelineTransition error:", err);
  }
}

/**
 * Generate user-friendly notification message
 */
function getNotificationMessage(
  to_status: string,
  video_info?: { brand_name?: string; product_sku?: string }
): string {
  const label = video_info?.brand_name
    ? `${video_info.brand_name} / ${video_info.product_sku || "Video"}`
    : "Video";

  switch (to_status) {
    case "NOT_RECORDED":
      return `${label} is ready for recording`;
    case "RECORDED":
      return `${label} is ready for editing`;
    case "EDITED":
      return `${label} needs approval`;
    case "READY_TO_POST":
      return `${label} is ready to post`;
    case "POSTED":
      return `${label} has been posted`;
    default:
      return `${label} status changed to ${to_status}`;
  }
}

/**
 * Send email notifications for pipeline transitions
 */
async function sendPipelineEmails(
  supabase: SupabaseClient,
  params: {
    role: string;
    to_status: string;
    video_id: string;
    video_info?: { brand_name?: string; product_sku?: string };
    correlation_id: string;
  }
): Promise<void> {
  const { role, to_status, video_id, video_info, correlation_id } = params;

  // Get email addresses for users in the role
  const { data: roleUsers, error } = await supabase
    .from("user_roles")
    .select("user_id");

  if (error || !roleUsers || roleUsers.length === 0) {
    return;
  }

  // Get user emails from auth.users
  const userIds = roleUsers.map((u) => u.user_id);
  const { data: users } = await supabase.auth.admin.listUsers();

  const targetEmails = users?.users
    ?.filter((u) => userIds.includes(u.id) && u.email)
    .map((u) => u.email!) || [];

  if (targetEmails.length === 0) {
    return;
  }

  const label = video_info?.brand_name
    ? `${video_info.brand_name} / ${video_info.product_sku || ""}`
    : video_id.slice(0, 8);

  const actionLabel = getActionLabel(to_status);
  const subject = `Action needed: ${actionLabel} (${label})`;

  const pipelineUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.tts-engine.com"}/admin/pipeline?video=${video_id}`;

  const html = `
    <p>A video needs your attention:</p>
    <p><strong>${label}</strong> - ${actionLabel}</p>
    <p><a href="${pipelineUrl}">View in Pipeline</a></p>
    <p style="color: #666; font-size: 12px;">Video ID: ${video_id}</p>
  `;

  // Send to first email (avoid spamming everyone)
  // In production, you might want to send to all or use a group email
  await sendEmailWithAudit(supabase, {
    to: targetEmails[0],
    subject,
    html,
    templateKey: `pipeline_${to_status.toLowerCase()}`,
    context: {
      video_id,
      correlation_id,
    },
  });
}

/**
 * Get action label for email subject
 */
function getActionLabel(to_status: string): string {
  switch (to_status) {
    case "NOT_RECORDED":
      return "Record video";
    case "RECORDED":
      return "Edit video";
    case "EDITED":
      return "Approve edit";
    case "READY_TO_POST":
      return "Post video";
    case "POSTED":
      return "Video posted";
    default:
      return `Status: ${to_status}`;
  }
}
