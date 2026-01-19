import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { ok: false, error: "Account ID is required" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const { name, platform } = body as Record<string, unknown>;

  // Validate fields if provided
  if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
    return NextResponse.json(
      { ok: false, error: "name must be a non-empty string" },
      { status: 400 }
    );
  }

  if (platform !== undefined && typeof platform !== "string") {
    return NextResponse.json(
      { ok: false, error: "platform must be a string" },
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
        { ok: false, error: "No valid fields provided for update" },
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
          { ok: false, error: "Account not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });

  } catch (err) {
    console.error("PATCH /api/accounts/[id] error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
