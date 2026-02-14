import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";
import { meetsMinPlan } from "@/lib/plans";

export const runtime = "nodejs";

// --- Validation Schemas ---

const PainPointSchema = z.object({
  point: z.string(),
  intensity: z.enum(["low", "medium", "high", "extreme"]).optional(),
  triggers: z.array(z.string()).optional(),
});

const CreatePersonaSchema = z.object({
  // Core Identity
  name: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  avatar_type: z.string().max(50).optional(),

  // Demographics
  age_range: z.string().max(50).optional(),
  gender: z.string().max(50).optional(),
  income_level: z.string().max(50).optional(),
  location_type: z.string().max(50).optional(),
  life_stage: z.string().max(100).optional(),
  lifestyle: z.string().max(200).optional(),

  // Psychographics
  values: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
  personality_traits: z.array(z.string()).optional(),

  // Communication Style
  tone: z.string().max(50).optional(), // legacy
  tone_preference: z.string().max(50).optional(),
  humor_style: z.string().max(50).optional(),
  attention_span: z.string().max(100).optional(),
  trust_builders: z.array(z.string()).optional(),
  phrases_they_use: z.array(z.string()).optional(),
  phrases_to_avoid: z.array(z.string()).optional(),

  // Pain Points & Motivations
  pain_points: z.array(PainPointSchema).optional(), // legacy
  primary_pain_points: z.array(z.string()).optional(),
  emotional_triggers: z.array(z.string()).optional(),
  buying_objections: z.array(z.string()).optional(),
  purchase_motivators: z.array(z.string()).optional(),
  common_objections: z.array(z.string()).optional(), // legacy

  // Content Preferences
  content_they_engage_with: z.array(z.string()).optional(), // legacy
  content_types_preferred: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
  best_posting_times: z.string().max(200).optional(),

  // Legacy/Deprecated
  beliefs: z.record(z.string(), z.string()).optional(),
  product_categories: z.array(z.string()).optional(),
  product_ids: z.array(z.string().uuid()).optional(),
});

// --- GET: List personas ---

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

  try {
    // Query personas - include system personas AND user's own personas
    let query = supabaseAdmin
      .from("audience_personas")
      .select("*")
      .or(`is_system.eq.true,user_id.eq.${authContext.user.id},created_by.eq.${authContext.user.id}`)
      .order("is_system", { ascending: false }) // System personas first
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
      console.error(`[${correlationId}] Failed to fetch personas:`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return NextResponse.json({
        ok: false,
        error: `DB_ERROR: ${error.message}`,
        details: error.details,
        hint: error.hint,
        code: error.code,
        correlation_id: correlationId,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
      correlation_id: correlationId,
    });
  } catch (error) {
    const err = error as Error;
    console.error(`[${correlationId}] Personas error:`, err.message, err.stack);
    return NextResponse.json({
      ok: false,
      error: `INTERNAL: ${err.message}`,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      correlation_id: correlationId,
    }, { status: 500 });
  }
}

// --- POST: Create persona ---

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Plan gate: custom personas require Creator Pro or higher
  if (!authContext.isAdmin) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("plan_id")
      .eq("id", authContext.user.id)
      .single();

    const userPlan = profile?.plan_id || "free";
    if (!meetsMinPlan(userPlan, "creator_pro")) {
      return createApiErrorResponse(
        "FORBIDDEN",
        "Custom personas require Creator Pro or higher",
        403,
        correlationId
      );
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const parseResult = CreatePersonaSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
    console.error(`[${correlationId}] Validation failed:`, errors);
    return createApiErrorResponse("VALIDATION_ERROR", errors.join(", "), 400, correlationId);
  }

  const input = parseResult.data;

  try {
    const insertPayload = {
      ...input,
      created_by: authContext.user.id,
    };

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
