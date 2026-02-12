import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { isAllowedSettingKey, setSystemSetting, type SettingKey, type SettingValue } from "@/lib/settings";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";

/**
 * POST /api/admin/settings/set
 * Admin-only endpoint to set/update a system setting.
 *
 * Body: { key: string, value: any }
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Admin-only
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const { key, value } = body as Record<string, unknown>;

  // Validate key
  if (!key || typeof key !== "string") {
    return createApiErrorResponse("BAD_REQUEST", "key is required", 400, correlationId);
  }

  if (!isAllowedSettingKey(key)) {
    return createApiErrorResponse("BAD_REQUEST", `Invalid setting key: ${key}. Allowed keys: SUBSCRIPTION_GATING_ENABLED, EMAIL_ENABLED, SLACK_ENABLED, ASSIGNMENT_TTL_MINUTES, SLACK_OPS_EVENTS, ANALYTICS_DEFAULT_WINDOW_DAYS`, 400, correlationId);
  }

  // Validate value based on key type
  const settingKey = key as SettingKey;
  let settingValue: SettingValue;

  switch (settingKey) {
    case "SUBSCRIPTION_GATING_ENABLED":
    case "EMAIL_ENABLED":
    case "SLACK_ENABLED":
      if (typeof value !== "boolean") {
        return createApiErrorResponse("BAD_REQUEST", `${key} must be a boolean`, 400, correlationId);
      }
      settingValue = value;
      break;

    case "ASSIGNMENT_TTL_MINUTES":
      if (typeof value !== "number" || value < 1 || value > 10080) {
        return createApiErrorResponse("BAD_REQUEST", `${key} must be a number between 1 and 10080 (7 days)`, 400, correlationId);
      }
      settingValue = value;
      break;

    case "SLACK_OPS_EVENTS":
      if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
        return createApiErrorResponse("BAD_REQUEST", `${key} must be an array of strings`, 400, correlationId);
      }
      settingValue = value;
      break;

    case "ANALYTICS_DEFAULT_WINDOW_DAYS":
      if (typeof value !== "number" || ![7, 14, 30].includes(value)) {
        return createApiErrorResponse("BAD_REQUEST", `${key} must be 7, 14, or 30`, 400, correlationId);
      }
      settingValue = value;
      break;

    default:
      settingValue = value as SettingValue;
  }

  try {
    const result = await setSystemSetting(
      settingKey,
      settingValue,
      authContext.user.id,
      correlationId
    );

    if (!result.ok) {
      return createApiErrorResponse("DB_ERROR", result.error || "Failed to set setting", 500, correlationId);
    }

    // Notify ops (optional, fail-safe)
    try {
      notify("admin_force_status", {
        performedBy: authContext.user.email || authContext.user.id,
        reason: `System setting changed: ${settingKey} = ${JSON.stringify(settingValue)}`,
      });
    } catch {
      // Ignore notification errors
    }

    return NextResponse.json({
      ok: true,
      data: {
        key: settingKey,
        value: settingValue,
        event_id: result.eventId,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/admin/settings/set error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
