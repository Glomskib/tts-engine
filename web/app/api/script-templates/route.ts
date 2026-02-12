import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");

  let query = supabaseAdmin
    .from("script_templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

export async function POST(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const { name, category, tags, template_json, created_by } = body as Record<string, unknown>;

  // Validate required fields
  if (typeof name !== "string" || name.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "name is required and must be a non-empty string", 400, correlationId);
  }

  if (template_json === undefined || template_json === null || typeof template_json !== "object") {
    return createApiErrorResponse("BAD_REQUEST", "template_json is required and must be an object", 400, correlationId);
  }

  // Validate tags if provided
  if (tags !== undefined && !Array.isArray(tags)) {
    return createApiErrorResponse("BAD_REQUEST", "tags must be an array of strings", 400, correlationId);
  }

  const insertPayload: Record<string, unknown> = {
    name: name.trim(),
    template_json,
  };

  if (typeof category === "string" && category.trim()) {
    insertPayload.category = category.trim();
  }

  if (Array.isArray(tags)) {
    insertPayload.tags = tags.filter((t): t is string => typeof t === "string");
  }

  if (typeof created_by === "string" && created_by.trim()) {
    insertPayload.created_by = created_by.trim();
  }

  const { data, error } = await supabaseAdmin
    .from("script_templates")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error("POST /api/script-templates error:", error);
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}
