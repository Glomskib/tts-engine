import { NextRequest, NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { callAnthropicAPI } from "@/lib/ai/anthropic";
import { SUPPORT_SYSTEM_PROMPT } from "@/lib/support-kb";
import { crossPostToMC } from "@/lib/support-mc-bridge";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();

  try {
    // Optional auth — anonymous OK via visitor_email
    const authContext = await getApiAuthContext(request);
    const body = await request.json();
    const { message, thread_id, visitor_email, subject } = body;

    if (!message || message.length < 1 || message.length > 5000) {
      return createApiErrorResponse("VALIDATION_ERROR", "Message must be 1-5000 characters", 400, correlationId);
    }

    const userId = authContext.user?.id || null;
    const userEmail = authContext.user?.email || visitor_email || null;

    if (!userId && !visitor_email) {
      return createApiErrorResponse("VALIDATION_ERROR", "Either authentication or visitor_email is required", 400, correlationId);
    }

    let activeThreadId = thread_id;
    let isNewThread = false;

    // Create new thread if no thread_id provided
    if (!activeThreadId) {
      const threadSubject = subject || message.slice(0, 100);

      const insertData: Record<string, unknown> = {
        subject: threadSubject,
        status: "open",
        priority: "normal",
        source: "live_chat",
        last_message_at: new Date().toISOString(),
      };

      if (userId) {
        insertData.user_id = userId;
        insertData.user_email = userEmail;
      } else {
        insertData.visitor_email = visitor_email;
      }

      const { data: thread, error: threadError } = await supabaseAdmin
        .from("support_threads")
        .insert(insertData)
        .select("id")
        .single();

      if (threadError) {
        return createApiErrorResponse("DB_ERROR", threadError.message, 500, correlationId);
      }

      activeThreadId = thread.id;
      isNewThread = true;
    }

    // Insert user message
    const { error: msgError } = await supabaseAdmin
      .from("support_messages")
      .insert({
        thread_id: activeThreadId,
        sender_type: "user",
        sender_id: userId,
        sender_email: userEmail || visitor_email,
        body: message,
        is_internal: false,
      });

    if (msgError) {
      return createApiErrorResponse("DB_ERROR", msgError.message, 500, correlationId);
    }

    // Update thread last_message_at
    await supabaseAdmin
      .from("support_threads")
      .update({ last_message_at: new Date().toISOString(), status: "open" })
      .eq("id", activeThreadId);

    // Fetch thread history for context
    const { data: history } = await supabaseAdmin
      .from("support_messages")
      .select("sender_type, body, created_at")
      .eq("thread_id", activeThreadId)
      .eq("is_internal", false)
      .order("created_at", { ascending: true })
      .limit(20);

    // Build conversation prompt
    const conversationLines = (history || []).map((msg) => {
      const role = msg.sender_type === "user" ? "User" : "Assistant";
      return `${role}: ${msg.body}`;
    });
    const conversationPrompt = conversationLines.join("\n\n");

    // Call Claude for AI response
    const result = await callAnthropicAPI(conversationPrompt, {
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
      systemPrompt: SUPPORT_SYSTEM_PROMPT,
      correlationId,
      requestType: "support_live_chat",
      agentId: "support-bot",
      signal: AbortSignal.timeout(25000),
    });

    // Insert bot response as support_message
    const { error: botMsgError } = await supabaseAdmin
      .from("support_messages")
      .insert({
        thread_id: activeThreadId,
        sender_type: "system",
        sender_email: "support-bot@flashflowai.com",
        body: result.text,
        is_internal: false,
      });

    if (botMsgError) {
      console.error("[support/live] Failed to save bot response:", botMsgError.message);
    }

    // Update thread last_message_at for bot response
    await supabaseAdmin
      .from("support_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", activeThreadId);

    // Cross-post to MC on new threads (fire-and-forget)
    if (isNewThread) {
      const threadSubject = subject || message.slice(0, 100);
      crossPostToMC(activeThreadId, threadSubject, userEmail || visitor_email);
    }

    return NextResponse.json({
      ok: true,
      thread_id: activeThreadId,
      response: result.text,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("[support/live] error:", err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Unknown error",
      500,
      correlationId,
    );
  }
}
