import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";
import {
  enforceRateLimits,
  extractRateLimitContext,
} from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recordFeedback } from "@/lib/clawbot";

export const runtime = "nodejs";

const VALID_FEEDBACK_TYPES = ["positive", "negative", "neutral"] as const;

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  // Auth
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Rate limit
  const rlContext = {
    ...extractRateLimitContext(request),
    userId: authContext.user.id,
  };
  const rateLimited = enforceRateLimits(rlContext, correlationId, { userLimit: 10 });
  if (rateLimited) return rateLimited;

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  // Validate required fields
  const skitId = body.skit_id;
  const feedbackType = body.feedback_type;
  const videoId = body.video_id;
  const notes = body.notes;

  if (!skitId || typeof skitId !== "string") {
    return createApiErrorResponse("BAD_REQUEST", "skit_id is required and must be a string", 400, correlationId);
  }

  if (!feedbackType || !VALID_FEEDBACK_TYPES.includes(feedbackType as typeof VALID_FEEDBACK_TYPES[number])) {
    return createApiErrorResponse("BAD_REQUEST", "feedback_type must be one of: positive, negative, neutral", 400, correlationId);
  }

  if (videoId !== undefined && typeof videoId !== "string") {
    return createApiErrorResponse("BAD_REQUEST", "video_id must be a string", 400, correlationId);
  }

  if (notes !== undefined && typeof notes !== "string") {
    return createApiErrorResponse("BAD_REQUEST", "notes must be a string", 400, correlationId);
  }

  // Fetch the skit to get its strategy_metadata
  const { data: skit, error: skitError } = await supabaseAdmin
    .from("saved_skits")
    .select("id, strategy_metadata")
    .eq("id", skitId)
    .single();

  if (skitError || !skit) {
    return createApiErrorResponse("NOT_FOUND", "Skit not found", 404, correlationId);
  }

  const strategyUsed = skit.strategy_metadata ?? { note: "No Clawbot strategy was used for this skit" };

  const result = await recordFeedback(
    {
      skit_id: skitId,
      video_id: videoId as string | undefined,
      feedback_type: feedbackType as "positive" | "negative" | "neutral",
      notes: notes as string | undefined,
    },
    strategyUsed,
    authContext.user.id
  );

  if (!result) {
    return createApiErrorResponse("DB_ERROR", "Failed to record feedback", 500, correlationId);
  }

  const response = NextResponse.json(
    {
      ok: true,
      feedback_id: result.id,
      correlation_id: correlationId,
    },
    { status: 201 }
  );

  response.headers.set("x-correlation-id", correlationId);
  return response;
}
