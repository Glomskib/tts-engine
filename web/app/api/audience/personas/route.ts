import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";

export const runtime = "nodejs";

// --- Validation Schemas ---

const PainPointSchema = z.object({
  point: z.string(),
  intensity: z.enum(["low", "medium", "high", "extreme"]).optional(),
  triggers: z.array(z.string()).optional(),
});

const CreatePersonaSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  age_range: z.string().max(50).optional(),
  gender: z.string().max(50).optional(),
  lifestyle: z.string().max(200).optional(),
  pain_points: z.array(PainPointSchema).optional(),
  phrases_they_use: z.array(z.string()).optional(),
  phrases_to_avoid: z.array(z.string()).optional(),
  tone: z.string().max(50).optional(),
  humor_style: z.string().max(50).optional(),
  common_objections: z.array(z.string()).optional(),
  beliefs: z.record(z.string(), z.string()).optional(),
  content_they_engage_with: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
  product_categories: z.array(z.string()).optional(),
  product_ids: z.array(z.string().uuid()).optional(),
});

// --- GET: List personas ---

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

  try {
    let query = supabaseAdmin
      .from("audience_personas")
      .select("*")
      .order("times_used", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (category) {
      query = query.contains("product_categories", [category]);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`[${correlationId}] Failed to fetch personas:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch personas", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Personas error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to fetch personas", 500, correlationId);
  }
}

// --- POST: Create persona ---

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  console.log(`[${correlationId}] Creating persona, body:`, JSON.stringify(body).slice(0, 500));

  const parseResult = CreatePersonaSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
    console.error(`[${correlationId}] Validation failed:`, errors);
    return createApiErrorResponse("VALIDATION_ERROR", errors.join(", "), 400, correlationId);
  }

  const input = parseResult.data;
  console.log(`[${correlationId}] Validated input:`, JSON.stringify(input).slice(0, 500));

  try {
    const insertPayload = {
      ...input,
      created_by: authContext.user.id,
    };
    console.log(`[${correlationId}] Insert payload:`, JSON.stringify(insertPayload).slice(0, 500));

    const { data, error } = await supabaseAdmin
      .from("audience_personas")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Failed to create persona:`, error.message, error.details, error.hint);
      return createApiErrorResponse("DB_ERROR", `Failed to create persona: ${error.message}`, 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Create persona error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to create persona", 500, correlationId);
  }
}
