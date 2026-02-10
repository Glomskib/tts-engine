import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - user must be logged in
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { ok: false, error: "Account ID is required", correlation_id: correlationId },
      { status: 400 }
    );
  }

  // Verify ownership first (admins can update any)
  let ownershipQuery = supabaseAdmin
    .from("accounts")
    .select("id")
    .eq("id", id);

  if (!authContext.isAdmin) {
    ownershipQuery = ownershipQuery.eq("user_id", authContext.user.id);
  }

  const { data: existing, error: existError } = await ownershipQuery.single();

  if (existError || !existing) {
    return NextResponse.json(
      { ok: false, error: "Account not found", correlation_id: correlationId },
      { status: 404 }
    );
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

  const { name, platform } = body as Record<string, unknown>;

  // Validate fields if provided
  if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
    return NextResponse.json(
      { ok: false, error: "name must be a non-empty string", correlation_id: correlationId },
      { status: 400 }
    );
  }

  if (platform !== undefined && typeof platform !== "string") {
    return NextResponse.json(
      { ok: false, error: "platform must be a string", correlation_id: correlationId },
      { status: 400 }
    );
  }

  try {
    // Build update payload
    const updatePayload: Record<string, unknown> = {};

    if (name !== undefined) {
      updatePayload.name = name.trim();
    }
    if (platform !== undefined) {
      updatePayload.platform = platform;
    }

    // Add updated_at timestamp
    updatePayload.updated_at = new Date().toISOString();

    // If no valid fields to update
    if (Object.keys(updatePayload).length === 1) { // Only updated_at
      return NextResponse.json(
        { ok: false, error: "No valid fields provided for update", correlation_id: correlationId },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("accounts")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("PATCH /api/accounts/[id] Supabase error:", error);
      console.error("PATCH /api/accounts/[id] update payload:", updatePayload);

      if (error.code === "PGRST116") {
        return NextResponse.json(
          { ok: false, error: "Account not found", correlation_id: correlationId },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { ok: false, error: error.message, correlation_id: correlationId },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data, correlation_id: correlationId });

  } catch (err) {
    console.error("PATCH /api/accounts/[id] error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}
