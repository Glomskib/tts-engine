import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

// Validation schema for product updates
const UpdateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  product_display_name: z.string().max(30).optional().nullable(),
  brand: z.string().min(1).max(255).optional(),
  category: z.string().min(1).max(100).optional(),
  category_risk: z.enum(["low", "medium", "high"]).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  primary_link: z.string().url().max(500).optional().nullable(),
  tiktok_showcase_url: z.string().url().max(500).optional().nullable(),
  slug: z.string().max(100).optional().nullable(),
});

/**
 * GET /api/products/[id]
 * Fetch a single product by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || id.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "Product ID is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", id.trim())
    .single();

  if (error) {
    console.error("GET /api/products/[id] error:", error);
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { ok: false, error: "Product not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}

/**
 * PATCH /api/products/[id]
 * Update a product by ID (admin only)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || id.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "Product ID is required" },
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

  // Validate input
  const parseResult = UpdateProductSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: errors },
      { status: 400 }
    );
  }

  const updates = parseResult.data;

  // Check if any fields were provided
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { ok: false, error: "No fields to update" },
      { status: 400 }
    );
  }

  // Verify product exists
  const { data: existing, error: existError } = await supabaseAdmin
    .from("products")
    .select("id, name, brand")
    .eq("id", id.trim())
    .single();

  if (existError || !existing) {
    return NextResponse.json(
      { ok: false, error: "Product not found" },
      { status: 404 }
    );
  }

  // Build update payload (only include non-undefined fields)
  const updatePayload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      updatePayload[key] = value;
    }
  }

  // Update the product
  const { data, error } = await supabaseAdmin
    .from("products")
    .update(updatePayload)
    .eq("id", id.trim())
    .select()
    .single();

  if (error) {
    console.error("PATCH /api/products/[id] error:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}

/**
 * DELETE /api/products/[id]
 * Delete a product by ID (admin only)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || id.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "Product ID is required" },
      { status: 400 }
    );
  }

  // Verify product exists
  const { data: existing, error: existError } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("id", id.trim())
    .single();

  if (existError || !existing) {
    return NextResponse.json(
      { ok: false, error: "Product not found" },
      { status: 404 }
    );
  }

  // Check if product has associated videos
  const { count: videoCount } = await supabaseAdmin
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id.trim());

  if (videoCount && videoCount > 0) {
    return NextResponse.json(
      { ok: false, error: `Cannot delete product with ${videoCount} associated videos. Archive instead.` },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("products")
    .delete()
    .eq("id", id.trim());

  if (error) {
    console.error("DELETE /api/products/[id] error:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, deleted: id.trim() });
}
