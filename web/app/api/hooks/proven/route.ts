import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

function hashText(text: string): string {
  return crypto.createHash("md5").update(text.toLowerCase().trim()).digest("hex");
}

type HookType = "spoken" | "visual" | "text";

type EmotionalDriver = "shock" | "fear" | "curiosity" | "insecurity" | "fomo";

interface UpsertHookParams {
  brand_name: string;
  product_id?: string;
  hook_type: HookType;
  hook_text: string;
  hook_family?: string;
  emotional_driver?: EmotionalDriver;
  cta_family?: string;
  edge_push?: boolean;
  source?: "internal" | "external";
  source_video_id?: string;
  increment_field?: "used_count" | "approved_count" | "posted_count" | "winner_count" | "rejected_count" | "underperform_count";
  approved_by?: string;
}

/**
 * POST /api/hooks/proven
 * Upsert a proven hook with stats tracking
 */
export async function POST(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: UpsertHookParams;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const {
    brand_name,
    product_id,
    hook_type,
    hook_text,
    hook_family,
    emotional_driver,
    cta_family,
    edge_push,
    source,
    source_video_id,
    increment_field,
    approved_by,
  } = body;

  // Validate required fields
  if (!brand_name || !hook_type || !hook_text) {
    return createApiErrorResponse("BAD_REQUEST", "brand_name, hook_type, and hook_text are required", 400, correlationId);
  }

  const validHookTypes: HookType[] = ["spoken", "visual", "text"];
  if (!validHookTypes.includes(hook_type)) {
    return createApiErrorResponse("BAD_REQUEST", `hook_type must be one of: ${validHookTypes.join(", ")}`, 400, correlationId);
  }

  const hookHash = hashText(hook_text);

  try {
    // Check if hook already exists
    const { data: existing } = await supabaseAdmin
      .from("proven_hooks")
      .select("id, used_count, approved_count, posted_count, winner_count, rejected_count, underperform_count")
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
      } else if (increment_field === "rejected_count") {
        updateData.rejected_count = (existing.rejected_count || 0) + 1;
      } else if (increment_field === "underperform_count") {
        updateData.underperform_count = (existing.underperform_count || 0) + 1;
      }

      const { error: updateError } = await supabaseAdmin
        .from("proven_hooks")
        .update(updateData)
        .eq("id", existing.id);

      if (updateError) {
        console.error("Failed to update hook:", updateError);
        return createApiErrorResponse("DB_ERROR", updateError.message, 500, correlationId);
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
        emotional_driver: emotional_driver || null,
        cta_family: cta_family || null,
        edge_push: edge_push || false,
        source: source || "internal",
        source_video_id: source_video_id || null,
        used_count: increment_field === "used_count" ? 1 : 1,
        approved_count: increment_field === "approved_count" ? 1 : 0,
        posted_count: increment_field === "posted_count" ? 1 : 0,
        winner_count: increment_field === "winner_count" ? 1 : 0,
        rejected_count: increment_field === "rejected_count" ? 1 : 0,
        underperform_count: increment_field === "underperform_count" ? 1 : 0,
        approved_by: approved_by || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert hook:", insertError);
      return createApiErrorResponse("DB_ERROR", insertError.message, 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      action: "created",
      hook_id: newHook?.id,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("Proven hook upsert error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}

/**
 * GET /api/hooks/proven
 * Get proven hooks with scoring and quarantine filtering
 *
 * Query params:
 * - brand: filter by brand_name
 * - type: filter by hook_type (spoken/visual/text)
 * - family: filter by hook_family
 * - emotional_driver: filter by emotional_driver
 * - min_posted: minimum posted_count
 * - include_quarantined: if true, include hooks with rejected_count >= 3
 * - scored: if true, include computed_score in response
 * - limit: max results (default 20, max 100)
 */
export async function GET(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  const brandName = searchParams.get("brand");
  const hookType = searchParams.get("type") as HookType | null;
  const hookFamily = searchParams.get("family");
  const emotionalDriver = searchParams.get("emotional_driver") as EmotionalDriver | null;
  const minPosted = parseInt(searchParams.get("min_posted") || "0", 10);
  const includeQuarantined = searchParams.get("include_quarantined") === "true";
  const scored = searchParams.get("scored") === "true";
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

    if (emotionalDriver) {
      query = query.eq("emotional_driver", emotionalDriver);
    }

    if (minPosted > 0) {
      query = query.gte("posted_count", minPosted);
    }

    // Filter out quarantined hooks (rejected >= 3) unless explicitly requested
    if (!includeQuarantined) {
      query = query.lt("rejected_count", 3);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch hooks:", error);
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
    }

    // Add computed score if requested
    // Score formula: (approved_count * 3) - (underperform_count * 1) - (rejected_count * 3)
    // - Rejected hooks are hard-penalized (-3 each)
    // - Underperforming hooks fade naturally (-1 each)
    // - Winners dominate without banning experimentation
    let resultData = data || [];
    if (scored) {
      resultData = resultData.map((hook) => ({
        ...hook,
        computed_score:
          (hook.approved_count || 0) * 3 -
          (hook.underperform_count || 0) * 1 -
          (hook.rejected_count || 0) * 3,
        is_quarantined: (hook.rejected_count || 0) >= 3,
        is_underperforming: (hook.underperform_count || 0) > 0,
      }));
      // Sort by computed score
      resultData.sort((a, b) => (b.computed_score || 0) - (a.computed_score || 0));
    }

    return NextResponse.json({
      ok: true,
      data: resultData,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("Proven hooks fetch error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
