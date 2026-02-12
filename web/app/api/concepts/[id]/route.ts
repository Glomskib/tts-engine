import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId } from "@/lib/api-errors";
import { isValidUuid } from "@/lib/validate-uuid";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/concepts/[id]
 * Fetch a single concept by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  if (!isValidUuid(id)) {
    return NextResponse.json({ ok: false, error: "Invalid concept ID format", correlation_id: correlationId }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("concepts")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json(
      { ok: false, error: error.message, correlation_id: correlationId },
      { status }
    );
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

/**
 * PATCH /api/concepts/[id]
 * Update a concept's fields
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  if (!isValidUuid(id)) {
    return NextResponse.json({ ok: false, error: "Invalid concept ID format", correlation_id: correlationId }, { status: 400 });
  }

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

  // Allowlist of fields that can be updated
  const allowedFields = [
    "title",
    "concept_title",
    "angle",
    "core_angle",
    "hypothesis",
    "proof_type",
    "hook_options",
    "notes",
    "visual_hook",
    "on_screen_text_hook",
    "on_screen_text_mid",
    "on_screen_text_cta",
    "hook_type",
    "source_url",
  ];

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
    .from("concepts")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, correlation_id: correlationId },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

/**
 * DELETE /api/concepts/[id]
 * Delete a concept
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  if (!isValidUuid(id)) {
    return NextResponse.json({ ok: false, error: "Invalid concept ID format", correlation_id: correlationId }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("concepts")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, correlation_id: correlationId },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, deleted: id, correlation_id: correlationId });
}
