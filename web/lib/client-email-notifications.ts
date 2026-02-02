/**
 * Client-Facing Email Notifications
 *
 * Premium, neutral, white-label safe email templates for:
 * - Organization invites
 * - Client request status updates
 * - Request-to-video conversions
 *
 * All functions fail-safe: if email not configured, no-op safely with audit event.
 */

import { sendEmailWithAudit, wasEmailSkipped, type EmailResult } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ============================================================================
// Types
// ============================================================================

export interface InviteEmailParams {
  recipientEmail: string;
  orgName: string;
  role: string;
  inviteUrl: string;
  invitedByEmail?: string;
}

export interface RequestStatusEmailParams {
  recipientEmail: string;
  requestId: string;
  requestTitle: string;
  requestType: string;
  orgName: string;
  newStatus: "APPROVED" | "REJECTED";
  reason?: string;
  portalUrl?: string;
}

export interface RequestConvertedEmailParams {
  recipientEmail: string;
  requestId: string;
  requestTitle: string;
  videoId: string;
  orgName: string;
  portalUrl?: string;
}

export interface VideoReadyForReviewEmailParams {
  recipientEmail: string;
  requestId: string;
  requestTitle: string;
  editedDriveLink: string;
  reviewUrl?: string;
}

export interface VideoCompletedEmailParams {
  recipientEmail: string;
  requestId: string;
  requestTitle: string;
  editedDriveLink: string;
}

export interface RevisionRequestedEmailParams {
  recipientEmail: string;
  requestId: string;
  requestTitle: string;
  revisionNotes: string;
  revisionNumber: number;
}

export interface ClientEmailResult {
  sent: boolean;
  skipped: boolean;
  status: string;
  message?: string;
}

// ============================================================================
// Email Templates
// ============================================================================

/**
 * Generate invite email content.
 * Premium, neutral, white-label safe.
 */
function generateInviteEmailContent(params: InviteEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `You've been invited to join ${params.orgName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-radius: 8px; padding: 32px; text-align: center;">
    <h1 style="margin: 0 0 16px 0; font-size: 24px; color: #1a1a1a;">You're Invited</h1>
    <p style="margin: 0 0 24px 0; color: #666;">
      You've been invited to join <strong>${params.orgName}</strong> as a <strong>${params.role}</strong>.
    </p>
    <a href="${params.inviteUrl}" style="display: inline-block; padding: 14px 32px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">
      Accept Invitation
    </a>
  </div>
  <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #888;">
    <p>This invitation will expire in 7 days. If you did not expect this invitation, you can safely ignore this email.</p>
    ${params.invitedByEmail ? `<p>Invited by: ${params.invitedByEmail}</p>` : ""}
  </div>
</body>
</html>
  `.trim();

  const text = `You've been invited to join ${params.orgName}

You've been invited to join ${params.orgName} as a ${params.role}.

Accept your invitation: ${params.inviteUrl}

This invitation will expire in 7 days. If you did not expect this invitation, you can safely ignore this email.
${params.invitedByEmail ? `\nInvited by: ${params.invitedByEmail}` : ""}
  `.trim();

  return { subject, html, text };
}

/**
 * Generate request status update email content.
 * Premium, neutral, compliant (no promises).
 */
function generateRequestStatusEmailContent(params: RequestStatusEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const statusLabel = params.newStatus === "APPROVED" ? "Approved" : "Not Approved";
  const subject = `Request Update: ${params.requestTitle} - ${statusLabel}`;

  const statusColor = params.newStatus === "APPROVED" ? "#16a34a" : "#dc2626";
  const statusBg = params.newStatus === "APPROVED" ? "#f0fdf4" : "#fef2f2";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: ${statusBg}; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 8px 0; font-size: 20px; color: #1a1a1a;">Request Update</h1>
    <p style="margin: 0; color: ${statusColor}; font-weight: 600; font-size: 16px;">${statusLabel}</p>
  </div>

  <div style="margin-bottom: 24px;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr>
        <td style="padding: 8px 0; color: #666; width: 120px;">Request</td>
        <td style="padding: 8px 0; font-weight: 500;">${params.requestTitle}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Type</td>
        <td style="padding: 8px 0;">${params.requestType.replace(/_/g, " ")}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Reference</td>
        <td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${params.requestId.slice(0, 8)}...</td>
      </tr>
      ${params.reason ? `
      <tr>
        <td style="padding: 8px 0; color: #666; vertical-align: top;">Notes</td>
        <td style="padding: 8px 0;">${params.reason}</td>
      </tr>
      ` : ""}
    </table>
  </div>

  ${params.portalUrl ? `
  <div style="text-align: center; margin-bottom: 24px;">
    <a href="${params.portalUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">
      View in Portal
    </a>
  </div>
  ` : ""}

  <div style="font-size: 12px; color: #888; border-top: 1px solid #e5e7eb; padding-top: 16px;">
    <p>This is an automated notification from ${params.orgName}.</p>
  </div>
</body>
</html>
  `.trim();

  const text = `Request Update: ${statusLabel}

Request: ${params.requestTitle}
Type: ${params.requestType.replace(/_/g, " ")}
Reference: ${params.requestId.slice(0, 8)}...
${params.reason ? `Notes: ${params.reason}\n` : ""}
${params.portalUrl ? `\nView in Portal: ${params.portalUrl}` : ""}

This is an automated notification from ${params.orgName}.
  `.trim();

  return { subject, html, text };
}

/**
 * Generate request converted email content.
 */
function generateRequestConvertedEmailContent(params: RequestConvertedEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Your request is now in production: ${params.requestTitle}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f0fdf4; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 8px 0; font-size: 20px; color: #1a1a1a;">Request In Production</h1>
    <p style="margin: 0; color: #16a34a; font-weight: 600;">Your content request has entered the production pipeline.</p>
  </div>

  <div style="margin-bottom: 24px;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr>
        <td style="padding: 8px 0; color: #666; width: 120px;">Request</td>
        <td style="padding: 8px 0; font-weight: 500;">${params.requestTitle}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Video ID</td>
        <td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${params.videoId.slice(0, 8)}...</td>
      </tr>
    </table>
  </div>

  <p style="color: #666; font-size: 14px;">
    You can track the progress of your video in the client portal.
    We'll notify you when there are updates.
  </p>

  ${params.portalUrl ? `
  <div style="text-align: center; margin: 24px 0;">
    <a href="${params.portalUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">
      View in Portal
    </a>
  </div>
  ` : ""}

  <div style="font-size: 12px; color: #888; border-top: 1px solid #e5e7eb; padding-top: 16px;">
    <p>This is an automated notification from ${params.orgName}.</p>
  </div>
</body>
</html>
  `.trim();

  const text = `Your request is now in production

Request: ${params.requestTitle}
Video ID: ${params.videoId.slice(0, 8)}...

You can track the progress of your video in the client portal. We'll notify you when there are updates.
${params.portalUrl ? `\nView in Portal: ${params.portalUrl}` : ""}

This is an automated notification from ${params.orgName}.
  `.trim();

  return { subject, html, text };
}

/**
 * Generate video ready for review email content.
 */
function generateVideoReadyForReviewEmailContent(params: VideoReadyForReviewEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Your video is ready for review: ${params.requestTitle}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f0f9ff; border-radius: 8px; padding: 24px; margin-bottom: 24px; border-left: 4px solid #3b82f6;">
    <h1 style="margin: 0 0 8px 0; font-size: 20px; color: #1a1a1a;">Video Ready for Review</h1>
    <p style="margin: 0; color: #3b82f6; font-weight: 600;">Your edited video is complete and awaiting your approval.</p>
  </div>

  <div style="margin-bottom: 24px;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr>
        <td style="padding: 8px 0; color: #666; width: 120px;">Project</td>
        <td style="padding: 8px 0; font-weight: 500;">${params.requestTitle}</td>
      </tr>
    </table>
  </div>

  <p style="color: #666; font-size: 14px; margin-bottom: 24px;">
    Please review the edited video and either approve it or request revisions.
  </p>

  <div style="text-align: center; margin-bottom: 24px;">
    <a href="${params.editedDriveLink}" style="display: inline-block; padding: 14px 28px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; margin-right: 12px;">
      View Edited Video
    </a>
    ${params.reviewUrl ? `
    <a href="${params.reviewUrl}" style="display: inline-block; padding: 14px 28px; background: #10b981; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">
      Review & Approve
    </a>
    ` : ""}
  </div>

  <div style="font-size: 12px; color: #888; border-top: 1px solid #e5e7eb; padding-top: 16px;">
    <p>This is an automated notification. Please review your video within 48 hours.</p>
  </div>
</body>
</html>
  `.trim();

  const text = `Your video is ready for review

Project: ${params.requestTitle}

Your edited video is complete and awaiting your approval. Please review the video and either approve it or request revisions.

View Edited Video: ${params.editedDriveLink}
${params.reviewUrl ? `\nReview & Approve: ${params.reviewUrl}` : ""}

Please review your video within 48 hours.
  `.trim();

  return { subject, html, text };
}

/**
 * Generate video completed email content.
 */
function generateVideoCompletedEmailContent(params: VideoCompletedEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Video complete: ${params.requestTitle}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f0fdf4; border-radius: 8px; padding: 24px; margin-bottom: 24px; border-left: 4px solid #10b981;">
    <h1 style="margin: 0 0 8px 0; font-size: 20px; color: #1a1a1a;">Video Complete</h1>
    <p style="margin: 0; color: #10b981; font-weight: 600;">Your video has been approved and is ready for use.</p>
  </div>

  <div style="margin-bottom: 24px;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr>
        <td style="padding: 8px 0; color: #666; width: 120px;">Project</td>
        <td style="padding: 8px 0; font-weight: 500;">${params.requestTitle}</td>
      </tr>
    </table>
  </div>

  <div style="text-align: center; margin-bottom: 24px;">
    <a href="${params.editedDriveLink}" style="display: inline-block; padding: 14px 28px; background: #10b981; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">
      Download Your Video
    </a>
  </div>

  <div style="font-size: 12px; color: #888; border-top: 1px solid #e5e7eb; padding-top: 16px;">
    <p>Thank you for using our video editing service!</p>
  </div>
</body>
</html>
  `.trim();

  const text = `Video Complete: ${params.requestTitle}

Your video has been approved and is ready for use.

Download Your Video: ${params.editedDriveLink}

Thank you for using our video editing service!
  `.trim();

  return { subject, html, text };
}

/**
 * Generate revision requested email content.
 */
function generateRevisionRequestedEmailContent(params: RevisionRequestedEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Revision requested: ${params.requestTitle}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #fff7ed; border-radius: 8px; padding: 24px; margin-bottom: 24px; border-left: 4px solid #f97316;">
    <h1 style="margin: 0 0 8px 0; font-size: 20px; color: #1a1a1a;">Revision Requested</h1>
    <p style="margin: 0; color: #f97316; font-weight: 600;">Revision #${params.revisionNumber}</p>
  </div>

  <div style="margin-bottom: 24px;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr>
        <td style="padding: 8px 0; color: #666; width: 120px;">Project</td>
        <td style="padding: 8px 0; font-weight: 500;">${params.requestTitle}</td>
      </tr>
    </table>
  </div>

  <div style="background: #f8f9fa; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
    <div style="font-size: 13px; color: #666; margin-bottom: 8px; font-weight: 500;">Revision Notes:</div>
    <div style="color: #333; white-space: pre-wrap;">${params.revisionNotes}</div>
  </div>

  <div style="font-size: 12px; color: #888; border-top: 1px solid #e5e7eb; padding-top: 16px;">
    <p>Please address the requested changes and resubmit for review.</p>
  </div>
</body>
</html>
  `.trim();

  const text = `Revision Requested: ${params.requestTitle}

Revision #${params.revisionNumber}

Revision Notes:
${params.revisionNotes}

Please address the requested changes and resubmit for review.
  `.trim();

  return { subject, html, text };
}

// ============================================================================
// Notification Functions
// ============================================================================

/**
 * Send organization invite email.
 * Fails safe: if email not configured, returns success with skipped=true.
 */
export async function sendInviteEmail(params: InviteEmailParams): Promise<ClientEmailResult> {
  const content = generateInviteEmailContent(params);

  const result = await sendEmailWithAudit(supabaseAdmin, {
    to: params.recipientEmail,
    subject: content.subject,
    html: content.html,
    text: content.text,
    templateKey: "org_invite",
    context: {
      org_name: params.orgName,
      role: params.role,
    },
  });

  return {
    sent: result.status === "sent",
    skipped: wasEmailSkipped(result),
    status: result.status,
    message: result.message,
  };
}

/**
 * Send invite resend email.
 * Same as sendInviteEmail but with different audit template key.
 */
export async function sendInviteResendEmail(params: InviteEmailParams): Promise<ClientEmailResult> {
  const content = generateInviteEmailContent(params);

  const result = await sendEmailWithAudit(supabaseAdmin, {
    to: params.recipientEmail,
    subject: content.subject,
    html: content.html,
    text: content.text,
    templateKey: "org_invite_resend",
    context: {
      org_name: params.orgName,
      role: params.role,
    },
  });

  return {
    sent: result.status === "sent",
    skipped: wasEmailSkipped(result),
    status: result.status,
    message: result.message,
  };
}

/**
 * Send client request status update email.
 * Fails safe: if email not configured, returns success with skipped=true.
 */
export async function sendRequestStatusEmail(params: RequestStatusEmailParams): Promise<ClientEmailResult> {
  const content = generateRequestStatusEmailContent(params);

  const result = await sendEmailWithAudit(supabaseAdmin, {
    to: params.recipientEmail,
    subject: content.subject,
    html: content.html,
    text: content.text,
    templateKey: "request_status_update",
    context: {
      request_id: params.requestId,
      new_status: params.newStatus,
      org_name: params.orgName,
    },
  });

  return {
    sent: result.status === "sent",
    skipped: wasEmailSkipped(result),
    status: result.status,
    message: result.message,
  };
}

/**
 * Send client request converted to video email.
 * Fails safe: if email not configured, returns success with skipped=true.
 */
export async function sendRequestConvertedEmail(params: RequestConvertedEmailParams): Promise<ClientEmailResult> {
  const content = generateRequestConvertedEmailContent(params);

  const result = await sendEmailWithAudit(supabaseAdmin, {
    to: params.recipientEmail,
    subject: content.subject,
    html: content.html,
    text: content.text,
    templateKey: "request_converted",
    context: {
      request_id: params.requestId,
      video_id: params.videoId,
      org_name: params.orgName,
    },
  });

  return {
    sent: result.status === "sent",
    skipped: wasEmailSkipped(result),
    status: result.status,
    message: result.message,
  };
}

/**
 * Send video ready for review email to client.
 * Notifies client when their edited video is ready for approval.
 */
export async function sendVideoReadyForReviewEmail(params: VideoReadyForReviewEmailParams): Promise<ClientEmailResult> {
  const content = generateVideoReadyForReviewEmailContent(params);

  const result = await sendEmailWithAudit(supabaseAdmin, {
    to: params.recipientEmail,
    subject: content.subject,
    html: content.html,
    text: content.text,
    templateKey: "video_ready_for_review",
    context: {
      request_id: params.requestId,
      title: params.requestTitle,
    },
  });

  return {
    sent: result.status === "sent",
    skipped: wasEmailSkipped(result),
    status: result.status,
    message: result.message,
  };
}

/**
 * Send video completed email to client.
 * Notifies client when their video has been approved and is complete.
 */
export async function sendVideoCompletedEmail(params: VideoCompletedEmailParams): Promise<ClientEmailResult> {
  const content = generateVideoCompletedEmailContent(params);

  const result = await sendEmailWithAudit(supabaseAdmin, {
    to: params.recipientEmail,
    subject: content.subject,
    html: content.html,
    text: content.text,
    templateKey: "video_completed",
    context: {
      request_id: params.requestId,
      title: params.requestTitle,
    },
  });

  return {
    sent: result.status === "sent",
    skipped: wasEmailSkipped(result),
    status: result.status,
    message: result.message,
  };
}

/**
 * Send revision requested email to editor.
 * Notifies editor when client requests changes to their video.
 */
export async function sendRevisionRequestedEmail(params: RevisionRequestedEmailParams): Promise<ClientEmailResult> {
  const content = generateRevisionRequestedEmailContent(params);

  const result = await sendEmailWithAudit(supabaseAdmin, {
    to: params.recipientEmail,
    subject: content.subject,
    html: content.html,
    text: content.text,
    templateKey: "video_revision_requested",
    context: {
      request_id: params.requestId,
      title: params.requestTitle,
      revision_number: params.revisionNumber,
    },
  });

  return {
    sent: result.status === "sent",
    skipped: wasEmailSkipped(result),
    status: result.status,
    message: result.message,
  };
}
