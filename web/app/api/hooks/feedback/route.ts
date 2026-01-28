import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type FeedbackOutcome = "winner" | "underperform" | "rejected";
type FeedbackSource = "admin" | "performance" | "auto";

interface CreateFeedbackParams {
  hook_id: string;
  brand_name: string;
  product_id?: string;
  outcome: FeedbackOutcome;
  reason_code?: string;
  notes?: string;
  source?: FeedbackSource;
  created_by?: string;
}

// Reason codes for underperforming hooks
const UNDERPERFORM_REASONS = [
  "low_engagement",
  "weak_cta",
  "wrong_tone",
  "too_generic",
  "poor_timing",
  "saturated",
] as const;

// Reason codes for rejected hooks
const REJECT_REASONS = [
  "too_generic",
  "too_risky",
  "not_relatable",
  "wrong_angle",
  "compliance",
  "bad_cta",
] as const;

/**
 * POST /api/hooks/feedback
 * Record feedback on a hook (winner, underperform, or rejected)
 * Also increments the corresponding count on proven_hooks
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: CreateFeedbackParams;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const {
    hook_id,
    brand_name,
    product_id,
    outcome,
    reason_code,
    notes,
    source = "admin",
    created_by,
  } = body;

  // Validate required fields
  if (!hook_id || !brand_name || !outcome) {
    const err = apiError("BAD_REQUEST", "hook_id, brand_name, and outcome are required", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const validOutcomes: FeedbackOutcome[] = ["winner", "underperform", "rejected"];
  if (!validOutcomes.includes(outcome)) {
    const err = apiError("BAD_REQUEST", `outcome must be one of: ${validOutcomes.join(", ")}`, 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    // Verify hook exists and get current counts
    const { data: hook, error: hookError } = await supabaseAdmin
      .from("proven_hooks")
      .select("id, approved_count, underperform_count, rejected_count")
      .eq("id", hook_id)
      .single();

    if (hookError || !hook) {
      const err = apiError("NOT_FOUND", "Hook not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Insert feedback record
    const { data: feedback, error: feedbackError } = await supabaseAdmin
      .from("hook_feedback")
      .insert({
        hook_id,
        brand_name,
        product_id: product_id || null,
        outcome,
        reason_code: reason_code || null,
        notes: notes || null,
        source,
        created_by: created_by || null,
      })
      .select()
      .single();

    if (feedbackError) {
      console.error("Failed to insert hook feedback:", feedbackError);
      const err = apiError("DB_ERROR", feedbackError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Increment the corresponding count on proven_hooks
    const updateData: Record<string, number> = {};
    if (outcome === "winner") {
      updateData.approved_count = (hook.approved_count || 0) + 1;
    } else if (outcome === "underperform") {
      updateData.underperform_count = (hook.underperform_count || 0) + 1;
    } else if (outcome === "rejected") {
      updateData.rejected_count = (hook.rejected_count || 0) + 1;
    }

    const { error: updateError } = await supabaseAdmin
      .from("proven_hooks")
      .update(updateData)
      .eq("id", hook_id);

    if (updateError) {
      console.error("Failed to update hook counts:", updateError);
      // Don't fail the request, feedback was recorded
    }

    return NextResponse.json({
      ok: true,
      feedback_id: feedback.id,
      outcome,
      hook_id,
      new_counts: {
        approved_count: outcome === "winner" ? updateData.approved_count : hook.approved_count,
        underperform_count: outcome === "underperform" ? updateData.underperform_count : hook.underperform_count,
        rejected_count: outcome === "rejected" ? updateData.rejected_count : hook.rejected_count,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("Hook feedback error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}

/**
 * GET /api/hooks/feedback
 * Get feedback history for hooks
 *
 * Query params:
 * - hook_id: filter by specific hook
 * - brand: filter by brand_name
 * - outcome: filter by outcome (winner/underperform/rejected)
 * - limit: max results (default 50, max 200)
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  const hookId = searchParams.get("hook_id");
  const brandName = searchParams.get("brand");
  const outcome = searchParams.get("outcome") as FeedbackOutcome | null;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  try {
    let query = supabaseAdmin
      .from("hook_feedback")
      .select(`
        *,
        hook:proven_hooks (
          id,
          hook_text,
          hook_type,
          hook_family
        )
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (hookId) {
      query = query.eq("hook_id", hookId);
    }

    if (brandName) {
      query = query.eq("brand_name", brandName);
    }

    if (outcome) {
      query = query.eq("outcome", outcome);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch hook feedback:", error);
      const err = apiError("DB_ERROR", error.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
      meta: {
        underperform_reasons: UNDERPERFORM_REASONS,
        reject_reasons: REJECT_REASONS,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("Hook feedback fetch error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
