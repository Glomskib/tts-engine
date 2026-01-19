import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

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

  const { name, brand, category, category_risk, notes } = body as Record<string, unknown>;

  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "name is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  if (typeof brand !== "string" || brand.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "brand is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  if (typeof category !== "string" || category.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "category is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  const insertPayload: Record<string, unknown> = {
    name: name.trim(),
    brand: brand.trim(),
    category: category.trim(),
  };
  if (category_risk !== undefined) insertPayload.category_risk = category_risk;
  if (notes !== undefined) insertPayload.notes = notes;

  const { data, error } = await supabaseAdmin
    .from("products")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error("POST /api/products Supabase error:", error);
    console.error("POST /api/products insert payload:", {
      name,
      brand,
      category_risk,
      notes,
    });

    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}
