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

  // Fetch current script to check its state
  const { data: script, error: fetchError } = await supabaseAdmin
    .from("scripts")
    .select("*")
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

  // Check if already approved
  if (script.status === "APPROVED") {
    return NextResponse.json({
      ok: true,
      data: script,
      message: "Script is already approved",
      correlation_id: correlationId,
    });
  }

  // Validate script has required content before approval
  const hasContent = script.script_json || script.spoken_script || script.script_text;
  if (!hasContent) {
    const err = apiError("BAD_REQUEST", "Cannot approve script without content (script_json, spoken_script, or script_text required)", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Update status to APPROVED
  const { data: updatedScript, error: updateError } = await supabaseAdmin
    .from("scripts")
    .update({
      status: "APPROVED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("Failed to approve script:", updateError);
    const err = apiError("DB_ERROR", updateError.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  return NextResponse.json({
    ok: true,
    data: updatedScript,
    meta: {
      previous_status: script.status,
      new_status: "APPROVED",
    },
    correlation_id: correlationId,
  });
}
