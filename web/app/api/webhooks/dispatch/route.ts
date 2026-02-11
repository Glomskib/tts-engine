import { NextRequest, NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";

export const runtime = "nodejs";

/**
 * Supported dispatch events and their Telegram message formatters.
 * Each formatter receives `data` from the request body and returns
 * the HTML-formatted message string to send via Telegram.
 */
const EVENT_FORMATTERS: Record<
  string,
  (data: Record<string, unknown>) => string
> = {
  video_status_changed: (data) =>
    `\u{1F4F9} Video moved to ${data.status ?? "unknown"}: ${data.product_name ?? "Untitled"}`,

  winner_detected: (data) =>
    `\u{1F3C6} New winner! ${data.hook ?? "Unknown hook"} \u2014 ${data.views ?? 0} views`,

  pipeline_empty: (data) =>
    `\u26A0\uFE0F Pipeline empty for ${data.brand ?? "Unknown brand"} \u2014 generate more content?`,

  va_submitted: (data) =>
    `\u2705 VA submitted video for review: ${data.product_name ?? "Untitled"}`,

  content_package_ready: (data) =>
    `\u{1F4E6} Daily content package ready: ${data.count ?? 0} scripts generated`,

  daily_summary: (data) =>
    `\u{1F4CA} Daily Summary: ${data.videos_created ?? 0} created, ${data.videos_posted ?? 0} posted, ${data.total_views ?? 0} views`,
};

const SUPPORTED_EVENTS = Object.keys(EVENT_FORMATTERS);

/**
 * POST /api/webhooks/dispatch — dispatch a webhook event to Telegram
 */
export async function POST(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  try {
    // 1. Auth check
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse(
        "UNAUTHORIZED",
        "Authentication required",
        401,
        correlationId
      );
    }

    // 2. Parse and validate body
    let body: { event?: string; data?: Record<string, unknown> };
    try {
      body = await request.json();
    } catch {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "Invalid JSON body",
        400,
        correlationId
      );
    }

    const { event, data } = body;

    if (!event || typeof event !== "string") {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "Missing or invalid 'event' field",
        400,
        correlationId
      );
    }

    if (!data || typeof data !== "object") {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "Missing or invalid 'data' field",
        400,
        correlationId
      );
    }

    // 3. Check event is supported
    const formatter = EVENT_FORMATTERS[event];
    if (!formatter) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        `Unsupported event '${event}'. Supported events: ${SUPPORTED_EVENTS.join(", ")}`,
        400,
        correlationId
      );
    }

    // 4. Get Telegram config from environment
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return createApiErrorResponse(
        "CONFIG_ERROR",
        "Telegram configuration is incomplete. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.",
        503,
        correlationId
      );
    }

    // 5. Format the message and send to Telegram
    const message = formatter(data);

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const telegramResponse = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const telegramResult = await telegramResponse.json().catch(() => null);

    if (!telegramResponse.ok) {
      console.error(
        `[${correlationId}] Telegram send failed:`,
        telegramResult
      );
      return createApiErrorResponse(
        "INTERNAL",
        `Telegram API error: ${telegramResult?.description || "Unknown error"}`,
        502,
        correlationId
      );
    }

    // 6. Log the dispatch (best-effort insert into webhook_deliveries)
    await supabaseAdmin
      .from("webhook_deliveries")
      .insert({
        webhook_id: null,
        event: `telegram.${event}`,
        payload: { event, data, message },
        status_code: telegramResponse.status,
        response_body: JSON.stringify(telegramResult).slice(0, 1000),
        duration_ms: 0,
        success: true,
      })
      .then(({ error }) => {
        if (error) {
          // Non-fatal — log and continue
          console.warn(
            `[${correlationId}] Failed to log dispatch:`,
            error.message
          );
        }
      });

    // 7. Return success
    return NextResponse.json({
      ok: true,
      data: {
        dispatched: true,
        event,
        message,
      },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Webhook dispatch error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      "Internal server error",
      500,
      correlationId
    );
  }
}

/**
 * GET /api/webhooks/dispatch — returns Telegram configuration status
 */
export async function GET(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse(
        "UNAUTHORIZED",
        "Authentication required",
        401,
        correlationId
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    return NextResponse.json({
      ok: true,
      data: {
        telegram_configured: Boolean(botToken && chatId),
        bot_token_set: Boolean(botToken),
        chat_id_set: Boolean(chatId),
        supported_events: SUPPORTED_EVENTS,
      },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Webhook dispatch GET error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      "Internal server error",
      500,
      correlationId
    );
  }
}
