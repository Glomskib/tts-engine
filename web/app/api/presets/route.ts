import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

// --- System presets seeded on first GET if none exist ---

const SYSTEM_PRESETS = [
  {
    name: "Trending Hook + Product",
    is_system: true,
    config: {
      content_type: "tof",
      subtype: "hook_teaser",
      tone: "energetic",
      beat_count: 4,
      creative_direction:
        "Start with a trending hook pattern, showcase product benefits, end with strong CTA",
      presentation: "talking_head",
      target_length: "short",
    },
  },
  {
    name: "Pain Point Skit",
    is_system: true,
    config: {
      content_type: "skit",
      subtype: "dialogue_skit",
      tone: "relatable",
      beat_count: 5,
      creative_direction:
        "Open with relatable pain point, comedic escalation, product saves the day",
      presentation: "human_actor",
      target_length: "medium",
    },
  },
  {
    name: "Before/After",
    is_system: true,
    config: {
      content_type: "testimonial",
      subtype: "before_after",
      tone: "authentic",
      beat_count: 4,
      creative_direction:
        "Show the problem state, transition moment, amazing result with product",
      presentation: "ugc_iphone",
      target_length: "short",
    },
  },
  {
    name: "Customer Testimonial",
    is_system: true,
    config: {
      content_type: "testimonial",
      subtype: "customer_story",
      tone: "genuine",
      beat_count: 4,
      creative_direction:
        "Real customer voice, specific results, emotional transformation",
      presentation: "ugc_iphone",
      target_length: "short",
    },
  },
  {
    name: "Unboxing Reaction",
    is_system: true,
    config: {
      content_type: "tof",
      subtype: "viral_moment",
      tone: "excited",
      beat_count: 3,
      creative_direction:
        "Genuine first reaction, highlight packaging and product quality, shareworthy moment",
      presentation: "ugc_iphone",
      target_length: "micro",
    },
  },
  {
    name: "Day in Life with Product",
    is_system: true,
    config: {
      content_type: "story",
      subtype: "personal_story",
      tone: "lifestyle",
      beat_count: 5,
      creative_direction:
        "Morning routine or daily life, natural product integration, aspirational lifestyle",
      presentation: "voiceover",
      target_length: "medium",
    },
  },
];

// --- GET: Return all presets (system + user custom) ---

export async function GET(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  try {
    // Check if system presets exist
    const { data: systemCheck, error: systemCheckError } = await supabaseAdmin
      .from("script_presets")
      .select("id")
      .eq("is_system", true)
      .limit(1);

    if (systemCheckError) {
      console.error(
        `[${correlationId}] Presets system check error:`,
        systemCheckError
      );
      return createApiErrorResponse(
        "DB_ERROR",
        "Failed to check system presets",
        500,
        correlationId
      );
    }

    // Seed system presets if none exist
    if (!systemCheck || systemCheck.length === 0) {
      const { error: seedError } = await supabaseAdmin
        .from("script_presets")
        .insert(SYSTEM_PRESETS);

      if (seedError) {
        console.error(
          `[${correlationId}] Presets seed error:`,
          seedError
        );
        // Non-fatal: continue to fetch whatever exists
      }
    }

    // Fetch system presets + user's custom presets
    const { data, error } = await supabaseAdmin
      .from("script_presets")
      .select("*")
      .or(`is_system.eq.true,user_id.eq.${authContext.user.id}`)
      .order("is_system", { ascending: false })
      .order("usage_count", { ascending: false });

    if (error) {
      console.error(`[${correlationId}] Presets GET error:`, error);
      return createApiErrorResponse(
        "DB_ERROR",
        "Failed to fetch presets",
        500,
        correlationId
      );
    }

    const response = NextResponse.json({
      ok: true,
      data: data || [],
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Presets GET error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to fetch presets",
      500,
      correlationId
    );
  }
}

// --- POST: Create a custom preset ---

export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Invalid JSON body",
      400,
      correlationId
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "name is required",
      400,
      correlationId
    );
  }

  if (!body.config || typeof body.config !== "object") {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "config object is required",
      400,
      correlationId
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("script_presets")
      .insert({
        user_id: authContext.user.id,
        name,
        config: body.config,
        is_system: false,
      })
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Presets POST error:`, error);
      return createApiErrorResponse(
        "DB_ERROR",
        "Failed to create preset",
        500,
        correlationId
      );
    }

    const response = NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Presets POST error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to create preset",
      500,
      correlationId
    );
  }
}

// --- PATCH: Increment usage count ---

export async function PATCH(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Invalid JSON body",
      400,
      correlationId
    );
  }

  const presetId = typeof body.preset_id === "string" ? body.preset_id : "";
  if (!presetId) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "preset_id is required",
      400,
      correlationId
    );
  }

  try {
    // Fetch current usage_count
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("script_presets")
      .select("id, usage_count")
      .eq("id", presetId)
      .single();

    if (fetchError || !existing) {
      return createApiErrorResponse(
        "NOT_FOUND",
        "Preset not found",
        404,
        correlationId
      );
    }

    // Increment usage_count
    const { data, error } = await supabaseAdmin
      .from("script_presets")
      .update({ usage_count: (existing.usage_count || 0) + 1 })
      .eq("id", presetId)
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Presets PATCH error:`, error);
      return createApiErrorResponse(
        "DB_ERROR",
        "Failed to update preset usage",
        500,
        correlationId
      );
    }

    const response = NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Presets PATCH error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to update preset",
      500,
      correlationId
    );
  }
}

// --- DELETE: Delete a custom preset (not system presets) ---

export async function DELETE(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Invalid JSON body",
      400,
      correlationId
    );
  }

  const presetId = typeof body.preset_id === "string" ? body.preset_id : "";
  if (!presetId) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "preset_id is required",
      400,
      correlationId
    );
  }

  try {
    // Only delete custom presets owned by this user
    const { data, error } = await supabaseAdmin
      .from("script_presets")
      .delete()
      .eq("id", presetId)
      .eq("is_system", false)
      .eq("user_id", authContext.user.id)
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Presets DELETE error:`, error);
      return createApiErrorResponse(
        "NOT_FOUND",
        "Preset not found or cannot be deleted",
        404,
        correlationId
      );
    }

    const response = NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Presets DELETE error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to delete preset",
      500,
      correlationId
    );
  }
}
