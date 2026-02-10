import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";

export const runtime = "nodejs";

// --- Validation ---

const CreatePainPointSchema = z.object({
  pain_point: z.string().min(1).max(500),
  category: z.string().max(50).optional(),
  when_it_happens: z.string().max(500).optional(),
  emotional_state: z.string().max(100).optional(),
  intensity: z.enum(["low", "medium", "high", "extreme"]).optional(),
  how_they_describe_it: z.array(z.string()).optional(),
  related_searches: z.array(z.string()).optional(),
  what_they_want: z.string().max(500).optional(),
  objections_to_solutions: z.array(z.string()).optional(),
  product_ids: z.array(z.string().uuid()).optional(),
});

const CATEGORIES = [
  "sleep", "energy", "stress", "weight", "skin", "digestion",
  "focus", "mood", "pain", "immunity", "aging", "fitness", "other"
];

// --- GET: List pain points ---

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const productId = searchParams.get("product_id");
  const search = searchParams.get("search");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 200);

  try {
    let query = supabaseAdmin
      .from("pain_points")
      .select("*")
      .order("times_used", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq("category", category);
    }

    if (productId) {
      query = query.contains("product_ids", [productId]);
    }

    if (search) {
      query = query.ilike("pain_point", `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`[${correlationId}] Failed to fetch pain points:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch pain points", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
      categories: CATEGORIES,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Pain points error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to fetch pain points", 500, correlationId);
  }
}

// --- POST: Create pain point ---

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const parseResult = CreatePainPointSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
    return createApiErrorResponse("VALIDATION_ERROR", errors.join(", "), 400, correlationId);
  }

  const input = parseResult.data;

  try {
    const { data, error } = await supabaseAdmin
      .from("pain_points")
      .insert({
        ...input,
        created_by: authContext.user.id,
      })
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Failed to create pain point:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to create pain point", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Create pain point error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to create pain point", 500, correlationId);
  }
}
