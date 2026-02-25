/**
 * GET /api/admin/reminder-health
 *
 * Admin-only endpoint to check Telegram reminder system health:
 *   - Feature flag status
 *   - Bot/chat configuration
 *   - Sanitizer stats
 *   - Last send event from events_log
 */
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  createApiErrorResponse,
  generateCorrelationId,
} from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  remindersEnabled,
  MAX_LINES,
  SANITIZER_PATTERN_COUNT,
} from "@/lib/telegram";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId,
    );
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse(
      "FORBIDDEN",
      "Admin access required",
      403,
      correlationId,
    );
  }

  // Fetch last telegram_send event (best-effort)
  let lastSend: Record<string, unknown> | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("events_log")
      .select("payload, created_at")
      .eq("event_type", "telegram_send")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (data?.payload) {
      const p = data.payload as Record<string, unknown>;
      lastSend = {
        timestamp: p.timestamp ?? data.created_at,
        fingerprint: p.fingerprint ?? null,
        success: p.success ?? null,
        error: p.error ?? null,
      };
    }
  } catch {
    // Table may not exist or no rows — fine
  }

  return NextResponse.json({
    ok: true,
    enabled: remindersEnabled(),
    config: {
      bot_token_set: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      main_chat_id_set: Boolean(process.env.TELEGRAM_CHAT_ID),
      log_chat_id_set: Boolean(process.env.TELEGRAM_LOG_CHAT_ID),
      max_lines: MAX_LINES,
      sanitizer_pattern_count: SANITIZER_PATTERN_COUNT,
    },
    last_send: lastSend,
    correlation_id: correlationId,
  });
}
