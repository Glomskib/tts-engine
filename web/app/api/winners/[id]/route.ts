import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

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

  try {
    const { data, error } = await supabaseAdmin
      .from("reference_videos")
      .select(`
        *,
        reference_assets (*),
        reference_extracts (*)
      `)
      .eq("id", id)
      .single();

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
    // Check if adding a transcript
    if (updates.transcript_text && typeof updates.transcript_text === "string") {
      const transcript = updates.transcript_text.trim();

      if (transcript) {
        // Save transcript asset
        await supabaseAdmin
          .from("reference_assets")
          .upsert({
            reference_video_id: id,
            asset_type: "transcript",
            transcript_text: transcript,
          }, {
            onConflict: "reference_video_id,asset_type"
          });

        // Update status and trigger extraction
        await supabaseAdmin
          .from("reference_videos")
          .update({ status: "processing" })
          .eq("id", id);

        // Trigger extraction async
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

        return NextResponse.json({
          ok: true,
          message: "Transcript added, extraction started",
          correlation_id: correlationId,
        });
      }
    }

    // Handle other updates
    const allowedFields = ["notes", "category", "status"];
    const updatePayload: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updatePayload[field] = updates[field];
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

    return NextResponse.json({
      ok: true,
      data,
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

  try {
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
