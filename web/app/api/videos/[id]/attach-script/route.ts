import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { renderScriptText, ScriptJson } from "@/lib/script-renderer";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id: videoId } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(videoId)) {
    const err = apiError("INVALID_UUID", "Invalid video ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const { script_id, force } = body as Record<string, unknown>;

  if (typeof script_id !== "string" || !uuidRegex.test(script_id)) {
    const err = apiError("BAD_REQUEST", "script_id is required and must be a valid UUID", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Fetch the video
  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("*")
    .eq("id", videoId)
    .single();

  if (videoError) {
    if (videoError.code === "PGRST116") {
      const err = apiError("NOT_FOUND", "Video not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    const err = apiError("DB_ERROR", videoError.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Check if video already has a locked script (unless force=true)
  const hadPreviousScript = video.script_locked_json != null;
  const previousLockedScript = hadPreviousScript ? {
    script_id: video.script_id,
    script_locked_json: video.script_locked_json,
    script_locked_text: video.script_locked_text,
    script_locked_version: video.script_locked_version,
  } : null;

  if (hadPreviousScript && force !== true) {
    const err = apiError("SCRIPT_ALREADY_LOCKED", "Video already has a locked script. Use force=true to override.", 409);
    return NextResponse.json({
      ...err.body,
      correlation_id: correlationId,
      previous_locked_script: previousLockedScript,
    }, { status: err.status });
  }

  // Fetch the script
  const { data: script, error: scriptError } = await supabaseAdmin
    .from("scripts")
    .select("*")
    .eq("id", script_id)
    .single();

  if (scriptError) {
    if (scriptError.code === "PGRST116") {
      const err = apiError("NOT_FOUND", "Script not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    const err = apiError("DB_ERROR", scriptError.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Check if script is approved (optional - can be enforced or just warned)
  if (script.status !== "APPROVED" && force !== true) {
    const err = apiError("SCRIPT_NOT_APPROVED", `Script status is '${script.status}', not APPROVED. Use force=true to attach anyway.`, 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Prepare the locked content
  // If script has script_json, use that; otherwise construct from legacy fields
  let lockedJson: ScriptJson | null = script.script_json;
  let lockedText: string | null = script.script_text;

  if (!lockedJson) {
    // Construct from legacy fields
    lockedJson = {
      hook: script.spoken_script?.split("\n")[0] || "",
      body: script.spoken_script || "",
      cta: script.cta || "",
      bullets: [],
    };
  }

  if (!lockedText) {
    // Use canonical renderer for consistency
    lockedText = renderScriptText(lockedJson);
  }

  // Update the video with script reference and locked content
  const { data: updatedVideo, error: updateError } = await supabaseAdmin
    .from("videos")
    .update({
      script_id: script_id,
      script_locked_json: lockedJson,
      script_locked_text: lockedText,
      script_locked_version: script.version || 1,
    })
    .eq("id", videoId)
    .select()
    .single();

  if (updateError) {
    console.error("Failed to attach script to video:", updateError);
    const err = apiError("DB_ERROR", updateError.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Log video_event if this was a force overwrite
  if (hadPreviousScript && force === true) {
    const { error: eventError } = await supabaseAdmin.from("video_events").insert({
      video_id: videoId,
      event_type: "script_force_overwrite",
      correlation_id: correlationId,
      actor: "api",
      details: {
        previous_script_id: previousLockedScript?.script_id,
        previous_script_version: previousLockedScript?.script_locked_version,
        new_script_id: script_id,
        new_script_version: script.version || 1,
      },
    });
    if (eventError) {
      console.error("Failed to log script_force_overwrite event:", eventError);
      // Continue anyway - event logging is non-blocking
    }
  }

  return NextResponse.json({
    ok: true,
    data: updatedVideo,
    meta: {
      script_id: script_id,
      script_version: script.version,
      script_status: script.status,
      locked_at: new Date().toISOString(),
      force_overwrite: hadPreviousScript && force === true,
      previous_locked_script: hadPreviousScript ? previousLockedScript : undefined,
    },
    correlation_id: correlationId,
  });
}
