import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ ok: false, error: "Iteration group ID is required" }, { status: 400 });
    }
    if (!isUuid(id)) {
      return NextResponse.json({ ok: false, error: "Iteration group ID must be a UUID" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("iteration_groups")
      .select("id,winner_variant_id,concept_id,plan_json,status,error_message,created_at,updated_at")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch iteration group", supabase: error },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "Iteration group not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
