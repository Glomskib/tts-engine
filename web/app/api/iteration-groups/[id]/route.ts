import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - user must be logged in
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ ok: false, error: "Iteration group ID is required", correlation_id: correlationId }, { status: 400 });
    }
    if (!isUuid(id)) {
      return NextResponse.json({ ok: false, error: "Iteration group ID must be a UUID", correlation_id: correlationId }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("iteration_groups")
      .select("id,winner_variant_id,concept_id,plan_json,status,error_message,created_at,updated_at")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch iteration group", supabase: error, correlation_id: correlationId },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "Iteration group not found", correlation_id: correlationId }, { status: 404 });
    }

    // Verify ownership via concept (admins can see all)
    if (!authContext.isAdmin && data.concept_id) {
      const { data: concept } = await supabaseAdmin
        .from("concepts")
        .select("id")
        .eq("id", data.concept_id)
        .eq("user_id", authContext.user.id)
        .single();

      if (!concept) {
        return NextResponse.json({ ok: false, error: "Iteration group not found", correlation_id: correlationId }, { status: 404 });
      }
    }

    return NextResponse.json({ ok: true, data, correlation_id: correlationId });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message, correlation_id: correlationId }, { status: 500 });
  }
}
