import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - user must be logged in
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    let query = supabaseAdmin
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: false });

    // Filter by user_id if the table has one (admins see all)
    if (!authContext.isAdmin) {
      query = query.eq("user_id", authContext.user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/accounts Supabase error:", error);
      return NextResponse.json(
        { ok: false, error: error.message, correlation_id: correlationId },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data, correlation_id: correlationId });

  } catch (err) {
    console.error("GET /api/accounts error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - user must be logged in
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
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

  // Validate name is required
  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "name is required and must be a non-empty string", correlation_id: correlationId },
      { status: 400 }
    );
  }

  // Validate platform if provided
  if (platform !== undefined && typeof platform !== "string") {
    return NextResponse.json(
      { ok: false, error: "platform must be a string", correlation_id: correlationId },
      { status: 400 }
    );
  }

  try {
    const insertPayload: Record<string, unknown> = {
      name: name.trim(),
      platform: platform || "tiktok",
      user_id: authContext.user.id,  // Set user_id on insert
    };

    const { data, error } = await supabaseAdmin
      .from("accounts")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("POST /api/accounts Supabase error:", error);
      console.error("POST /api/accounts insert payload:", insertPayload);

      return NextResponse.json(
        { ok: false, error: error.message, correlation_id: correlationId },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data, correlation_id: correlationId });

  } catch (err) {
    console.error("POST /api/accounts error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}
