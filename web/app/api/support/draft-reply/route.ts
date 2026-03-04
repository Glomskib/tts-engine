import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { withErrorCapture } from "@/lib/errors/withErrorCapture";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserSubscription, PLAN_DETAILS } from "@/lib/subscriptions";
import { buildSupportContext } from "@/lib/support/buildSupportContext";
import { generateDraftReply } from "@/lib/support/generateDraftReply";

export const runtime = "nodejs";

export const POST = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  // Parse body
  const body = await request.json().catch(() => ({}));
  const threadId = body.thread_id;
  if (!threadId || typeof threadId !== 'string') {
    return createApiErrorResponse("BAD_REQUEST", "thread_id is required", 400, correlationId);
  }

  // Load thread
  const { data: thread, error: threadError } = await supabaseAdmin
    .from("support_threads")
    .select("*")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    return createApiErrorResponse("NOT_FOUND", "Thread not found", 404, correlationId);
  }

  // Load messages (last 20, ascending)
  const { data: messages } = await supabaseAdmin
    .from("support_messages")
    .select("sender_type, sender_email, body, is_internal, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(20);

  // Resolve user plan info
  let userPlan: string | null = null;
  let userAccountAge: string | null = null;

  if (thread.user_id) {
    const subscription = await getUserSubscription(thread.user_id);
    if (subscription?.plan_id) {
      const details = PLAN_DETAILS[subscription.plan_id];
      userPlan = details?.name || subscription.plan_id;
    }

    // Calculate account age from thread's user created_at if available
    if (thread.created_at) {
      const created = new Date(thread.created_at);
      const now = new Date();
      const diffMs = now.getTime() - created.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays < 30) {
        userAccountAge = `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
      } else {
        const months = Math.floor(diffDays / 30);
        userAccountAge = `${months} month${months !== 1 ? 's' : ''}`;
      }
    }
  }

  // Build context prompt
  const contextPrompt = buildSupportContext({
    thread: {
      id: thread.id,
      subject: thread.subject,
      status: thread.status,
      priority: thread.priority,
      tags: thread.tags,
      user_email: thread.user_email,
      created_at: thread.created_at,
    },
    messages: messages || [],
    userPlan,
    userAccountAge,
  });

  // Generate AI draft
  try {
    const result = await generateDraftReply(contextPrompt, { correlationId });

    return NextResponse.json({
      ok: true,
      draft: result.reply_text,
      confidence: result.confidence_score,
      suggested_tags: result.suggested_tags,
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    return createApiErrorResponse("AI_ERROR", `Draft generation failed: ${message}`, 500, correlationId);
  }
}, { routeName: '/api/support/draft-reply', feature: 'support' });
