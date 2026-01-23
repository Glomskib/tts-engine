import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    const err = apiError("INVALID_UUID", "Invalid script ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Fetch rewrite history for this script
  const { data, error } = await supabaseAdmin
    .from("script_rewrites")
    .select("id, rewrite_prompt, rewrite_result_json, rewrite_result_text, model, created_at, error_metadata")
    .eq("script_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    const err = apiError("DB_ERROR", error.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  return NextResponse.json({
    ok: true,
    data: data || [],
    correlation_id: correlationId,
  });
}
