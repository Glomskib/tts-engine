import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { validateScriptJson, renderScriptText } from "@/lib/script-renderer";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - user must be logged in
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid script ID format", 400, correlationId);
  }

  // Build query - filter by created_by (admins can see all)
  let query = supabaseAdmin
    .from("scripts")
    .select("*")
    .eq("id", id);

  if (!authContext.isAdmin) {
    query = query.eq("created_by", authContext.user.id);
  }

  const { data, error } = await query.single();

  if (error) {
    if (error.code === "PGRST116") {
      return createApiErrorResponse("NOT_FOUND", "Script not found", 404, correlationId);
    }
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - user must be logged in
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid script ID format", 400, correlationId);
  }

  // Verify ownership first (admins can update any)
  let ownershipQuery = supabaseAdmin
    .from("scripts")
    .select("id")
    .eq("id", id);

  if (!authContext.isAdmin) {
    ownershipQuery = ownershipQuery.eq("created_by", authContext.user.id);
  }

  const { data: existing, error: existError } = await ownershipQuery.single();

  if (existError || !existing) {
    return createApiErrorResponse("NOT_FOUND", "Script not found", 404, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
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
      return createApiErrorResponse("INVALID_STATUS", `status must be one of: ${validStatuses.join(", ")}`, 400, correlationId);
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
        return createApiErrorResponse("INVALID_SCRIPT_JSON", `Invalid script_json: ${validation.errors.join(", ")}`, 400, correlationId);
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
        return createApiErrorResponse("NOT_FOUND", "Script not found", 404, correlationId);
      }
      return createApiErrorResponse("DB_ERROR", fetchError.message, 500, correlationId);
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
      return createApiErrorResponse("NOT_FOUND", "Script not found", 404, correlationId);
    }
    console.error("PUT /api/scripts/[id] error:", error);
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}
