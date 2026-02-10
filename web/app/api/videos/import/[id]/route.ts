import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";

export const runtime = "nodejs";

// --- Validation Schemas ---

const UpdateImportSchema = z.object({
  title: z.string().max(500).optional().nullable(),
  transcript: z.string().max(50000).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  hashtags: z.array(z.string()).optional().nullable(),
  views: z.number().int().min(0).optional().nullable(),
  likes: z.number().int().min(0).optional().nullable(),
  comments: z.number().int().min(0).optional().nullable(),
  shares: z.number().int().min(0).optional().nullable(),
  engagement_rate: z.number().min(0).max(1).optional().nullable(),
  creator_handle: z.string().max(100).optional().nullable(),
  creator_followers: z.number().int().min(0).optional().nullable(),
  hook_line: z.string().max(500).optional().nullable(),
  hook_style: z.string().max(50).optional().nullable(),
  content_format: z.string().max(50).optional().nullable(),
  comedy_style: z.string().max(50).optional().nullable(),
  product_mentioned: z.string().max(200).optional().nullable(),
  ai_analysis: z.record(z.string(), z.unknown()).optional().nullable(),
  product_id: z.string().uuid().optional().nullable(),
  status: z.enum(['pending', 'processing', 'analyzed', 'error']).optional(),
  error_message: z.string().max(1000).optional().nullable(),
  video_posted_at: z.string().datetime().optional().nullable(),
}).strict();

// --- GET: Get single imported video ---

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  // Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!id || id.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Video ID is required", 400, correlationId);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("imported_videos")
      .select("*")
      .eq("id", id.trim())
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
      }
      console.error(`[${correlationId}] Failed to fetch video:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch video", 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Fetch video error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to fetch video",
      500,
      correlationId
    );
  }
}

// --- PATCH: Update imported video ---

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  // Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!id || id.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Video ID is required", 400, correlationId);
  }

  // Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const parseResult = UpdateImportSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
    return createApiErrorResponse("VALIDATION_ERROR", "Validation failed", 400, correlationId, { errors });
  }

  const updates = parseResult.data;

  if (Object.keys(updates).length === 0) {
    return createApiErrorResponse("BAD_REQUEST", "No fields to update", 400, correlationId);
  }

  try {
    // Verify video exists
    const { data: existing, error: existError } = await supabaseAdmin
      .from("imported_videos")
      .select("id")
      .eq("id", id.trim())
      .single();

    if (existError || !existing) {
      return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
    }

    // Calculate engagement rate if metrics provided
    const updatePayload: Record<string, unknown> = { ...updates };

    if (updates.views !== undefined || updates.likes !== undefined ||
        updates.comments !== undefined || updates.shares !== undefined) {
      // Get current values for calculation
      const { data: current } = await supabaseAdmin
        .from("imported_videos")
        .select("views, likes, comments, shares")
        .eq("id", id.trim())
        .single();

      const views = updates.views ?? current?.views ?? 0;
      const likes = updates.likes ?? current?.likes ?? 0;
      const comments = updates.comments ?? current?.comments ?? 0;
      const shares = updates.shares ?? current?.shares ?? 0;

      if (views > 0) {
        updatePayload.engagement_rate = (likes + comments + shares) / views;
      }
    }

    // Update the video
    const { data, error } = await supabaseAdmin
      .from("imported_videos")
      .update(updatePayload)
      .eq("id", id.trim())
      .select("id, video_url, status, hook_line, views, updated_at")
      .single();

    if (error) {
      console.error(`[${correlationId}] Failed to update video:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to update video", 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Update video error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to update video",
      500,
      correlationId
    );
  }
}

// --- DELETE: Delete imported video ---

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  // Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!id || id.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Video ID is required", 400, correlationId);
  }

  try {
    // Verify video exists
    const { data: existing, error: existError } = await supabaseAdmin
      .from("imported_videos")
      .select("id")
      .eq("id", id.trim())
      .single();

    if (existError || !existing) {
      return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
    }

    // Delete the video
    const { error } = await supabaseAdmin
      .from("imported_videos")
      .delete()
      .eq("id", id.trim());

    if (error) {
      console.error(`[${correlationId}] Failed to delete video:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to delete video", 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      deleted: id.trim(),
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Delete video error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to delete video",
      500,
      correlationId
    );
  }
}
