import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { enforceRateLimits, extractRateLimitContext } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";

export const runtime = "nodejs";

// --- Input Validation Schema ---

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
  preset_id: z.string().optional(),
  template_id: z.string().optional(),
  creative_direction: z.string().optional(),
}).optional();

const RateSkitInputSchema = z.object({
  skit_data: SkitDataSchema,
  rating: z.number().int().min(1).max(5),
  feedback: z.string().max(1000).optional(),
  product_id: z.string().uuid().optional(),
  product_name: z.string().max(100).optional(),
  product_brand: z.string().max(100).optional(),
  generation_config: GenerationConfigSchema,
}).strict();

type RateSkitInput = z.infer<typeof RateSkitInputSchema>;

// --- Main API Handler ---

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Rate limiting (light DB-only - 20 req/min)
  const rateLimitResponse = enforceRateLimits(
    { userId: authContext.user.id, ...extractRateLimitContext(request) },
    correlationId,
    { userLimit: 20 }
  );
  if (rateLimitResponse) return rateLimitResponse;

  // Parse and validate input
  let input: RateSkitInput;
  try {
    const body = await request.json();
    input = RateSkitInputSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  try {
    // Insert the rating
    const { data: rating, error } = await supabaseAdmin
      .from("skit_ratings")
      .insert({
        skit_data: input.skit_data,
        rating: input.rating,
        feedback: input.feedback || null,
        user_id: authContext.user.id,
        org_id: null, // TODO: Add org support when available
        product_id: input.product_id || null,
        product_name: input.product_name || null,
        product_brand: input.product_brand || null,
        generation_config: input.generation_config || null,
      })
      .select("id, rating, created_at")
      .single();

    if (error) {
      console.error(`[${correlationId}] Failed to save rating:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to save rating", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: rating.id,
        rating: rating.rating,
        created_at: rating.created_at,
      },
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] Rating save error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to save rating",
      500,
      correlationId
    );
  }
}
