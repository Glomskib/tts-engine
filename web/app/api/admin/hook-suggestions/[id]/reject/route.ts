import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import crypto from "crypto";
import { auditLogAsync, AuditEventTypes, EntityTypes } from "@/lib/audit";

export const runtime = "nodejs";

function hashText(text: string): string {
  return crypto.createHash("md5").update(text.toLowerCase().trim()).digest("hex");
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/hook-suggestions/[id]/reject
 * Reject a hook suggestion (admin only)
 *
 * Behavior:
 * - Marks suggestion as rejected
 * - If matching proven_hook exists, increment rejected_count
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    const err = apiError("INVALID_UUID", "Invalid suggestion ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Admin-only check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Optional request body for review note
  let reviewNote: string | null = null;
  try {
    const body = await request.json();
    reviewNote = typeof body.review_note === "string" ? body.review_note.trim() : null;
  } catch {
    // No body is fine
  }

  try {
    // Fetch the suggestion
    const { data: suggestion, error: fetchError } = await supabaseAdmin
      .from("hook_suggestions")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !suggestion) {
      const err = apiError("NOT_FOUND", "Suggestion not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Check if already processed
    if (suggestion.status !== "pending") {
      const err = apiError("CONFLICT", `Suggestion already ${suggestion.status}`, 409);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const now = new Date().toISOString();

    // Mark suggestion as rejected
    const { error: updateError } = await supabaseAdmin
      .from("hook_suggestions")
      .update({
        status: "rejected",
        reviewed_at: now,
        reviewed_by: authContext.user.id,
        review_note: reviewNote,
      })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to update suggestion:", updateError);
      const err = apiError("DB_ERROR", updateError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Optional: increment rejected_count on existing proven_hook if match exists
    let brandName = suggestion.brand_name;
    if (!brandName && suggestion.product_id) {
      const { data: product } = await supabaseAdmin
        .from("products")
        .select("brand")
        .eq("id", suggestion.product_id)
        .single();
      brandName = product?.brand || null;
    }

    let provenHookId: string | null = null;

    if (brandName) {
      const hookHash = hashText(suggestion.hook_text);

      const { data: existingHook } = await supabaseAdmin
        .from("proven_hooks")
        .select("id, rejected_count")
        .eq("brand_name", brandName)
        .eq("hook_type", suggestion.hook_type)
        .eq("hook_hash", hookHash)
        .single();

      if (existingHook) {
        // Increment rejected_count on existing hook
        await supabaseAdmin
          .from("proven_hooks")
          .update({
            rejected_count: (existingHook.rejected_count || 0) + 1,
          })
          .eq("id", existingHook.id);
        provenHookId = existingHook.id;
      }
    }

    // Audit log for hook rejection
    auditLogAsync({
      correlation_id: correlationId,
      event_type: AuditEventTypes.HOOK_REJECTED,
      entity_type: EntityTypes.HOOK,
      entity_id: provenHookId || id,
      actor: authContext.user?.id || "admin",
      summary: `Hook suggestion ${id} rejected`,
      details: {
        suggestion_id: id,
        proven_hook_id: provenHookId,
        hook_type: suggestion.hook_type,
        review_note: reviewNote,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        suggestion_id: id,
        status: "rejected",
        proven_hook_id: provenHookId,
        proven_hook_action: provenHookId ? "rejected_count_incremented" : null,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/admin/hook-suggestions/[id]/reject error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
