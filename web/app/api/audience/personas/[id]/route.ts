import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";

export const runtime = "nodejs";

const PainPointSchema = z.object({
  point: z.string(),
  intensity: z.enum(["low", "medium", "high", "extreme"]).optional(),
  triggers: z.array(z.string()).optional(),
});

const UpdatePersonaSchema = z.object({
  // Core Identity
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  avatar_type: z.string().max(50).optional().nullable(),

  // Demographics
  age_range: z.string().max(50).optional().nullable(),
  gender: z.string().max(50).optional().nullable(),
  income_level: z.string().max(50).optional().nullable(),
  location_type: z.string().max(50).optional().nullable(),
  life_stage: z.string().max(100).optional().nullable(),
  lifestyle: z.string().max(200).optional().nullable(),

  // Psychographics
  values: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
  personality_traits: z.array(z.string()).optional(),

  // Communication Style
  tone: z.string().max(50).optional().nullable(), // legacy
  tone_preference: z.string().max(50).optional().nullable(),
  humor_style: z.string().max(50).optional().nullable(),
  attention_span: z.string().max(100).optional().nullable(),
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
  best_posting_times: z.string().max(200).optional().nullable(),

  // Legacy/Deprecated
  beliefs: z.record(z.string(), z.string()).optional(),
  product_categories: z.array(z.string()).optional(),
  product_ids: z.array(z.string().uuid()).optional(),
});

// --- GET: Single persona ---

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("audience_personas")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return createApiErrorResponse("NOT_FOUND", "Persona not found", 404, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Get persona error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to fetch persona", 500, correlationId);
  }
}

// --- PATCH: Update persona ---

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const parseResult = UpdatePersonaSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
    return createApiErrorResponse("VALIDATION_ERROR", errors.join(", "), 400, correlationId);
  }

  const updates = parseResult.data;

  try {
    const { data, error } = await supabaseAdmin
      .from("audience_personas")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Failed to update persona:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to update persona", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Update persona error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to update persona", 500, correlationId);
  }
}

// --- DELETE: Delete persona ---

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    const { error } = await supabaseAdmin
      .from("audience_personas")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(`[${correlationId}] Failed to delete persona:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to delete persona", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      deleted: id,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Delete persona error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to delete persona", 500, correlationId);
  }
}
