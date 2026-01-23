import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
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

  const { rewrite_id } = body as Record<string, unknown>;

  if (typeof rewrite_id !== "string" || !uuidRegex.test(rewrite_id)) {
    const err = apiError("BAD_REQUEST", "rewrite_id is required and must be a valid UUID", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Fetch the rewrite record
  const { data: rewrite, error: rewriteError } = await supabaseAdmin
    .from("script_rewrites")
    .select("*")
    .eq("id", rewrite_id)
    .eq("script_id", id)
    .single();

  if (rewriteError) {
    if (rewriteError.code === "PGRST116") {
      const err = apiError("NOT_FOUND", "Rewrite record not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    const err = apiError("DB_ERROR", rewriteError.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Check if rewrite has valid content (not a failed rewrite)
  if (!rewrite.rewrite_result_json) {
    const err = apiError("BAD_REQUEST", "Cannot restore from a failed rewrite (no valid content)", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Fetch current script to get version
  const { data: script, error: scriptError } = await supabaseAdmin
    .from("scripts")
    .select("version")
    .eq("id", id)
    .single();

  if (scriptError) {
    if (scriptError.code === "PGRST116") {
      const err = apiError("NOT_FOUND", "Script not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    const err = apiError("DB_ERROR", scriptError.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Update the script with restored content and increment version
  const { data: updatedScript, error: updateError } = await supabaseAdmin
    .from("scripts")
    .update({
      script_json: rewrite.rewrite_result_json,
      script_text: rewrite.rewrite_result_text,
      version: (script.version || 1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("Failed to restore script:", updateError);
    const err = apiError("DB_ERROR", updateError.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  return NextResponse.json({
    ok: true,
    data: updatedScript,
    meta: {
      restored_from_rewrite_id: rewrite_id,
      restored_from_date: rewrite.created_at,
      previous_version: script.version || 1,
      new_version: updatedScript.version,
    },
    correlation_id: correlationId,
  });
}
