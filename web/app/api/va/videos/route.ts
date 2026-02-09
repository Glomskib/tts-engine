import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { generateCorrelationId } from "@/lib/api-errors";

export const runtime = "nodejs";

/**
 * GET /api/va/videos?va_name=<name>
 * Public VA endpoint — returns videos assigned to a specific VA by name.
 * No auth required. VA name is matched against assigned_to or assigned_role fields.
 */
export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const { searchParams } = new URL(request.url);
  const vaName = searchParams.get("va_name");

  if (!vaName || vaName.trim().length < 1) {
    return NextResponse.json(
      { ok: false, error: "va_name parameter is required", correlation_id: correlationId },
      { status: 400 }
    );
  }

  try {
    // Look up the VA by checking assigned_to field (stored as name or user id)
    // We search videos where assigned_to matches the VA name (case-insensitive)
    // or where the video has a matching va_name in the assignment metadata
    const { data, error } = await supabaseAdmin
      .from("videos")
      .select(`
        id, video_code, status, recording_status,
        product_id, product:product_id(id, name, brand),
        script_locked_text, script_locked_version,
        google_drive_url, final_video_url, posted_url, posted_platform,
        recording_notes, editor_notes, uploader_notes,
        assigned_to, assigned_at, assigned_role, assignment_state,
        assigned_expires_at,
        last_status_changed_at, created_at,
        claimed_by, claim_role
      `)
      .ilike("assigned_to", vaName.trim())
      .not("recording_status", "eq", "POSTED")
      .not("recording_status", "eq", "REJECTED")
      .order("last_status_changed_at", { ascending: true });

    if (error) {
      console.error(`[${correlationId}] VA videos query error:`, error);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch videos", correlation_id: correlationId },
        { status: 500 }
      );
    }

    // Flatten product join
    const videos = (data || []).map((v: Record<string, unknown>) => {
      const product = v.product as Record<string, unknown> | null;
      return {
        ...v,
        product_name: product?.name || null,
        product_brand: product?.brand || null,
        product: undefined,
      };
    });

    return NextResponse.json({
      ok: true,
      data: videos,
      count: videos.length,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] VA videos error:`, err);
    return NextResponse.json(
      { ok: false, error: "Internal server error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}
