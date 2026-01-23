/**
 * Email notification triggers for assignments, handoffs, and admin actions.
 * All functions fail-safe: if email is not configured, they log and skip.
 *
 * NOTE: triggerEmailNotification now routes through the unified notify() system
 * which also handles Slack notifications. Direct email functions remain available
 * for email-only use cases.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail, isEmailEnabled, getAdminEmailRecipient, checkEmailCooldown, EmailResult } from "@/lib/email";
import { notify, type NotifyEventType } from "@/lib/notify";

// Event types that trigger email notifications
type EmailTriggerEvent =
  | "assigned"
  | "assignment_reassigned"
  | "assignment_expired"
  | "admin_force_status"
  | "admin_clear_claim"
  | "admin_reset_assignments";

interface UserInfo {
  user_id: string;
  email: string | null;
}

/**
 * Write an email event to the video_events table for audit/debugging.
 */
async function writeEmailEvent(
  videoId: string,
  eventType: string,
  result: EmailResult,
  recipientEmail: string | null,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from("video_events").insert({
      video_id: videoId,
      event_type: `email_${result.status}`,
      correlation_id: `email-${Date.now()}`,
      actor: "system",
      from_status: null,
      to_status: null,
      details: {
        original_event: eventType,
        recipient: recipientEmail,
        status: result.status,
        message: result.message,
        ...details,
      },
    });
  } catch (err) {
    console.error("Failed to write email event:", err);
  }
}

/**
 * Lookup user email by user_id using Supabase auth admin API.
 */
async function getUserEmail(userId: string): Promise<string | null> {
  if (!userId) return null;

  try {
    // First try user_profiles table (if email is stored there)
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    // Get email from Supabase auth
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
 * Send assignment notification email to the assigned user.
 */
export async function sendAssignmentEmail(
  videoId: string,
  assignedUserId: string,
  role: string,
  eventType: "assigned" | "assignment_reassigned"
): Promise<void> {
  if (!isEmailEnabled()) {
    return;
  }

  const recipientEmail = await getUserEmail(assignedUserId);

  if (!recipientEmail) {
    await writeEmailEvent(videoId, eventType, {
      ok: true,
      status: "skipped_no_recipient",
      message: "User email not found",
    }, null, { user_id: assignedUserId, role });
    return;
  }

  // Check cooldown to prevent duplicate emails
  const inCooldown = await checkEmailCooldown(supabaseAdmin, eventType, videoId, recipientEmail, 60);
  if (inCooldown) {
    console.log(`Email cooldown active for ${eventType} on video ${videoId} to ${recipientEmail}`);
    return;
  }

  const subject = eventType === "assigned"
    ? `New task assigned: ${role} - Video ${videoId.slice(0, 8)}`
    : `Task reassigned to you: ${role} - Video ${videoId.slice(0, 8)}`;

  const html = `
    <h2>${eventType === "assigned" ? "New Task Assigned" : "Task Reassigned to You"}</h2>
    <p>You have been assigned a video task.</p>
    <ul>
      <li><strong>Role:</strong> ${role}</li>
      <li><strong>Video ID:</strong> ${videoId}</li>
    </ul>
    <p>Please log in to the TTS Engine to view and complete this task.</p>
  `;

  const result = await sendEmail({
    to: recipientEmail,
    subject,
    html,
  });

  await writeEmailEvent(videoId, eventType, result, recipientEmail, {
    user_id: assignedUserId,
    role,
  });
}

/**
 * Send assignment expiry notification to admins.
 */
export async function sendExpiryNotificationEmail(
  videoId: string,
  expiredUserId: string | null,
  role: string | null
): Promise<void> {
  if (!isEmailEnabled()) {
    return;
  }

  const adminEmail = getAdminEmailRecipient();

  if (!adminEmail) {
    await writeEmailEvent(videoId, "assignment_expired", {
      ok: true,
      status: "skipped_no_recipient",
      message: "No admin email configured",
    }, null, { expired_user_id: expiredUserId, role });
    return;
  }

  // Check cooldown
  const inCooldown = await checkEmailCooldown(supabaseAdmin, "assignment_expired", videoId, adminEmail, 300);
  if (inCooldown) {
    return;
  }

  const subject = `Assignment expired: Video ${videoId.slice(0, 8)}`;
  const html = `
    <h2>Assignment Expired</h2>
    <p>A video assignment has expired and been re-queued.</p>
    <ul>
      <li><strong>Video ID:</strong> ${videoId}</li>
      <li><strong>Previous Assignee:</strong> ${expiredUserId || "Unknown"}</li>
      <li><strong>Role:</strong> ${role || "Unknown"}</li>
    </ul>
    <p>The video is now available for reassignment.</p>
  `;

  const result = await sendEmail({
    to: adminEmail,
    subject,
    html,
  });

  await writeEmailEvent(videoId, "assignment_expired", result, adminEmail, {
    expired_user_id: expiredUserId,
    role,
  });
}

/**
 * Send admin action audit email to ops/admin mailbox.
 */
export async function sendAdminActionEmail(
  videoId: string,
  actionType: "admin_force_status" | "admin_clear_claim" | "admin_reset_assignments",
  adminUserId: string,
  details: Record<string, unknown>
): Promise<void> {
  if (!isEmailEnabled()) {
    return;
  }

  const adminEmail = getAdminEmailRecipient();

  if (!adminEmail) {
    await writeEmailEvent(videoId, actionType, {
      ok: true,
      status: "skipped_no_recipient",
      message: "No admin email configured",
    }, null, { admin_user_id: adminUserId, ...details });
    return;
  }

  // Check cooldown (shorter for admin actions - 30 seconds)
  const inCooldown = await checkEmailCooldown(supabaseAdmin, actionType, videoId, adminEmail, 30);
  if (inCooldown) {
    return;
  }

  const actionLabels: Record<string, string> = {
    admin_force_status: "Force Status Change",
    admin_clear_claim: "Clear Claim",
    admin_reset_assignments: "Reset Assignments",
  };

  const subject = `Admin Action: ${actionLabels[actionType]} - Video ${videoId.slice(0, 8)}`;
  const html = `
    <h2>Admin Action Audit</h2>
    <p>An admin action was performed on a video.</p>
    <ul>
      <li><strong>Action:</strong> ${actionLabels[actionType]}</li>
      <li><strong>Video ID:</strong> ${videoId}</li>
      <li><strong>Performed by:</strong> ${details.performed_by || adminUserId}</li>
      <li><strong>Reason:</strong> ${details.reason || "Not specified"}</li>
    </ul>
    <h3>Details</h3>
    <pre>${JSON.stringify(details, null, 2)}</pre>
  `;

  const result = await sendEmail({
    to: adminEmail,
    subject,
    html,
  });

  await writeEmailEvent(videoId, actionType, result, adminEmail, {
    admin_user_id: adminUserId,
    ...details,
  });
}

/**
 * Trigger notification based on event type.
 * This is the main entry point for event-driven notifications.
 * Routes through the unified notify() system which handles both email and Slack.
 */
export async function triggerEmailNotification(
  eventType: EmailTriggerEvent,
  videoId: string,
  details: {
    assignedUserId?: string;
    role?: string;
    adminUserId?: string;
    reason?: string;
    [key: string]: unknown;
  }
): Promise<void> {
  try {
    // Route through unified notification system
    await notify(eventType as NotifyEventType, {
      videoId,
      recipientUserId: details.assignedUserId,
      role: details.role,
      adminUserId: details.adminUserId,
      performedBy: (details.performed_by as string) || (details.reassignedBy as string) || details.adminUserId,
      reason: details.reason,
      fromStatus: details.from_status as string,
      toStatus: details.to_status as string,
      fromState: details.from_state as string,
      toState: details.to_state as string,
      mode: details.mode as string,
      ...details,
    });
  } catch (err) {
    console.error(`Notification trigger failed for ${eventType}:`, err);
  }
}
