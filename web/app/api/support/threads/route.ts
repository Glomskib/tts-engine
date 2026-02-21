import { NextRequest, NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { sendTelegramNotification } from "@/lib/telegram";

export const runtime = "nodejs";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const userId = authContext.user.id;
  const isAdmin = request.nextUrl.searchParams.get("admin") === "true";

  if (isAdmin) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ ok: true, data: [], correlation_id: correlationId });
    }

    const statusFilter = request.nextUrl.searchParams.get("status");
    const priorityFilter = request.nextUrl.searchParams.get("priority");
    const search = request.nextUrl.searchParams.get("search");

    let query = supabaseAdmin
      .from("support_threads")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200);

    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (priorityFilter && priorityFilter !== "all") {
      query = query.eq("priority", priorityFilter);
    }
    if (search) {
      query = query.ilike("subject", `%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
    }

    // Stats
    const { data: allThreads } = await supabaseAdmin
      .from("support_threads")
      .select("status, created_at");

    const today = new Date().toISOString().split("T")[0];
    const stats = {
      open: allThreads?.filter((t) => t.status === "open").length || 0,
      waiting: allThreads?.filter((t) => t.status === "waiting_on_customer").length || 0,
      resolved_today: allThreads?.filter((t) => t.status === "resolved" && t.created_at?.startsWith(today)).length || 0,
      total: allThreads?.length || 0,
    };

    return NextResponse.json({ ok: true, data: data || [], stats, correlation_id: correlationId });
  }

  // Regular user — fetch own threads
  const { data, error } = await supabaseAdmin
    .from("support_threads")
    .select("id, subject, status, priority, last_message_at, created_at")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(50);

  if (error) {
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data: data || [], correlation_id: correlationId });
}

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    const body = await request.json();
    const { subject, message } = body;

    if (!subject || subject.length < 3 || subject.length > 200) {
      return createApiErrorResponse("VALIDATION_ERROR", "Subject must be 3-200 characters", 400, correlationId);
    }
    if (!message || message.length < 5 || message.length > 5000) {
      return createApiErrorResponse("VALIDATION_ERROR", "Message must be 5-5000 characters", 400, correlationId);
    }

    const userId = authContext.user.id;
    const userEmail = authContext.user.email || null;

    // Create thread
    const { data: thread, error: threadError } = await supabaseAdmin
      .from("support_threads")
      .insert({
        user_id: userId,
        user_email: userEmail,
        subject,
        status: "open",
        priority: "normal",
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (threadError) {
      return createApiErrorResponse("DB_ERROR", threadError.message, 500, correlationId);
    }

    // Create first message
    const { error: msgError } = await supabaseAdmin
      .from("support_messages")
      .insert({
        thread_id: thread.id,
        sender_type: "user",
        sender_id: userId,
        sender_email: userEmail,
        body: message,
        is_internal: false,
      });

    if (msgError) {
      return createApiErrorResponse("DB_ERROR", msgError.message, 500, correlationId);
    }

    // Send Telegram notification
    const preview = message.length > 200 ? message.slice(0, 200) + "..." : message;
    sendTelegramNotification(
      `🎫 <b>New support thread</b> from ${escapeHtml(userEmail || "anonymous")}\n` +
      `<b>Subject:</b> ${escapeHtml(subject)}\n` +
      `<b>Message:</b> ${escapeHtml(preview)}`
    );

    return NextResponse.json({ ok: true, thread_id: thread.id, correlation_id: correlationId });
  } catch (err) {
    console.error("[support] thread creation error:", err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Unknown error",
      500,
      correlationId,
    );
  }
}
