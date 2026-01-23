/**
 * Slack notification sender (optional, fail-safe).
 * If SLACK_WEBHOOK_URL is not configured, all sends return "skipped" status.
 *
 * Resolution order: system_setting -> env -> default
 */

import { getEffectiveBoolean } from "@/lib/settings";

export interface SlackParams {
  text: string;
  blocks?: SlackBlock[];
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: unknown[];
  accessory?: unknown;
  fields?: unknown[];
}

export interface SlackResult {
  ok: boolean;
  status: "sent" | "skipped_no_config" | "skipped_disabled" | "failed";
  message?: string;
}

/**
 * Get Slack configuration from environment variables (sync version).
 */
export function getSlackConfigSync(): {
  enabled: boolean;
  webhookUrl: string | null;
} {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL || null;
  const explicitEnabled = process.env.SLACK_ENABLED;

  // SLACK_ENABLED defaults to true if SLACK_WEBHOOK_URL exists, false otherwise
  let enabled = false;
  if (explicitEnabled !== undefined) {
    enabled = explicitEnabled === "true" || explicitEnabled === "1";
  } else if (webhookUrl) {
    enabled = true;
  }

  return {
    enabled,
    webhookUrl,
  };
}

/**
 * Get Slack configuration with system settings support.
 * Resolution order: system_setting -> env -> default
 */
export async function getSlackConfig(): Promise<{
  enabled: boolean;
  webhookUrl: string | null;
}> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL || null;

  // Check system setting first (uses resolution: system_setting -> env -> default)
  let enabled = false;
  try {
    enabled = await getEffectiveBoolean("SLACK_ENABLED");
  } catch {
    // Fallback to env-only logic on error
    const explicitEnabled = process.env.SLACK_ENABLED;
    if (explicitEnabled !== undefined) {
      enabled = explicitEnabled === "true" || explicitEnabled === "1";
    } else if (webhookUrl) {
      enabled = true;
    }
  }

  return {
    enabled,
    webhookUrl,
  };
}

/**
 * Check if Slack notifications are enabled (sync version for backwards compat).
 */
export function isSlackEnabledSync(): boolean {
  const config = getSlackConfigSync();
  return config.enabled && config.webhookUrl !== null;
}

/**
 * Check if Slack notifications are enabled.
 * Resolution order: system_setting -> env -> default
 */
export async function isSlackEnabled(): Promise<boolean> {
  const config = await getSlackConfig();
  return config.enabled && config.webhookUrl !== null;
}

/**
 * Send a message to Slack via webhook.
 * Returns a result object indicating success or skip reason.
 */
export async function sendSlack(params: SlackParams): Promise<SlackResult> {
  const config = await getSlackConfig();

  // Check if Slack is disabled
  if (!config.enabled) {
    return { ok: true, status: "skipped_disabled", message: "Slack is disabled" };
  }

  // Check for missing webhook URL
  if (!config.webhookUrl) {
    return { ok: true, status: "skipped_no_config", message: "SLACK_WEBHOOK_URL not configured" };
  }

  // Validate text
  if (!params.text || params.text.trim().length === 0) {
    return { ok: true, status: "skipped_no_config", message: "Empty message text" };
  }

  try {
    const payload: { text: string; blocks?: SlackBlock[] } = {
      text: params.text,
    };

    if (params.blocks && params.blocks.length > 0) {
      payload.blocks = params.blocks;
    }

    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return { ok: true, status: "sent", message: "Slack message sent" };
    } else {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("Slack send failed:", response.status, errorText);
      return { ok: false, status: "failed", message: `HTTP ${response.status}: ${errorText}` };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Slack send error:", errorMessage);
    return { ok: false, status: "failed", message: errorMessage };
  }
}

/**
 * Build a simple Slack message with header and details.
 */
export function buildSlackMessage(
  title: string,
  details: Record<string, string | number | null | undefined>
): SlackParams {
  const detailLines = Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `*${k}:* ${v}`)
    .join("\n");

  return {
    text: title,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: title,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: detailLines || "_No details_",
        },
      },
    ],
  };
}
