import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { generateCorrelationId } from "@/lib/api-errors";

export const runtime = "nodejs";

const VALID_TRANSITIONS: Record<string, string[]> = {
  NOT_RECORDED: ["RECORDED"],
  RECORDED: ["EDITED"],
  EDITED: ["READY_TO_POST"],
  READY_TO_POST: ["POSTED"],
};

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/va/videos/[id]/status
 * VA status transition endpoint — simplified, no auth.
 * Body: { recording_status: string, va_name: string, notes?: string, video_url?: string, posted_url?: string, posted_platform?: string }
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = generateCorrelationId();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON", correlation_id: correlationId },
      { status: 400 }
    );
  }

  const { recording_status, va_name, notes, video_url, posted_url, posted_platform } = body as {
    recording_status?: string;
    va_name?: string;
    notes?: string;
    video_url?: string;
    posted_url?: string;
    posted_platform?: string;
  };

  if (!recording_status || !va_name) {
    return NextResponse.json(
      { ok: false, error: "recording_status and va_name are required", correlation_id: correlationId },
      { status: 400 }
    );
  }

  try {
    // Fetch current video
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id, recording_status, assigned_to")
      .eq("id", id)
      .single();

    if (fetchError || !video) {
      return NextResponse.json(
        { ok: false, error: "Video not found", correlation_id: correlationId },
        { status: 404 }
      );
    }

    // Verify VA is assigned to this video
    // Look up team member by display_name to match against assigned_to UUID
    const { data: members } = await supabaseAdmin
      .from("team_members")
      .select("user_id")
      .ilike("display_name", va_name.trim());
    const memberIds = (members || []).map((m: { user_id: string }) => m.user_id);

    // Also check auth users by name
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 50 });
    const authIds = (authUsers?.users || [])
      .filter(u => {
        const fullName = u.user_metadata?.full_name || u.user_metadata?.name || "";
        return fullName.toLowerCase().includes(va_name.trim().toLowerCase());
      })
      .map(u => u.id);

    const allMatchIds = [...memberIds, ...authIds];
    const assignedTo = video.assigned_to as string;

    if (!allMatchIds.includes(assignedTo)) {
      return NextResponse.json(
        { ok: false, error: "You are not assigned to this video", correlation_id: correlationId },
        { status: 403 }
      );
    }

    // Validate transition
    const currentStatus = video.recording_status;
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(recording_status)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot move from ${currentStatus} to ${recording_status}`,
          allowed_next: allowed,
          correlation_id: correlationId,
        },
        { status: 400 }
      );
    }

    // Validate required fields for specific transitions
    if (recording_status === "READY_TO_POST" && !video_url) {
      // Check if video already has a URL
      const { data: full } = await supabaseAdmin
        .from("videos")
        .select("final_video_url, google_drive_url")
        .eq("id", id)
        .single();
      if (!full?.final_video_url && !full?.google_drive_url) {
        return NextResponse.json(
          { ok: false, error: "Video URL is required before marking as ready to post", correlation_id: correlationId },
          { status: 400 }
        );
      }
    }

    if (recording_status === "POSTED" && !posted_url) {
      return NextResponse.json(
        { ok: false, error: "Posted URL is required when marking as posted", correlation_id: correlationId },
        { status: 400 }
      );
    }

    // Build update payload
    const update: Record<string, unknown> = {
      recording_status,
      last_status_changed_at: new Date().toISOString(),
    };

    if (notes) update.editor_notes = notes;
    if (video_url) {
      update.final_video_url = video_url;
      update.google_drive_url = video_url;
    }
    if (posted_url) update.posted_url = posted_url;
    if (posted_platform) update.posted_platform = posted_platform;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("videos")
      .update(update)
      .eq("id", id)
      .select("id, recording_status, last_status_changed_at")
      .single();

    if (updateError) {
      console.error(`[${correlationId}] VA status update error:`, updateError);
      return NextResponse.json(
        { ok: false, error: "Failed to update status", correlation_id: correlationId },
        { status: 500 }
      );
    }

    // Write event
    await supabaseAdmin.from("video_events").insert({
      video_id: id,
      event_type: "va_status_change",
      correlation_id: correlationId,
      actor: va_name,
      from_status: currentStatus,
      to_status: recording_status,
      details: { va_name, notes: notes || null },
    }).then(() => {}, (err: unknown) => console.error("Event write failed:", err));

    return NextResponse.json({
      ok: true,
      data: updated,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] VA status error:`, err);
    return NextResponse.json(
      { ok: false, error: "Internal server error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}
