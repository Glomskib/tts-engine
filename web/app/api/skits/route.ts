import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";

export const runtime = "nodejs";

// --- Input Validation Schemas ---

const SkitBeatSchema = z.object({
  t: z.string(),
  action: z.string(),
  dialogue: z.string().optional(),
  on_screen_text: z.string().optional(),
});

const SkitDataSchema = z.object({
  hook_line: z.string(),
  beats: z.array(SkitBeatSchema),
  b_roll: z.array(z.string()),
  overlays: z.array(z.string()),
  cta_line: z.string(),
  cta_overlay: z.string(),
});

const GenerationConfigSchema = z.object({
  risk_tier: z.string().optional(),
  persona: z.string().optional(),
  chaos_level: z.number().optional(),
  intensity: z.number().optional(),
  actor_type: z.string().optional(),
  target_duration: z.string().optional(),
  content_format: z.string().optional(),
  preset_id: z.string().optional(),
  template_id: z.string().optional(),
  creative_direction: z.string().optional(),
}).optional();

const AIScoreSchema = z.object({
  hook_strength: z.number().min(1).max(10),
  humor_level: z.number().min(1).max(10),
  product_integration: z.number().min(1).max(10),
  virality_potential: z.number().min(1).max(10),
  clarity: z.number().min(1).max(10),
  production_feasibility: z.number().min(1).max(10),
  audience_language: z.number().min(1).max(10).optional(),
  overall_score: z.number().min(1).max(10),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
}).optional();

const SaveSkitInputSchema = z.object({
  title: z.string().min(1).max(200),
  skit_data: SkitDataSchema,
  generation_config: GenerationConfigSchema,
  product_id: z.string().uuid().optional(),
  product_name: z.string().max(100).optional(),
  product_brand: z.string().max(100).optional(),
  status: z.enum(['draft', 'approved', 'produced', 'posted', 'archived']).default('draft'),
  user_rating: z.number().int().min(1).max(5).optional(),
  ai_score: AIScoreSchema,
}).strict();

type SaveSkitInput = z.infer<typeof SaveSkitInputSchema>;

const VALID_STATUSES = ['draft', 'approved', 'produced', 'posted', 'archived'] as const;

// --- POST: Save a new skit ---

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Parse and validate input
  let input: SaveSkitInput;
  try {
    const body = await request.json();
    input = SaveSkitInputSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  try {
    // Insert the skit
    const { data: skit, error } = await supabaseAdmin
      .from("saved_skits")
      .insert({
        title: input.title,
        skit_data: input.skit_data,
        generation_config: input.generation_config || null,
        product_id: input.product_id || null,
        product_name: input.product_name || null,
        product_brand: input.product_brand || null,
        status: input.status,
        user_rating: input.user_rating || null,
        ai_score: input.ai_score || null,
        user_id: authContext.user.id,
      })
      .select("id, title, status, created_at")
      .single();

    if (error) {
      console.error(`[${correlationId}] Failed to save skit:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to save skit", 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data: skit,
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Skit save error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to save skit",
      500,
      correlationId
    );
  }
}

// --- GET: List saved skits ---

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  try {
    let query = supabaseAdmin
      .from("saved_skits")
      .select("id, title, status, product_name, product_brand, user_rating, ai_score, created_at, updated_at, video_id, is_winner, performance_metrics, posted_video_url", { count: "exact" })
      .eq("user_id", authContext.user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by status
    if (status && VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      query = query.eq("status", status);
    }

    // Search by title (case-insensitive)
    if (search && search.trim()) {
      query = query.ilike("title", `%${search.trim()}%`);
    }

    // Filter by winners
    const winnersOnly = searchParams.get("winners_only");
    if (winnersOnly === "true") {
      query = query.eq("is_winner", true);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error(`[${correlationId}] Failed to fetch skits:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch skits", 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data: data || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Skits fetch error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to fetch skits",
      500,
      correlationId
    );
  }
}
