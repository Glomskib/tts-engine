/**
 * Script of the Day — SMS Formatting Endpoint
 *
 * GET  — Returns today's script formatted for SMS (< 1000 chars)
 * POST — (Future) Sends via Twilio/Telegram
 *
 * Format:
 *   HOOK | key talking points | product | which account to post to
 */

import { NextRequest, NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";

export const runtime = "nodejs";

interface SkitBeat {
  t?: string;
  action?: string;
  dialogue?: string;
  on_screen_text?: string;
}

// ---------------------------------------------------------------------------
// GET — Return SMS-formatted script
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: script, error } = await supabaseAdmin
    .from("script_of_the_day")
    .select("*")
    .eq("user_id", authContext.user.id)
    .eq("script_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  if (!script) {
    return createApiErrorResponse("NOT_FOUND", "No script of the day generated yet", 404, correlationId);
  }

  const smsText = formatForSMS(script);

  const res = NextResponse.json({
    ok: true,
    data: {
      sms_text: smsText,
      char_count: smsText.length,
      script_id: script.id,
      product_name: script.product_name,
    },
    correlation_id: correlationId,
  });
  res.headers.set("x-correlation-id", correlationId);
  return res;
}

// ---------------------------------------------------------------------------
// POST — Send SMS (stub for Twilio integration)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  let body: { phone?: string; channel?: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: script } = await supabaseAdmin
    .from("script_of_the_day")
    .select("*")
    .eq("user_id", authContext.user.id)
    .eq("script_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!script) {
    return createApiErrorResponse("NOT_FOUND", "No script of the day to send", 404, correlationId);
  }

  const smsText = formatForSMS(script);
  const channel = body.channel || "telegram";

  // Future: Twilio integration
  // For now, dispatch via webhook/telegram bridge
  if (channel === "telegram") {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://flashflowai.com");

    await fetch(`${baseUrl}/api/webhooks/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
        authorization: request.headers.get("authorization") || "",
      },
      body: JSON.stringify({
        event: "daily_summary",
        payload: {
          title: "Script of the Day",
          message: smsText,
        },
      }),
    }).catch(() => {
      // Non-blocking — don't fail the request if telegram is down
    });
  }

  const res = NextResponse.json({
    ok: true,
    data: {
      sent: true,
      channel,
      char_count: smsText.length,
      phone: body.phone ? `***${body.phone.slice(-4)}` : null,
    },
    correlation_id: correlationId,
  });
  res.headers.set("x-correlation-id", correlationId);
  return res;
}

// ---------------------------------------------------------------------------
// Format a script_of_the_day record into SMS-friendly text (< 1000 chars)
// ---------------------------------------------------------------------------
function formatForSMS(script: Record<string, unknown>): string {
  let skit: { hook_line?: string; beats?: SkitBeat[]; cta_line?: string };
  try {
    const raw = script.full_script;
    skit = typeof raw === "string" ? JSON.parse(raw) : (raw as typeof skit) || {};
  } catch {
    skit = {};
  }

  const parts: string[] = [];

  // Header
  parts.push(`SCRIPT OF THE DAY`);
  parts.push(`Product: ${script.product_name || "Unknown"}`);
  if (script.product_brand) parts.push(`Brand: ${script.product_brand}`);
  parts.push("");

  // Hook
  const hook = (script.hook as string) || skit.hook_line || "";
  if (hook) {
    parts.push(`HOOK: "${hook}"`);
    parts.push("");
  }

  // Winner remix note
  if (script.winner_remix_hook) {
    parts.push(`Based on winner: "${(script.winner_remix_hook as string).slice(0, 60)}"`);
    parts.push("");
  }

  // Key talking points (extract dialogue from beats)
  const talkingPoints = (skit.beats || [])
    .filter((b) => b.dialogue)
    .map((b) => `- ${b.dialogue}`)
    .slice(0, 4);

  if (talkingPoints.length > 0) {
    parts.push("KEY POINTS:");
    parts.push(...talkingPoints);
    parts.push("");
  }

  // CTA
  if (skit.cta_line) {
    parts.push(`CTA: ${skit.cta_line}`);
    parts.push("");
  }

  // Account
  if (script.suggested_account_name) {
    parts.push(`Post to: ${script.suggested_account_name}`);
  }

  // Assemble and trim to 1000 chars
  let text = parts.join("\n");
  if (text.length > 1000) {
    text = text.slice(0, 997) + "...";
  }

  return text;
}
