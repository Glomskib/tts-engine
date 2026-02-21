import { NextRequest, NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET(
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

  // Fetch thread
  const { data: thread, error: threadError } = await supabaseAdmin
    .from("support_threads")
    .select("*")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    return createApiErrorResponse("NOT_FOUND", "Thread not found", 404, correlationId);
  }

  // Check access: user owns thread or is admin
  const isOwner = thread.user_id === userId;
  let isAdmin = false;

  if (!isOwner) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();
    isAdmin = profile?.role === "admin";

    if (!isAdmin) {
      return createApiErrorResponse("FORBIDDEN", "Access denied", 403, correlationId);
    }
  }

  // Fetch messages (admin sees internal notes, users don't)
  let msgQuery = supabaseAdmin
    .from("support_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (!isAdmin) {
    msgQuery = msgQuery.eq("is_internal", false);
  }

  const { data: messages, error: msgError } = await msgQuery;

  if (msgError) {
    return createApiErrorResponse("DB_ERROR", msgError.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    thread,
    messages: messages || [],
    correlation_id: correlationId,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Admin only
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", authContext.user.id)
    .single();

  if (profile?.role !== "admin") {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.status) updates.status = body.status;
  if (body.priority) updates.priority = body.priority;
  if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
  if (body.tags !== undefined) updates.tags = body.tags;

  if (Object.keys(updates).length === 0) {
    return createApiErrorResponse("VALIDATION_ERROR", "No fields to update", 400, correlationId);
  }

  const { error } = await supabaseAdmin
    .from("support_threads")
    .update(updates)
    .eq("id", threadId);

  if (error) {
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, correlation_id: correlationId });
}
