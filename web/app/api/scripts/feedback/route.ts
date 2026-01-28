import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type FeedbackOutcome = "winner" | "underperform" | "rejected";
type FeedbackSource = "admin" | "performance" | "auto";

interface CreateFeedbackParams {
  script_id: string;
  brand_name: string;
  product_id?: string;
  outcome: FeedbackOutcome;
  reason_code?: string;
  notes?: string;
  source?: FeedbackSource;
  created_by?: string;
}

// Reason codes for underperforming scripts
const UNDERPERFORM_REASONS = [
  "low_retention",
  "weak_middle",
  "unclear_value",
  "wrong_length",
  "poor_flow",
  "missed_proof",
] as const;

// Reason codes for rejected scripts
const REJECT_REASONS = [
  "off_brand",
  "compliance",
  "factually_wrong",
  "poor_structure",
  "wrong_audience",
  "too_salesy",
] as const;

/**
 * POST /api/scripts/feedback
 * Record feedback on a script (winner, underperform, or rejected)
 * Also increments the corresponding count on script_library
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
    script_id,
    brand_name,
    product_id,
    outcome,
    reason_code,
    notes,
    source = "admin",
    created_by,
  } = body;

  // Validate required fields
  if (!script_id || !brand_name || !outcome) {
    const err = apiError("BAD_REQUEST", "script_id, brand_name, and outcome are required", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const validOutcomes: FeedbackOutcome[] = ["winner", "underperform", "rejected"];
  if (!validOutcomes.includes(outcome)) {
    const err = apiError("BAD_REQUEST", `outcome must be one of: ${validOutcomes.join(", ")}`, 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    // Verify script exists and get current counts
    const { data: script, error: scriptError } = await supabaseAdmin
      .from("script_library")
      .select("id, approved_count, underperform_count")
      .eq("id", script_id)
      .single();

    if (scriptError || !script) {
      const err = apiError("NOT_FOUND", "Script not found in library", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Insert feedback record
    const { data: feedback, error: feedbackError } = await supabaseAdmin
      .from("script_feedback")
      .insert({
        script_id,
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
      console.error("Failed to insert script feedback:", feedbackError);
      const err = apiError("DB_ERROR", feedbackError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Increment the corresponding count on script_library
    const updateData: Record<string, unknown> = {};
    if (outcome === "winner") {
      updateData.approved_count = (script.approved_count || 0) + 1;
      updateData.is_winner = true;
    } else if (outcome === "underperform") {
      updateData.underperform_count = (script.underperform_count || 0) + 1;
    }
    // Note: rejected scripts don't have a rejected_count in script_library currently
    // They would just accumulate underperform feedback

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from("script_library")
        .update(updateData)
        .eq("id", script_id);

      if (updateError) {
        console.error("Failed to update script counts:", updateError);
        // Don't fail the request, feedback was recorded
      }
    }

    return NextResponse.json({
      ok: true,
      feedback_id: feedback.id,
      outcome,
      script_id,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("Script feedback error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}

/**
 * GET /api/scripts/feedback
 * Get feedback history for scripts
 *
 * Query params:
 * - script_id: filter by specific script
 * - brand: filter by brand_name
 * - outcome: filter by outcome (winner/underperform/rejected)
 * - limit: max results (default 50, max 200)
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  const scriptId = searchParams.get("script_id");
  const brandName = searchParams.get("brand");
  const outcome = searchParams.get("outcome") as FeedbackOutcome | null;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  try {
    let query = supabaseAdmin
      .from("script_feedback")
      .select(`
        *,
        script:script_library (
          id,
          script_text,
          brand_name,
          is_winner
        )
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (scriptId) {
      query = query.eq("script_id", scriptId);
    }

    if (brandName) {
      query = query.eq("brand_name", brandName);
    }

    if (outcome) {
      query = query.eq("outcome", outcome);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch script feedback:", error);
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
    console.error("Script feedback fetch error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
