import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { validateScriptJson, renderScriptText } from "@/lib/script-renderer";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    const err = apiError("INVALID_UUID", "Invalid script ID format", 400);
    return NextResponse.json(err.body, { status: err.status });
  }

  const { data, error } = await supabaseAdmin
    .from("scripts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      const err = apiError("NOT_FOUND", "Script not found", 404);
      return NextResponse.json(err.body, { status: err.status });
    }
    const err = apiError("DB_ERROR", error.message, 500);
    return NextResponse.json(err.body, { status: err.status });
  }

  return NextResponse.json({ ok: true, data });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    const err = apiError("INVALID_UUID", "Invalid script ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const {
    title,
    script_json,
    status: scriptStatus,
    on_screen_text,
    caption,
    hashtags,
    cta,
    spoken_script,
    editor_brief,
    increment_version,
  } = body as Record<string, unknown>;

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof title === "string") {
    updatePayload.title = title.trim() || null;
  }

  if (typeof scriptStatus === "string") {
    const validStatuses = ["DRAFT", "REVIEW", "APPROVED", "ARCHIVED"];
    if (!validStatuses.includes(scriptStatus)) {
      const err = apiError("INVALID_STATUS", `status must be one of: ${validStatuses.join(", ")}`, 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    updatePayload.status = scriptStatus;
  }

  // Handle script_json update - validate and re-render script_text
  if (script_json !== undefined) {
    if (script_json === null) {
      updatePayload.script_json = null;
      updatePayload.script_text = null;
    } else {
      const validation = validateScriptJson(script_json);
      if (!validation.valid) {
        const err = apiError("INVALID_SCRIPT_JSON", `Invalid script_json: ${validation.errors.join(", ")}`, 400);
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }
      updatePayload.script_json = script_json;
      updatePayload.script_text = renderScriptText(script_json as Parameters<typeof renderScriptText>[0]);
    }
  }

  // Legacy fields
  if (on_screen_text !== undefined) updatePayload.on_screen_text = on_screen_text;
  if (caption !== undefined) updatePayload.caption = caption;
  if (hashtags !== undefined) updatePayload.hashtags = hashtags;
  if (cta !== undefined) updatePayload.cta = cta;
  if (spoken_script !== undefined) updatePayload.spoken_script = spoken_script;
  if (editor_brief !== undefined) updatePayload.editor_brief = editor_brief;

  // If incrementing version, first fetch current version
  if (increment_version === true) {
    const { data: current, error: fetchError } = await supabaseAdmin
      .from("scripts")
      .select("version")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        const err = apiError("NOT_FOUND", "Script not found", 404);
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }
      const err = apiError("DB_ERROR", fetchError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    updatePayload.version = (current.version || 1) + 1;
  }

  const { data, error } = await supabaseAdmin
    .from("scripts")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      const err = apiError("NOT_FOUND", "Script not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    console.error("PUT /api/scripts/[id] error:", error);
    const err = apiError("DB_ERROR", error.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}
