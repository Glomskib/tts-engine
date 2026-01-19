import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("product_id");

  let query = supabaseAdmin
    .from("concepts")
    .select("*")
    .order("created_at", { ascending: false });

  if (productId) {
    query = query.eq("product_id", productId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const { product_id, title, source_url, notes } = body as Record<string, unknown>;

  if (typeof product_id !== "string" || product_id.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "product_id is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  if (typeof title !== "string" || title.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "title is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  const insertPayload: Record<string, unknown> = {
    product_id: product_id.trim(),
    concept_title: title.trim(),
    title: title.trim(), // Both title and concept_title are required
    core_angle: title.trim(), // core_angle is required, use title as default
  };
  if (source_url !== undefined) insertPayload.source_url = source_url;
  if (notes !== undefined) insertPayload.notes = notes;

  const { data, error } = await supabaseAdmin
    .from("concepts")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}
