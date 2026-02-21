import { NextRequest, NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const userId = authContext.user.id;
  const userEmail = authContext.user.email || null;

  try {
    const body = await request.json();
    const { body: messageBody, is_internal } = body;

    if (!messageBody || messageBody.length < 1 || messageBody.length > 5000) {
      return createApiErrorResponse("VALIDATION_ERROR", "Message must be 1-5000 characters", 400, correlationId);
    }

    // Fetch thread to check access
    const { data: thread, error: threadError } = await supabaseAdmin
      .from("support_threads")
      .select("user_id")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return createApiErrorResponse("NOT_FOUND", "Thread not found", 404, correlationId);
    }

    const isOwner = thread.user_id === userId;
    const isAdmin = authContext.isAdmin;

    if (!isOwner && !isAdmin) {
      return createApiErrorResponse("FORBIDDEN", "Access denied", 403, correlationId);
    }

    // Users can't post internal notes
    const senderType = isAdmin ? "admin" : "user";
    const internalNote = isAdmin ? !!is_internal : false;

    // Insert message
    const { error: msgError } = await supabaseAdmin
      .from("support_messages")
      .insert({
        thread_id: threadId,
        sender_type: senderType,
        sender_id: userId,
        sender_email: userEmail,
        body: messageBody,
        is_internal: internalNote,
      });

    if (msgError) {
      return createApiErrorResponse("DB_ERROR", msgError.message, 500, correlationId);
    }

    // Update thread: last_message_at + auto-set status
    const statusUpdate = isAdmin && !internalNote
      ? "waiting_on_customer"
      : !isAdmin
        ? "open"
        : undefined;

    const threadUpdates: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
    };
    if (statusUpdate) {
      threadUpdates.status = statusUpdate;
    }

    await supabaseAdmin
      .from("support_threads")
      .update(threadUpdates)
      .eq("id", threadId);

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  } catch (err) {
    console.error("[support] message error:", err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Unknown error",
      500,
      correlationId,
    );
  }
}
