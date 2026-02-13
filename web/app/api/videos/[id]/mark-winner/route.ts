/**
 * POST /api/videos/[id]/mark-winner
 *
 * Save a video's full render context as a winner pattern.
 * Called when Brandon approves a video — captures the script, render prompt,
 * persona, quality score so generate-skit can learn from proven winners.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { sendTelegramNotification } from "@/lib/telegram";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: videoId } = await params;
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  if (!UUID_REGEX.test(videoId)) {
    return createApiErrorResponse("BAD_REQUEST", "Invalid video ID format", 400, correlationId);
  }

  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Parse optional notes
  let notes: string | null = null;
  try {
    const body = await request.json();
    if (body.notes && typeof body.notes === "string") {
      notes = body.notes;
    }
  } catch {
    // No body or invalid JSON — that's fine, notes are optional
  }

  // Fetch the video with all render context
  const { data: video, error: videoErr } = await supabaseAdmin
    .from("videos")
    .select("id, product_id, render_prompt, render_provider, quality_score, recording_status")
    .eq("id", videoId)
    .single();

  if (videoErr || !video) {
    return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
  }

  // Fetch linked skit for script context
  const { data: skit } = await supabaseAdmin
    .from("saved_skits")
    .select("skit_data, generation_config")
    .eq("video_id", videoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const skitData = skit?.skit_data as {
    hook_line?: string;
    beats?: Array<{ action?: string; dialogue?: string; on_screen_text?: string }>;
    cta_line?: string;
    cta_overlay?: string;
  } | null;

  // Extract persona from generation config
  const genConfig = skit?.generation_config as {
    persona?: string;
    creator_persona_id?: string;
  } | null;

  // Build full script text from beats
  let fullScript: string | null = null;
  if (skitData) {
    const lines: string[] = [];
    if (skitData.hook_line) lines.push(`HOOK: ${skitData.hook_line}`);
    for (const beat of skitData.beats || []) {
      if (beat.dialogue) lines.push(beat.dialogue);
      if (beat.on_screen_text) lines.push(`[TEXT: ${beat.on_screen_text}]`);
    }
    if (skitData.cta_line) lines.push(`CTA: ${skitData.cta_line}`);
    fullScript = lines.join("\n");
  }

  // Check for duplicate — don't create two winner patterns for same video
  const { data: existing } = await supabaseAdmin
    .from("winner_patterns")
    .select("id")
    .eq("video_id", videoId)
    .limit(1);

  if (existing && existing.length > 0) {
    // Update notes if provided, otherwise just return existing
    if (notes) {
      await supabaseAdmin
        .from("winner_patterns")
        .update({ notes })
        .eq("id", existing[0].id);
    }

    return NextResponse.json({
      ok: true,
      winner_pattern_id: existing[0].id,
      video_id: videoId,
      idempotent: true,
      correlation_id: correlationId,
    });
  }

  // Get product name for the response/notification
  let productLabel = videoId.slice(0, 8);
  if (video.product_id) {
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("name, brand")
      .eq("id", video.product_id)
      .single();
    if (product?.name) {
      productLabel = product.brand ? `${product.brand} — ${product.name}` : product.name;
    }
  }

  // Insert winner pattern
  const { data: pattern, error: insertErr } = await supabaseAdmin
    .from("winner_patterns")
    .insert({
      video_id: videoId,
      product_id: video.product_id,
      persona_name: genConfig?.persona || genConfig?.creator_persona_id || null,
      hook_text: skitData?.hook_line || null,
      full_script: fullScript,
      render_prompt: video.render_prompt,
      quality_score: video.quality_score,
      render_provider: video.render_provider,
      notes,
    })
    .select("id")
    .single();

  if (insertErr) {
    return createApiErrorResponse(
      "INTERNAL",
      `Failed to save winner pattern: ${insertErr.message}`,
      500,
      correlationId
    );
  }

  // Send Telegram notification
  const qualityAvg = (video.quality_score as { avg?: number } | null)?.avg;
  sendTelegramNotification(
    `🏆 Winner marked: ${productLabel}${qualityAvg ? ` (quality: ${qualityAvg}/10)` : ""}\n  Hook: "${skitData?.hook_line || "N/A"}"`
  );

  return NextResponse.json({
    ok: true,
    winner_pattern_id: pattern.id,
    video_id: videoId,
    product: productLabel,
    hook: skitData?.hook_line || null,
    quality_score: video.quality_score,
    correlation_id: correlationId,
  });
}
