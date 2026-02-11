import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - supports SESSION, API KEY (ff_ak_*), or SERVICE_API_KEY
  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  const userId = auth.userId;

  const { data, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("user_id", userId)  // Filter by user_id
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, correlation_id: correlationId },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ ok: true, data, correlation_id: correlationId });
  response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
  return response;
}

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - supports SESSION, API KEY (ff_ak_*), or SERVICE_API_KEY
  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  const userId = auth.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON", correlation_id: correlationId },
      { status: 400 }
    );
  }

  const { name, brand, category, category_risk, notes, brand_id, description, link, product_image_url, images } = body as Record<string, unknown>;

  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "name is required and must be a non-empty string", correlation_id: correlationId },
      { status: 400 }
    );
  }

  if (typeof brand !== "string" || brand.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "brand is required and must be a non-empty string", correlation_id: correlationId },
      { status: 400 }
    );
  }

  if (typeof category !== "string" || category.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "category is required and must be a non-empty string", correlation_id: correlationId },
      { status: 400 }
    );
  }

  const insertPayload: Record<string, unknown> = {
    name: name.trim(),
    brand: brand.trim(),
    category: category.trim(),
    user_id: userId,  // Set user_id on insert
  };
  if (category_risk !== undefined) insertPayload.category_risk = category_risk;
  if (notes !== undefined) insertPayload.notes = notes;
  if (brand_id !== undefined) insertPayload.brand_id = brand_id;
  if (description !== undefined) insertPayload.description = description;
  if (link !== undefined) insertPayload.primary_link = link;
  if (product_image_url !== undefined) insertPayload.product_image_url = product_image_url;
  if (images !== undefined) insertPayload.images = images;

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
      { ok: false, error: error.message, correlation_id: correlationId },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}
