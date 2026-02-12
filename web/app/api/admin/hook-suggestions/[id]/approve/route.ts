import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
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
 * POST /api/admin/hook-suggestions/[id]/approve
 * Approve a hook suggestion (admin only)
 *
 * Behavior:
 * - Marks suggestion as approved
 * - Upserts into proven_hooks:
 *   - If exists: increment approved_count
 *   - If new: insert with approved_count=1
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid suggestion ID format", 400, correlationId);
  }

  // Admin-only check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
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
      return createApiErrorResponse("NOT_FOUND", "Suggestion not found", 404, correlationId);
    }

    // Check if already processed
    if (suggestion.status !== "pending") {
      return createApiErrorResponse("CONFLICT", `Suggestion already ${suggestion.status}`, 409, correlationId);
    }

    const now = new Date().toISOString();

    // Mark suggestion as approved
    const { error: updateError } = await supabaseAdmin
      .from("hook_suggestions")
      .update({
        status: "approved",
        reviewed_at: now,
        reviewed_by: authContext.user.id,
        review_note: reviewNote,
      })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to update suggestion:", updateError);
      return createApiErrorResponse("DB_ERROR", updateError.message, 500, correlationId);
    }

    // Upsert into proven_hooks
    // Need brand_name for the unique constraint - try to get from suggestion or product
    let brandName = suggestion.brand_name;
    if (!brandName && suggestion.product_id) {
      const { data: product } = await supabaseAdmin
        .from("products")
        .select("brand")
        .eq("id", suggestion.product_id)
        .single();
      brandName = product?.brand || null;
    }

    // If still no brand_name, use a placeholder (required for proven_hooks)
    if (!brandName) {
      brandName = "unknown";
    }

    // Compute hook_hash consistent with proven_hooks
    const hookHash = hashText(suggestion.hook_text);

    // Check if proven_hook already exists
    const { data: existingHook } = await supabaseAdmin
      .from("proven_hooks")
      .select("id, approved_count")
      .eq("brand_name", brandName)
      .eq("hook_type", suggestion.hook_type)
      .eq("hook_hash", hookHash)
      .single();

    let provenHookId: string | null = null;
    let action: "created" | "updated" = "created";

    if (existingHook) {
      // Update existing hook - increment approved_count
      const { data: updated, error: hookUpdateError } = await supabaseAdmin
        .from("proven_hooks")
        .update({
          approved_count: (existingHook.approved_count || 0) + 1,
          last_used_at: now,
        })
        .eq("id", existingHook.id)
        .select("id")
        .single();

      if (hookUpdateError) {
        console.error("Failed to update proven_hook:", hookUpdateError);
      } else {
        provenHookId = updated?.id || existingHook.id;
        action = "updated";
      }
    } else {
      // Insert new proven_hook
      const { data: newHook, error: insertError } = await supabaseAdmin
        .from("proven_hooks")
        .insert({
          brand_name: brandName,
          product_id: suggestion.product_id,
          hook_type: suggestion.hook_type,
          hook_text: suggestion.hook_text.trim(),
          hook_hash: hookHash,
          source_video_id: suggestion.source_video_id,
          used_count: 1,
          approved_count: 1,
          posted_count: 0,
          winner_count: 0,
        })
        .select("id")
        .single();

      if (insertError) {
        // Check if it's a unique constraint violation (race condition)
        if (insertError.code === "23505") {
          // Try to find and update instead
          const { data: raceHook } = await supabaseAdmin
            .from("proven_hooks")
            .select("id, approved_count")
            .eq("brand_name", brandName)
            .eq("hook_type", suggestion.hook_type)
            .eq("hook_hash", hookHash)
            .single();

          if (raceHook) {
            await supabaseAdmin
              .from("proven_hooks")
              .update({
                approved_count: (raceHook.approved_count || 0) + 1,
                last_used_at: now,
              })
              .eq("id", raceHook.id);
            provenHookId = raceHook.id;
            action = "updated";
          }
        } else {
          console.error("Failed to insert proven_hook:", insertError);
        }
      } else {
        provenHookId = newHook?.id || null;
      }
    }

    // Audit log for hook approval
    auditLogAsync({
      correlation_id: correlationId,
      event_type: AuditEventTypes.HOOK_APPROVED,
      entity_type: EntityTypes.HOOK,
      entity_id: provenHookId || id,
      actor: authContext.user?.id || "admin",
      summary: `Hook suggestion ${id} approved`,
      details: {
        suggestion_id: id,
        proven_hook_id: provenHookId,
        proven_hook_action: action,
        hook_type: suggestion.hook_type,
        brand_name: brandName,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        suggestion_id: id,
        status: "approved",
        proven_hook_id: provenHookId,
        proven_hook_action: action,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/admin/hook-suggestions/[id]/approve error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
