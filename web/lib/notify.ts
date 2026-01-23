/**
 * Unified Notification Router
 * Central hub for dispatching notifications to multiple channels (email, Slack).
 * Enforces cooldown and emits events for each channel.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail, isEmailEnabled, getAdminEmailRecipient, checkEmailCooldown, EmailResult } from "@/lib/email";
import { sendSlack, isSlackEnabled, buildSlackMessage, SlackResult } from "@/lib/slack";

// Notification event types supported by the router
export type NotifyEventType =
  | "assigned"
  | "assignment_reassigned"
  | "assignment_expired"
  | "admin_force_status"
  | "admin_clear_claim"
  | "admin_reset_assignments";

// Events that should notify ops via Slack
const SLACK_OPS_EVENTS: NotifyEventType[] = [
  "assignment_expired",
  "admin_force_status",
  "admin_clear_claim",
  "admin_reset_assignments",
  "assignment_reassigned",
];

export interface NotifyPayload {
  videoId: string;
  // Email-specific
  recipientEmail?: string | null;
  recipientUserId?: string | null;
  role?: string;
  // Context
  adminEmail?: string | null;
  adminUserId?: string | null;
  performedBy?: string;
  reason?: string;
  // Status change context
  fromStatus?: string | null;
  toStatus?: string | null;
  fromState?: string | null;
  toState?: string | null;
  mode?: string;
  // Additional details
  expiresAt?: string;
  notes?: string | null;
  [key: string]: unknown;
}

export interface NotifyResult {
  ok: boolean;
  channels: {
    email: EmailResult | { status: "skipped_not_applicable" };
    slack: SlackResult | { status: "skipped_not_applicable" };
  };
}

/**
 * Write a notification channel event to video_events table.
 */
async function writeNotifyEvent(
  videoId: string,
  channel: "email" | "slack",
  eventType: NotifyEventType,
  result: EmailResult | SlackResult,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from("video_events").insert({
      video_id: videoId,
      event_type: `${channel}_${result.status}`,
      correlation_id: `notify-${Date.now()}`,
      actor: "system",
      from_status: null,
      to_status: null,
      details: {
        original_event: eventType,
        channel,
        status: result.status,
        message: result.message,
        ...details,
      },
    });
  } catch (err) {
    console.error(`Failed to write ${channel} notify event:`, err);
  }
}

/**
 * Check cooldown for a specific channel.
 */
async function checkCooldown(
  channel: "email" | "slack",
  eventType: string,
  videoId: string,
  cooldownSeconds: number = 60
): Promise<boolean> {
  const cooldownTime = new Date(Date.now() - cooldownSeconds * 1000).toISOString();

  try {
    const { data } = await supabaseAdmin
      .from("video_events")
      .select("id")
      .eq("event_type", `${channel}_sent`)
      .eq("video_id", videoId)
      .gte("created_at", cooldownTime)
      .limit(1);

    return data !== null && data.length > 0;
  } catch {
    // If check fails, allow notification to proceed (fail open)
    return false;
  }
}

/**
 * Lookup user email by user_id using Supabase auth admin API.
 */
async function getUserEmail(userId: string): Promise<string | null> {
  if (!userId) return null;

  try {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    if (profile) {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
      return user?.email || null;
    }

    return null;
  } catch (err) {
    console.error("Failed to lookup user email:", err);
    return null;
  }
}

/**
 * Generate email content for a notification event.
 */
function generateEmailContent(
  eventType: NotifyEventType,
  payload: NotifyPayload
): { subject: string; html: string } | null {
  const videoIdShort = payload.videoId.slice(0, 8);

  switch (eventType) {
    case "assigned":
      return {
        subject: `New task assigned: ${payload.role || "unknown"} - Video ${videoIdShort}`,
        html: `
          <h2>New Task Assigned</h2>
          <p>You have been assigned a video task.</p>
          <ul>
            <li><strong>Role:</strong> ${payload.role || "unknown"}</li>
            <li><strong>Video ID:</strong> ${payload.videoId}</li>
          </ul>
          <p>Please log in to the TTS Engine to view and complete this task.</p>
        `,
      };

    case "assignment_reassigned":
      return {
        subject: `Task reassigned to you: ${payload.role || "unknown"} - Video ${videoIdShort}`,
        html: `
          <h2>Task Reassigned to You</h2>
          <p>You have been assigned a video task.</p>
          <ul>
            <li><strong>Role:</strong> ${payload.role || "unknown"}</li>
            <li><strong>Video ID:</strong> ${payload.videoId}</li>
            ${payload.expiresAt ? `<li><strong>Expires:</strong> ${payload.expiresAt}</li>` : ""}
          </ul>
          <p>Please log in to the TTS Engine to view and complete this task.</p>
        `,
      };

    case "assignment_expired":
      return {
        subject: `Assignment expired: Video ${videoIdShort}`,
        html: `
          <h2>Assignment Expired</h2>
          <p>A video assignment has expired and been re-queued.</p>
          <ul>
            <li><strong>Video ID:</strong> ${payload.videoId}</li>
            <li><strong>Previous Assignee:</strong> ${payload.recipientUserId || "Unknown"}</li>
            <li><strong>Role:</strong> ${payload.role || "Unknown"}</li>
          </ul>
          <p>The video is now available for reassignment.</p>
        `,
      };

    case "admin_force_status":
      return {
        subject: `Admin Action: Force Status Change - Video ${videoIdShort}`,
        html: `
          <h2>Admin Action Audit</h2>
          <p>An admin action was performed on a video.</p>
          <ul>
            <li><strong>Action:</strong> Force Status Change</li>
            <li><strong>Video ID:</strong> ${payload.videoId}</li>
            <li><strong>Performed by:</strong> ${payload.performedBy || "Admin"}</li>
            <li><strong>From:</strong> ${payload.fromStatus || "?"} → <strong>To:</strong> ${payload.toStatus || "?"}</li>
            <li><strong>Reason:</strong> ${payload.reason || "Not specified"}</li>
          </ul>
        `,
      };

    case "admin_clear_claim":
      return {
        subject: `Admin Action: Clear Claim - Video ${videoIdShort}`,
        html: `
          <h2>Admin Action Audit</h2>
          <p>An admin action was performed on a video.</p>
          <ul>
            <li><strong>Action:</strong> Clear Claim</li>
            <li><strong>Video ID:</strong> ${payload.videoId}</li>
            <li><strong>Performed by:</strong> ${payload.performedBy || "Admin"}</li>
            <li><strong>Reason:</strong> ${payload.reason || "Not specified"}</li>
          </ul>
        `,
      };

    case "admin_reset_assignments":
      return {
        subject: `Admin Action: Reset Assignments - Video ${videoIdShort}`,
        html: `
          <h2>Admin Action Audit</h2>
          <p>An admin action was performed on a video.</p>
          <ul>
            <li><strong>Action:</strong> Reset Assignments (${payload.mode || "?"})</li>
            <li><strong>Video ID:</strong> ${payload.videoId}</li>
            <li><strong>Performed by:</strong> ${payload.performedBy || "Admin"}</li>
            <li><strong>Reason:</strong> ${payload.reason || "Not specified"}</li>
          </ul>
        `,
      };

    default:
      return null;
  }
}

/**
 * Generate Slack message for a notification event.
 */
function generateSlackMessage(
  eventType: NotifyEventType,
  payload: NotifyPayload
): { text: string; details: Record<string, string | number | null | undefined> } | null {
  const videoIdShort = payload.videoId.slice(0, 8);

  switch (eventType) {
    case "assignment_expired":
      return {
        text: `⏰ Assignment Expired: Video ${videoIdShort}`,
        details: {
          "Video ID": payload.videoId,
          "Previous Assignee": payload.recipientUserId || "Unknown",
          "Role": payload.role || "Unknown",
        },
      };

    case "assignment_reassigned":
      return {
        text: `🔄 Assignment Reassigned: Video ${videoIdShort}`,
        details: {
          "Video ID": payload.videoId,
          "New Role": payload.role || "Unknown",
          "Reassigned By": payload.performedBy || "Admin",
        },
      };

    case "admin_force_status":
      return {
        text: `⚠️ Admin Force Status: Video ${videoIdShort}`,
        details: {
          "Video ID": payload.videoId,
          "From": payload.fromStatus,
          "To": payload.toStatus,
          "By": payload.performedBy || "Admin",
          "Reason": payload.reason,
        },
      };

    case "admin_clear_claim":
      return {
        text: `🧹 Admin Clear Claim: Video ${videoIdShort}`,
        details: {
          "Video ID": payload.videoId,
          "By": payload.performedBy || "Admin",
          "Reason": payload.reason,
        },
      };

    case "admin_reset_assignments":
      return {
        text: `🔄 Admin Reset Assignments: Video ${videoIdShort}`,
        details: {
          "Video ID": payload.videoId,
          "Mode": payload.mode,
          "By": payload.performedBy || "Admin",
          "Reason": payload.reason,
        },
      };

    default:
      return null;
  }
}

/**
 * Main notification router function.
 * Dispatches notifications to all configured channels.
 */
export async function notify(
  eventType: NotifyEventType,
  payload: NotifyPayload
): Promise<NotifyResult> {
  const result: NotifyResult = {
    ok: true,
    channels: {
      email: { status: "skipped_not_applicable" },
      slack: { status: "skipped_not_applicable" },
    },
  };

  // === EMAIL CHANNEL ===
  try {
    if (isEmailEnabled()) {
      // Determine email recipient
      let recipientEmail = payload.recipientEmail;

      // For user-targeted events, lookup email from userId
      if (!recipientEmail && payload.recipientUserId) {
        recipientEmail = await getUserEmail(payload.recipientUserId);
      }

      // For admin/ops events, use admin recipient
      const isAdminEvent = eventType.startsWith("admin_") || eventType === "assignment_expired";
      if (isAdminEvent && !recipientEmail) {
        recipientEmail = getAdminEmailRecipient();
      }

      if (recipientEmail) {
        // Check cooldown
        const inCooldown = await checkEmailCooldown(
          supabaseAdmin,
          eventType,
          payload.videoId,
          recipientEmail,
          60
        );

        if (inCooldown) {
          result.channels.email = { ok: true, status: "skipped_disabled", message: "Email cooldown active" };
        } else {
          // Generate email content
          const emailContent = generateEmailContent(eventType, payload);

          if (emailContent) {
            const emailResult = await sendEmail({
              to: recipientEmail,
              subject: emailContent.subject,
              html: emailContent.html,
            });

            result.channels.email = emailResult;

            // Write event
            await writeNotifyEvent(payload.videoId, "email", eventType, emailResult, {
              recipient: recipientEmail,
            });
          }
        }
      } else {
        result.channels.email = { ok: true, status: "skipped_no_recipient", message: "No recipient email" };
      }
    }
  } catch (err) {
    console.error("Email notification error:", err);
    result.channels.email = { ok: false, status: "failed", message: String(err) };
  }

  // === SLACK CHANNEL ===
  try {
    if (isSlackEnabled() && SLACK_OPS_EVENTS.includes(eventType)) {
      // Check cooldown (5 minutes for Slack to prevent spam)
      const inCooldown = await checkCooldown("slack", eventType, payload.videoId, 300);

      if (inCooldown) {
        result.channels.slack = { ok: true, status: "skipped_disabled", message: "Slack cooldown active" };
      } else {
        // Generate Slack message
        const slackContent = generateSlackMessage(eventType, payload);

        if (slackContent) {
          const slackMessage = buildSlackMessage(slackContent.text, slackContent.details);
          const slackResult = await sendSlack(slackMessage);

          result.channels.slack = slackResult;

          // Write event
          await writeNotifyEvent(payload.videoId, "slack", eventType, slackResult, {
            event_type: eventType,
          });
        }
      }
    }
  } catch (err) {
    console.error("Slack notification error:", err);
    result.channels.slack = { ok: false, status: "failed", message: String(err) };
  }

  return result;
}

/**
 * Convenience wrapper for assignment notifications.
 */
export async function notifyAssignment(
  videoId: string,
  userId: string,
  role: string,
  eventType: "assigned" | "assignment_reassigned" = "assigned"
): Promise<NotifyResult> {
  return notify(eventType, {
    videoId,
    recipientUserId: userId,
    role,
  });
}

/**
 * Convenience wrapper for expiry notifications.
 */
export async function notifyExpiry(
  videoId: string,
  expiredUserId: string | null,
  role: string | null
): Promise<NotifyResult> {
  return notify("assignment_expired", {
    videoId,
    recipientUserId: expiredUserId || undefined,
    role: role || undefined,
  });
}

/**
 * Convenience wrapper for admin action notifications.
 */
export async function notifyAdminAction(
  eventType: "admin_force_status" | "admin_clear_claim" | "admin_reset_assignments",
  videoId: string,
  adminUserId: string,
  details: Record<string, unknown>
): Promise<NotifyResult> {
  return notify(eventType, {
    videoId,
    adminUserId,
    performedBy: (details.performed_by as string) || adminUserId,
    reason: details.reason as string,
    fromStatus: details.from_status as string,
    toStatus: details.to_status as string,
    fromState: details.from_state as string,
    toState: details.to_state as string,
    mode: details.mode as string,
    ...details,
  });
}
