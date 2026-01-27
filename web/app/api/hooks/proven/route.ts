import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

function hashText(text: string): string {
  return crypto.createHash("md5").update(text.toLowerCase().trim()).digest("hex");
}

type HookType = "spoken" | "visual" | "text";

interface UpsertHookParams {
  brand_name: string;
  product_id?: string;
  hook_type: HookType;
  hook_text: string;
  hook_family?: string;
  source_video_id?: string;
  increment_field?: "used_count" | "approved_count" | "posted_count" | "winner_count";
  approved_by?: string;
}

/**
 * POST /api/hooks/proven
 * Upsert a proven hook with stats tracking
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: UpsertHookParams;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const {
    brand_name,
    product_id,
    hook_type,
    hook_text,
    hook_family,
    source_video_id,
    increment_field,
    approved_by,
  } = body;

  // Validate required fields
  if (!brand_name || !hook_type || !hook_text) {
    const err = apiError("BAD_REQUEST", "brand_name, hook_type, and hook_text are required", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const validHookTypes: HookType[] = ["spoken", "visual", "text"];
  if (!validHookTypes.includes(hook_type)) {
    const err = apiError("BAD_REQUEST", `hook_type must be one of: ${validHookTypes.join(", ")}`, 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const hookHash = hashText(hook_text);

  try {
    // Check if hook already exists
    const { data: existing } = await supabaseAdmin
      .from("proven_hooks")
      .select("id, used_count, approved_count, posted_count, winner_count")
      .eq("brand_name", brand_name)
      .eq("hook_type", hook_type)
      .eq("hook_hash", hookHash)
      .single();

    if (existing) {
      // Update existing hook
      const updateData: Record<string, unknown> = {
        last_used_at: new Date().toISOString(),
      };

      // Increment the specified field
      if (increment_field === "used_count") {
        updateData.used_count = (existing.used_count || 0) + 1;
      } else if (increment_field === "approved_count") {
        updateData.approved_count = (existing.approved_count || 0) + 1;
      } else if (increment_field === "posted_count") {
        updateData.posted_count = (existing.posted_count || 0) + 1;
      } else if (increment_field === "winner_count") {
        updateData.winner_count = (existing.winner_count || 0) + 1;
      }

      const { error: updateError } = await supabaseAdmin
        .from("proven_hooks")
        .update(updateData)
        .eq("id", existing.id);

      if (updateError) {
        console.error("Failed to update hook:", updateError);
        const err = apiError("DB_ERROR", updateError.message, 500);
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }

      return NextResponse.json({
        ok: true,
        action: "updated",
        hook_id: existing.id,
        correlation_id: correlationId,
      });
    }

    // Insert new hook
    const { data: newHook, error: insertError } = await supabaseAdmin
      .from("proven_hooks")
      .insert({
        brand_name,
        product_id: product_id || null,
        hook_type,
        hook_text: hook_text.trim(),
        hook_hash: hookHash,
        hook_family: hook_family || null,
        source_video_id: source_video_id || null,
        used_count: increment_field === "used_count" ? 1 : 1,
        approved_count: increment_field === "approved_count" ? 1 : 0,
        posted_count: increment_field === "posted_count" ? 1 : 0,
        winner_count: increment_field === "winner_count" ? 1 : 0,
        approved_by: approved_by || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert hook:", insertError);
      const err = apiError("DB_ERROR", insertError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    return NextResponse.json({
      ok: true,
      action: "created",
      hook_id: newHook?.id,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("Proven hook upsert error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}

/**
 * GET /api/hooks/proven
 * Get proven hooks, optionally filtered by brand/type
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  const brandName = searchParams.get("brand");
  const hookType = searchParams.get("type") as HookType | null;
  const hookFamily = searchParams.get("family");
  const minPosted = parseInt(searchParams.get("min_posted") || "0", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

  try {
    let query = supabaseAdmin
      .from("proven_hooks")
      .select("*")
      .order("winner_count", { ascending: false })
      .order("posted_count", { ascending: false })
      .order("approved_count", { ascending: false })
      .limit(limit);

    if (brandName) {
      query = query.eq("brand_name", brandName);
    }

    if (hookType) {
      query = query.eq("hook_type", hookType);
    }

    if (hookFamily) {
      query = query.eq("hook_family", hookFamily);
    }

    if (minPosted > 0) {
      query = query.gte("posted_count", minPosted);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch hooks:", error);
      const err = apiError("DB_ERROR", error.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("Proven hooks fetch error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
