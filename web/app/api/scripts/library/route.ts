import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = "nodejs";

function hashText(text: string): string {
  return crypto.createHash("md5").update(text.toLowerCase().trim()).digest("hex");
}

/**
 * POST /api/scripts/library
 * Save an approved script to the library
 */
export async function POST(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const {
    video_id,
    product_id,
    brand_name,
    concept_id,
    script_text,
    hook_spoken,
    hook_visual,
    hook_text,
    hook_family,
    tone_preset,
    approved_by,
  } = body as {
    video_id?: string;
    product_id?: string;
    brand_name: string;
    concept_id?: string;
    script_text: string;
    hook_spoken?: string;
    hook_visual?: string;
    hook_text?: string;
    hook_family?: string;
    tone_preset?: string;
    approved_by?: string;
  };

  if (!brand_name || !script_text) {
    return createApiErrorResponse("BAD_REQUEST", "brand_name and script_text are required", 400, correlationId);
  }

  const scriptHash = hashText(script_text);

  try {
    // Upsert the script (update if same hash exists for brand)
    const { data: script, error } = await supabaseAdmin
      .from("script_library")
      .upsert(
        {
          product_id: product_id || null,
          brand_name,
          concept_id: concept_id || null,
          source_video_id: video_id || null,
          script_text: script_text.trim(),
          script_hash: scriptHash,
          hook_spoken: hook_spoken || null,
          hook_visual: hook_visual || null,
          hook_text: hook_text || null,
          hook_family: hook_family || null,
          tone_preset: tone_preset || null,
          approved_by: approved_by || null,
          approved_count: 1,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "brand_name,script_hash",
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (error) {
      // If conflict, try to increment approved_count instead
      if (error.code === "23505") {
        const { data: existing } = await supabaseAdmin
          .from("script_library")
          .select("id, approved_count")
          .eq("brand_name", brand_name)
          .eq("script_hash", scriptHash)
          .single();

        if (existing) {
          await supabaseAdmin
            .from("script_library")
            .update({ approved_count: (existing.approved_count || 0) + 1 })
            .eq("id", existing.id);

          return NextResponse.json({
            ok: true,
            action: "incremented",
            script_id: existing.id,
            correlation_id: correlationId,
          });
        }
      }

      console.error("Failed to save script:", error);
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      action: "created",
      script_id: script?.id,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("Script library save error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}

/**
 * GET /api/scripts/library
 * Get scripts from library, optionally filtered by brand/product
 */
export async function GET(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  const brandName = searchParams.get("brand");
  const productId = searchParams.get("product_id");
  const winnersOnly = searchParams.get("winners") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

  try {
    let query = supabaseAdmin
      .from("script_library")
      .select("*")
      .order("posted_count", { ascending: false })
      .order("approved_count", { ascending: false })
      .limit(limit);

    if (brandName) {
      query = query.eq("brand_name", brandName);
    }

    if (productId) {
      query = query.eq("product_id", productId);
    }

    if (winnersOnly) {
      query = query.eq("is_winner", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch scripts:", error);
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("Script library fetch error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
