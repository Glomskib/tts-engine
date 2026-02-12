import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid template ID format", 400, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from("script_templates")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return createApiErrorResponse("NOT_FOUND", "Template not found", 404, correlationId);
    }
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid template ID format", 400, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const { name, category, tags, template_json } = body as Record<string, unknown>;

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof name === "string" && name.trim()) {
    updatePayload.name = name.trim();
  }

  if (category !== undefined) {
    updatePayload.category = typeof category === "string" && category.trim() ? category.trim() : null;
  }

  if (tags !== undefined) {
    if (Array.isArray(tags)) {
      updatePayload.tags = tags.filter((t): t is string => typeof t === "string");
    } else if (tags === null) {
      updatePayload.tags = null;
    }
  }

  if (template_json !== undefined && typeof template_json === "object" && template_json !== null) {
    updatePayload.template_json = template_json;
  }

  const { data, error } = await supabaseAdmin
    .from("script_templates")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return createApiErrorResponse("NOT_FOUND", "Template not found", 404, correlationId);
    }
    console.error("PUT /api/script-templates/[id] error:", error);
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}
