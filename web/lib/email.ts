/**
 * Email sender wrapper for SendGrid integration.
 * Fails safe: if email config is missing, returns "skipped" result.
 *
 * Resolution order: system_setting -> env -> default
 */

import { getEffectiveBoolean } from "@/lib/settings";

// SendGrid import - dynamic to avoid errors if package not installed
let sgMail: { setApiKey: (key: string) => void; send: (msg: object) => Promise<unknown> } | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sgMail = require("@sendgrid/mail");
} catch {
  // SendGrid not installed - email will be skipped
}

export interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  ok: boolean;
  status: "sent" | "skipped_no_config" | "skipped_no_recipient" | "skipped_disabled" | "failed";
  message?: string;
}

// Environment configuration (sync version)
export function getEmailConfigSync(): {
  enabled: boolean;
  apiKey: string | null;
  from: string;
  opsEmail: string | null;
  defaultAdminEmail: string | null;
} {
  const apiKey = process.env.SENDGRID_API_KEY || null;
  const explicitEnabled = process.env.EMAIL_ENABLED;

  // EMAIL_ENABLED defaults to true if SENDGRID_API_KEY exists, false otherwise
  let enabled = false;
  if (explicitEnabled !== undefined) {
    enabled = explicitEnabled === "true" || explicitEnabled === "1";
  } else if (apiKey) {
    enabled = true;
  }

  return {
    enabled,
    apiKey,
    from: process.env.EMAIL_FROM || "no-reply@tts-engine.local",
    opsEmail: process.env.OPS_EMAIL_TO || null,
    defaultAdminEmail: process.env.DEFAULT_ADMIN_EMAIL || null,
  };
}

/**
 * Get email configuration with system settings support.
 * Resolution order: system_setting -> env -> default
 */
export async function getEmailConfig(): Promise<{
  enabled: boolean;
  apiKey: string | null;
  from: string;
  opsEmail: string | null;
  defaultAdminEmail: string | null;
}> {
  const apiKey = process.env.SENDGRID_API_KEY || null;

  // Check system setting first (uses resolution: system_setting -> env -> default)
  let enabled = false;
  try {
    enabled = await getEffectiveBoolean("EMAIL_ENABLED");
  } catch {
    // Fallback to env-only logic on error
    const explicitEnabled = process.env.EMAIL_ENABLED;
    if (explicitEnabled !== undefined) {
      enabled = explicitEnabled === "true" || explicitEnabled === "1";
    } else if (apiKey) {
      enabled = true;
    }
  }

  return {
    enabled,
    apiKey,
    from: process.env.EMAIL_FROM || "no-reply@tts-engine.local",
    opsEmail: process.env.OPS_EMAIL_TO || null,
    defaultAdminEmail: process.env.DEFAULT_ADMIN_EMAIL || null,
  };
}

/**
 * Check if email sending is available (sync version for backwards compat)
 */
export function isEmailEnabledSync(): boolean {
  const config = getEmailConfigSync();
  return config.enabled && config.apiKey !== null && sgMail !== null;
}

/**
 * Check if email sending is available
 * Resolution order: system_setting -> env -> default
 */
export async function isEmailEnabled(): Promise<boolean> {
  const config = await getEmailConfig();
  return config.enabled && config.apiKey !== null && sgMail !== null;
}

/**
 * Send an email using SendGrid.
 * Returns a result object indicating success or skip reason.
 */
export async function sendEmail(params: EmailParams): Promise<EmailResult> {
  const config = await getEmailConfig();

  // Check if email is disabled
  if (!config.enabled) {
    return { ok: true, status: "skipped_disabled", message: "Email is disabled" };
  }

  // Check for missing config
  if (!config.apiKey) {
    return { ok: true, status: "skipped_no_config", message: "SENDGRID_API_KEY not configured" };
  }

  // Check if SendGrid module is available
  if (!sgMail) {
    return { ok: true, status: "skipped_no_config", message: "SendGrid module not installed" };
  }

  // Validate recipient
  if (!params.to || !params.to.includes("@")) {
    return { ok: true, status: "skipped_no_recipient", message: "Invalid or missing recipient email" };
  }

  try {
    sgMail.setApiKey(config.apiKey);

    const msg = {
      to: params.to,
      from: config.from,
      subject: params.subject,
      html: params.html,
      text: params.text || params.html.replace(/<[^>]*>/g, ""), // Strip HTML for text fallback
    };

    await sgMail.send(msg);
    return { ok: true, status: "sent", message: `Email sent to ${params.to}` };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Email send failed:", errorMessage);
    return { ok: false, status: "failed", message: errorMessage };
  }
}

/**
 * Get admin email recipient (for audit notifications).
 * Returns OPS_EMAIL_TO > DEFAULT_ADMIN_EMAIL > null
 */
export function getAdminEmailRecipient(): string | null {
  const config = getEmailConfigSync();
  return config.opsEmail || config.defaultAdminEmail || null;
}

/**
 * Simple email cooldown check using events table.
 * Returns true if an email was sent recently (within cooldown period).
 * This prevents duplicate emails in tight loops.
 */
export async function checkEmailCooldown(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  eventType: string,
  videoId: string,
  recipientEmail: string,
  cooldownSeconds: number = 60
): Promise<boolean> {
  const cooldownTime = new Date(Date.now() - cooldownSeconds * 1000).toISOString();

  try {
    const { data } = await supabaseAdmin
      .from("video_events")
      .select("id")
      .eq("event_type", `email_sent_${eventType}`)
      .eq("video_id", videoId)
      .gte("created_at", cooldownTime)
      .limit(1);

    return data !== null && data.length > 0;
  } catch {
    // If check fails, allow email to proceed (fail open)
    return false;
  }
}
