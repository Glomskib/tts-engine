import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/winners/[id]
 *
 * Get a single reference video with its assets and extracts.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - user must be logged in
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    // Build query - filter by user_id to ensure ownership
    let query = supabaseAdmin
      .from("reference_videos")
      .select(`
        *,
        reference_assets (*),
        reference_extracts (*)
      `)
      .eq("id", id);

    // Only allow access to own records (admins can see all)
    if (!authContext.isAdmin) {
      query = query.eq("user_id", authContext.user.id);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: "Reference video not found", correlation_id: correlationId },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] Get winner error:`, error);
    return NextResponse.json(
      { ok: false, error: "Internal error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/winners/[id]
 *
 * Update a reference video. Can also add transcript and trigger extraction.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - user must be logged in
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON", correlation_id: correlationId },
      { status: 400 }
    );
  }

  const updates = body as Record<string, unknown>;

  try {
    // Verify ownership first (admins can update any)
    let ownershipQuery = supabaseAdmin
      .from("reference_videos")
      .select("id")
      .eq("id", id);

    if (!authContext.isAdmin) {
      ownershipQuery = ownershipQuery.eq("user_id", authContext.user.id);
    }

    const { data: existing, error: existError } = await ownershipQuery.single();

    if (existError || !existing) {
      return NextResponse.json(
        { ok: false, error: "Reference video not found", correlation_id: correlationId },
        { status: 404 }
      );
    }

    // Build update payload
    const allowedFields = ["notes", "category", "status", "views", "likes", "comments", "shares", "ai_analysis", "transcript_text"];
    const updatePayload: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updatePayload[field] = updates[field];
      }
    }

    // Check if adding/updating a transcript
    const transcript = typeof updates.transcript_text === "string" ? updates.transcript_text.trim() : null;
    let triggerExtraction = false;

    if (transcript) {
      // Save transcript to reference_assets as well
      await supabaseAdmin
        .from("reference_assets")
        .upsert({
          reference_video_id: id,
          asset_type: "transcript",
          transcript_text: transcript,
        }, {
          onConflict: "reference_video_id,asset_type"
        });

      // Set status to processing if no AI analysis provided (triggers extraction)
      if (!updates.ai_analysis) {
        updatePayload.status = "processing";
        triggerExtraction = true;
      } else {
        // If AI analysis provided, mark as ready
        updatePayload.status = "ready";
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid fields to update", correlation_id: correlationId },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("reference_videos")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, correlation_id: correlationId },
        { status: 500 }
      );
    }

    // Trigger extraction async if we have a new transcript without analysis
    if (triggerExtraction && transcript) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

      fetch(`${baseUrl}/api/winners/extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": correlationId,
        },
        body: JSON.stringify({
          reference_video_id: id,
          transcript_text: transcript,
        }),
      }).catch(err => {
        console.error(`[${correlationId}] Extraction trigger failed:`, err);
      });
    }

    return NextResponse.json({
      ok: true,
      data,
      message: triggerExtraction ? "Saved, extraction started" : "Saved",
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] Update winner error:`, error);
    return NextResponse.json(
      { ok: false, error: "Internal error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/winners/[id]
 *
 * Delete a reference video (cascades to assets and extracts).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - user must be logged in
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    // Verify ownership first (admins can delete any)
    let ownershipQuery = supabaseAdmin
      .from("reference_videos")
      .select("id")
      .eq("id", id);

    if (!authContext.isAdmin) {
      ownershipQuery = ownershipQuery.eq("user_id", authContext.user.id);
    }

    const { data: existing, error: existError } = await ownershipQuery.single();

    if (existError || !existing) {
      return NextResponse.json(
        { ok: false, error: "Reference video not found", correlation_id: correlationId },
        { status: 404 }
      );
    }

    const { error } = await supabaseAdmin
      .from("reference_videos")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, correlation_id: correlationId },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      deleted: id,
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] Delete winner error:`, error);
    return NextResponse.json(
      { ok: false, error: "Internal error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}
