/**
 * System Settings Resolver
 * Manages runtime-configurable settings stored in events_log table.
 * Settings override env defaults only when explicitly set.
 * Fail-safe: if no settings configured, existing env behavior remains.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Allowed setting keys (to prevent abuse)
export const ALLOWED_SETTING_KEYS = [
  "SUBSCRIPTION_GATING_ENABLED",
  "EMAIL_ENABLED",
  "SLACK_ENABLED",
  "ASSIGNMENT_TTL_MINUTES",
  "SLACK_OPS_EVENTS",
  "ANALYTICS_DEFAULT_WINDOW_DAYS",
  "INCIDENT_MODE_ENABLED",
  "INCIDENT_MODE_MESSAGE",
  "INCIDENT_MODE_READ_ONLY",
  "INCIDENT_MODE_ALLOWLIST_USER_IDS",
  // WIP Limits (Work-in-Progress)
  "WIP_LIMIT_EDITOR",
  "WIP_LIMIT_UPLOADER",
  "WIP_LIMIT_RECORDER",
  "WIP_LIMIT_DEFAULT",
  // Lease management
  "LEASE_DURATION_MINUTES",
  "RENEW_WINDOW_MINUTES",
  // Observability thresholds
  "CLAIM_EXPIRING_SOON_MINUTES",
  "STUCK_THRESHOLD_HOURS",
  "ACTIVITY_STALE_HOURS",
  "THROUGHPUT_WINDOW_DAYS",
] as const;

export type SettingKey = typeof ALLOWED_SETTING_KEYS[number];

export type SettingValue = string | number | boolean | string[];

export interface SystemSetting {
  key: SettingKey;
  value: SettingValue;
  updated_at: string;
  updated_by: string | null;
}

export interface EffectiveSetting {
  key: SettingKey;
  effective_value: SettingValue;
  source: "system_setting" | "env_default";
  last_updated_at: string | null;
}

// Default values for settings (used when neither system setting nor env is set)
const DEFAULT_VALUES: Record<SettingKey, SettingValue> = {
  SUBSCRIPTION_GATING_ENABLED: false,
  EMAIL_ENABLED: false,
  SLACK_ENABLED: false,
  ASSIGNMENT_TTL_MINUTES: 240,
  SLACK_OPS_EVENTS: [
    "assignment_expired",
    "admin_force_status",
    "admin_clear_claim",
    "admin_reset_assignments",
    "assignment_reassigned",
    "admin_set_plan",
    "user_upgrade_requested",
    "user_upgrade_request_resolved",
  ],
  ANALYTICS_DEFAULT_WINDOW_DAYS: 7,
  INCIDENT_MODE_ENABLED: false,
  INCIDENT_MODE_MESSAGE: "System is currently in maintenance mode.",
  INCIDENT_MODE_READ_ONLY: false,
  INCIDENT_MODE_ALLOWLIST_USER_IDS: [],
  // WIP Limits - sensible defaults to prevent throughput collapse
  WIP_LIMIT_EDITOR: 5,
  WIP_LIMIT_UPLOADER: 5,
  WIP_LIMIT_RECORDER: 5,
  WIP_LIMIT_DEFAULT: 5,
  // Lease management
  LEASE_DURATION_MINUTES: 240, // 4 hours default
  RENEW_WINDOW_MINUTES: 5, // renew if expiring within 5 minutes
  // Observability thresholds
  CLAIM_EXPIRING_SOON_MINUTES: 15, // claims expiring within 15 minutes
  STUCK_THRESHOLD_HOURS: 24, // videos stuck in queue for 24+ hours
  ACTIVITY_STALE_HOURS: 4, // no activity in 4+ hours is stale
  THROUGHPUT_WINDOW_DAYS: 7, // default window for throughput metrics
};

/**
 * Check if a key is an allowed setting key.
 */
export function isAllowedSettingKey(key: string): key is SettingKey {
  return ALLOWED_SETTING_KEYS.includes(key as SettingKey);
}

/**
 * Get the environment variable value for a setting key.
 */
function getEnvValue(key: SettingKey): SettingValue | undefined {
  const envValue = process.env[key];
  if (envValue === undefined) {
    return undefined;
  }

  // Parse based on expected type
  switch (key) {
    case "SUBSCRIPTION_GATING_ENABLED":
    case "EMAIL_ENABLED":
    case "SLACK_ENABLED":
    case "INCIDENT_MODE_ENABLED":
    case "INCIDENT_MODE_READ_ONLY":
      return envValue === "true" || envValue === "1";

    case "ASSIGNMENT_TTL_MINUTES":
    case "ANALYTICS_DEFAULT_WINDOW_DAYS":
    case "WIP_LIMIT_EDITOR":
    case "WIP_LIMIT_UPLOADER":
    case "WIP_LIMIT_RECORDER":
    case "WIP_LIMIT_DEFAULT":
    case "LEASE_DURATION_MINUTES":
    case "RENEW_WINDOW_MINUTES":
    case "CLAIM_EXPIRING_SOON_MINUTES":
    case "STUCK_THRESHOLD_HOURS":
    case "ACTIVITY_STALE_HOURS":
    case "THROUGHPUT_WINDOW_DAYS":
      const num = parseInt(envValue, 10);
      return isNaN(num) ? undefined : num;

    case "SLACK_OPS_EVENTS":
    case "INCIDENT_MODE_ALLOWLIST_USER_IDS":
      try {
        const parsed = JSON.parse(envValue);
        return Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return envValue.split(",").map((s) => s.trim());
      }

    case "INCIDENT_MODE_MESSAGE":
      return envValue;

    default:
      return envValue;
  }
}

/**
 * Get a system setting from the database (most recent value for key).
 * Returns null if no system setting exists for this key.
 */
export async function getSystemSetting(key: SettingKey): Promise<SystemSetting | null> {
  try {
    // Get the most recent setting for this key from events_log
    const { data, error } = await supabaseAdmin
      .from("events_log")
      .select("payload, created_at")
      .eq("entity_type", "system")
      .eq("entity_id", key)
      .eq("event_type", "system_setting_set")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching system settings:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    const payload = data.payload as Record<string, unknown> | null;
    return {
      key,
      value: payload?.value as SettingValue,
      updated_at: data.created_at,
      updated_by: payload?.updated_by as string | null,
    };
  } catch (err) {
    console.error("Error in getSystemSetting:", err);
    return null;
  }
}

/**
 * Get the effective value for a setting.
 * Resolution order: system_setting -> env -> default
 */
export async function getEffectiveSetting(key: SettingKey): Promise<EffectiveSetting> {
  // Check system setting first
  const systemSetting = await getSystemSetting(key);
  if (systemSetting !== null) {
    return {
      key,
      effective_value: systemSetting.value,
      source: "system_setting",
      last_updated_at: systemSetting.updated_at,
    };
  }

  // Check env variable
  const envValue = getEnvValue(key);
  if (envValue !== undefined) {
    return {
      key,
      effective_value: envValue,
      source: "env_default",
      last_updated_at: null,
    };
  }

  // Return default
  return {
    key,
    effective_value: DEFAULT_VALUES[key],
    source: "env_default",
    last_updated_at: null,
  };
}

/**
 * Get all effective settings.
 */
export async function getAllEffectiveSettings(): Promise<EffectiveSetting[]> {
  const settings: EffectiveSetting[] = [];

  for (const key of ALLOWED_SETTING_KEYS) {
    const setting = await getEffectiveSetting(key);
    settings.push(setting);
  }

  return settings;
}

/**
 * Get the effective boolean value for a setting.
 * Convenience wrapper for boolean settings.
 */
export async function getEffectiveBoolean(key: SettingKey): Promise<boolean> {
  const setting = await getEffectiveSetting(key);
  return Boolean(setting.effective_value);
}

/**
 * Get the effective number value for a setting.
 * Convenience wrapper for number settings.
 */
export async function getEffectiveNumber(key: SettingKey): Promise<number> {
  const setting = await getEffectiveSetting(key);
  const value = setting.effective_value;
  return typeof value === "number" ? value : parseInt(String(value), 10) || 0;
}

/**
 * Get the effective string array value for a setting.
 * Convenience wrapper for array settings.
 */
export async function getEffectiveStringArray(key: SettingKey): Promise<string[]> {
  const setting = await getEffectiveSetting(key);
  const value = setting.effective_value;
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim());
  }
  return [];
}

/**
 * Get the effective assignment TTL in minutes.
 * Resolution order: system_setting -> env -> default (240 minutes = 4 hours)
 */
export async function getAssignmentTtlMinutes(): Promise<number> {
  return getEffectiveNumber("ASSIGNMENT_TTL_MINUTES");
}

/**
 * Set a system setting (writes to video_events).
 * Returns the created event ID.
 */
export async function setSystemSetting(
  key: SettingKey,
  value: SettingValue,
  actor: string,
  correlationId?: string
): Promise<{ ok: boolean; error?: string; eventId?: string }> {
  if (!isAllowedSettingKey(key)) {
    return { ok: false, error: `Invalid setting key: ${key}` };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("events_log")
      .insert({
        entity_type: "system",
        entity_id: key,
        event_type: "system_setting_set",
        payload: {
          value,
          scope: "global",
          updated_by: actor,
          updated_at: new Date().toISOString(),
        },
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error setting system setting:", error);
      return { ok: false, error: error.message };
    }

    return { ok: true, eventId: data?.id };
  } catch (err) {
    console.error("Error in setSystemSetting:", err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Get the effective string value for a setting.
 * Convenience wrapper for string settings.
 */
export async function getEffectiveString(key: SettingKey): Promise<string> {
  const setting = await getEffectiveSetting(key);
  const value = setting.effective_value;
  return typeof value === "string" ? value : String(value);
}

// ============================================
// Incident Mode Helpers
// ============================================

export interface IncidentModeStatus {
  enabled: boolean;
  message: string;
  readOnly: boolean;
  allowlistUserIds: string[];
}

/**
 * Get current incident mode status.
 * Fail-safe: returns disabled if any error.
 */
export async function getIncidentModeStatus(): Promise<IncidentModeStatus> {
  try {
    const [enabled, message, readOnly, allowlist] = await Promise.all([
      getEffectiveBoolean("INCIDENT_MODE_ENABLED"),
      getEffectiveString("INCIDENT_MODE_MESSAGE"),
      getEffectiveBoolean("INCIDENT_MODE_READ_ONLY"),
      getEffectiveStringArray("INCIDENT_MODE_ALLOWLIST_USER_IDS"),
    ]);

    return {
      enabled,
      message,
      readOnly,
      allowlistUserIds: allowlist.map((id) => id.toLowerCase()),
    };
  } catch (err) {
    console.error("Error getting incident mode status:", err);
    return {
      enabled: false,
      message: "",
      readOnly: false,
      allowlistUserIds: [],
    };
  }
}

/**
 * Check if a user is blocked by incident read-only mode.
 * Returns { blocked: false } if:
 *   - Incident mode is not enabled
 *   - Read-only mode is not enabled
 *   - User is an admin
 *   - User is on the allowlist
 * Returns { blocked: true, message } otherwise.
 */
export async function checkIncidentReadOnlyBlock(
  userId: string,
  isAdmin: boolean
): Promise<{ blocked: boolean; message?: string }> {
  // Admins always bypass
  if (isAdmin) {
    return { blocked: false };
  }

  const status = await getIncidentModeStatus();

  // If incident mode not enabled, no block
  if (!status.enabled) {
    return { blocked: false };
  }

  // If read-only not enabled, no block (banner still shows)
  if (!status.readOnly) {
    return { blocked: false };
  }

  // Check allowlist
  const normalizedUserId = userId.toLowerCase();
  if (status.allowlistUserIds.includes(normalizedUserId)) {
    return { blocked: false };
  }

  // User is blocked
  return {
    blocked: true,
    message: status.message || "System is in maintenance mode.",
  };
}

// ============================================
// WIP (Work-in-Progress) Limit Helpers
// ============================================

export type WipRole = "editor" | "uploader" | "recorder" | "admin";

/**
 * Get WIP limit for a specific role.
 * Returns 0 for admin (unlimited).
 * Fail-safe: returns default if any error.
 */
export async function getWipLimitForRole(role: WipRole): Promise<number> {
  // Admins have no WIP limit
  if (role === "admin") {
    return 0;
  }

  try {
    const roleKey = `WIP_LIMIT_${role.toUpperCase()}` as SettingKey;
    if (ALLOWED_SETTING_KEYS.includes(roleKey)) {
      return getEffectiveNumber(roleKey);
    }
    // Fallback to default WIP limit
    return getEffectiveNumber("WIP_LIMIT_DEFAULT");
  } catch (err) {
    console.error("Error getting WIP limit:", err);
    return DEFAULT_VALUES.WIP_LIMIT_DEFAULT as number;
  }
}

/**
 * Get lease duration in minutes.
 */
export async function getLeaseDurationMinutes(): Promise<number> {
  return getEffectiveNumber("LEASE_DURATION_MINUTES");
}

/**
 * Get renew window in minutes.
 * Claims expiring within this window will be renewed by bulk renew.
 */
export async function getRenewWindowMinutes(): Promise<number> {
  return getEffectiveNumber("RENEW_WINDOW_MINUTES");
}

// ============================================
// Observability Threshold Helpers
// ============================================

/**
 * Get claim expiring soon threshold in minutes.
 * Claims expiring within this window are considered "expiring soon".
 */
export async function getClaimExpiringSoonMinutes(): Promise<number> {
  return getEffectiveNumber("CLAIM_EXPIRING_SOON_MINUTES");
}

/**
 * Get stuck threshold in hours.
 * Videos in queue for longer than this are considered "stuck".
 */
export async function getStuckThresholdHours(): Promise<number> {
  return getEffectiveNumber("STUCK_THRESHOLD_HOURS");
}

/**
 * Get activity stale threshold in hours.
 * Videos with no activity for longer than this are considered "stale".
 */
export async function getActivityStaleHours(): Promise<number> {
  return getEffectiveNumber("ACTIVITY_STALE_HOURS");
}

/**
 * Get default throughput window in days.
 */
export async function getThroughputWindowDays(): Promise<number> {
  return getEffectiveNumber("THROUGHPUT_WINDOW_DAYS");
}
