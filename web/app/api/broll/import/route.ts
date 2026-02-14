/**
 * POST /api/broll/import
 *
 * Import a video from stock sources (Pexels, Pixabay, Coverr, or any URL)
 * into the reusable B-roll library.
 *
 * Downloads the video, re-hosts to Supabase storage, AI-tags it,
 * and saves as a reusable library clip.
 *
 * Body:
 *   url: string          — Direct video URL
 *   tags?: object        — Optional manual tags override
 *   description?: string — Text description for AI tagging
 *   source?: string      — "pexels" | "pixabay" | "coverr" | "stock" (default: "stock")
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  url: z.string().url(),
  description: z.string().optional(),
  tags: z
    .object({
      scene: z.string().optional(),
      action: z.string().optional(),
      product_type: z.string().optional(),
      lighting: z.string().optional(),
      mood: z.string().optional(),
    })
    .optional(),
  source: z.enum(["pexels", "pixabay", "coverr", "stock"]).optional().default("stock"),
  duration_seconds: z.number().positive().optional().default(5),
});

// Infer tags from a text description
function inferTagsFromDescription(description: string): {
  scene: string;
  action: string;
  product_type: string;
  lighting: string;
  mood: string;
} {
  const lower = description.toLowerCase();

  // Scene
  let scene = "studio";
  if (lower.includes("kitchen") || lower.includes("cooking") || lower.includes("counter")) scene = "kitchen";
  else if (lower.includes("bathroom") || lower.includes("vanity") || lower.includes("mirror")) scene = "bathroom";
  else if (lower.includes("desk") || lower.includes("office") || lower.includes("workspace")) scene = "desk";
  else if (lower.includes("bedroom") || lower.includes("nightstand")) scene = "bedroom";
  else if (lower.includes("gym") || lower.includes("workout") || lower.includes("fitness")) scene = "gym";
  else if (lower.includes("living room") || lower.includes("couch") || lower.includes("sofa")) scene = "living_room";
  else if (lower.includes("outdoor") || lower.includes("garden") || lower.includes("park") || lower.includes("nature")) scene = "outdoor";
  else if (lower.includes("store") || lower.includes("shelf") || lower.includes("shop")) scene = "retail";

  // Action
  let action = "general";
  if (lower.includes("pour") || lower.includes("drink")) action = "pouring";
  else if (lower.includes("apply") || lower.includes("rub") || lower.includes("spread")) action = "applying";
  else if (lower.includes("open") || lower.includes("unbox")) action = "unboxing";
  else if (lower.includes("close") || lower.includes("zoom") || lower.includes("detail")) action = "closeup";
  else if (lower.includes("hold") || lower.includes("pick") || lower.includes("grab")) action = "pickup";
  else if (lower.includes("walk") || lower.includes("lifestyle") || lower.includes("casual")) action = "lifestyle_use";
  else if (lower.includes("shake") || lower.includes("capsule") || lower.includes("pill")) action = "usage";

  // Product type
  let product_type = "general";
  if (lower.includes("skincare") || lower.includes("cream") || lower.includes("serum") || lower.includes("lotion")) product_type = "skincare";
  else if (lower.includes("supplement") || lower.includes("vitamin") || lower.includes("capsule") || lower.includes("pill")) product_type = "supplement";
  else if (lower.includes("beauty") || lower.includes("makeup") || lower.includes("cosmetic")) product_type = "beauty";
  else if (lower.includes("food") || lower.includes("snack") || lower.includes("meal")) product_type = "food";
  else if (lower.includes("beverage") || lower.includes("drink") || lower.includes("juice") || lower.includes("water")) product_type = "beverage";
  else if (lower.includes("tech") || lower.includes("gadget") || lower.includes("device") || lower.includes("electronic")) product_type = "tech";
  else if (lower.includes("clean") || lower.includes("spray") || lower.includes("detergent")) product_type = "cleaning";
  else if (lower.includes("pet") || lower.includes("dog") || lower.includes("cat")) product_type = "pet";
  else if (lower.includes("fitness") || lower.includes("protein") || lower.includes("workout")) product_type = "fitness";
  else if (lower.includes("health") || lower.includes("wellness")) product_type = "health";

  // Lighting
  let lighting = "natural";
  if (lower.includes("studio") || lower.includes("professional")) lighting = "studio";
  else if (lower.includes("ring light")) lighting = "ring_light";
  else if (lower.includes("soft") || lower.includes("diffused")) lighting = "soft_natural";
  else if (lower.includes("bright") || lower.includes("sunny")) lighting = "bright_natural";
  else if (lower.includes("warm") || lower.includes("golden")) lighting = "warm";

  // Mood
  let mood = "product_showcase";
  if (lower.includes("lifestyle") || lower.includes("casual") || lower.includes("authentic")) mood = "casual_authentic";
  else if (lower.includes("premium") || lower.includes("luxury") || lower.includes("elegant")) mood = "premium";
  else if (lower.includes("energetic") || lower.includes("dynamic") || lower.includes("active")) mood = "energetic";
  else if (lower.includes("calm") || lower.includes("relax") || lower.includes("zen")) mood = "calm";
  else if (lower.includes("close") || lower.includes("detail") || lower.includes("macro")) mood = "detail_focus";

  return { scene, action, product_type, lighting, mood };
}

export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      `Validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      400,
      correlationId
    );
  }

  const { url, description, tags: manualTags, source, duration_seconds } = parsed.data;

  // Download the video
  let videoBuffer: ArrayBuffer;
  try {
    const resp = await fetch(url, { redirect: "follow" });
    if (!resp.ok) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        `Failed to download video: HTTP ${resp.status}`,
        400,
        correlationId
      );
    }

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("video") && !contentType.includes("octet-stream")) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        `URL does not appear to be a video (content-type: ${contentType})`,
        400,
        correlationId
      );
    }

    videoBuffer = await resp.arrayBuffer();
  } catch (err) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      `Failed to fetch video: ${err instanceof Error ? err.message : String(err)}`,
      400,
      correlationId
    );
  }

  // Size check (100MB max)
  if (videoBuffer.byteLength > 100 * 1024 * 1024) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      `Video too large: ${Math.round(videoBuffer.byteLength / 1024 / 1024)}MB (max 100MB)`,
      400,
      correlationId
    );
  }

  // AI-tag the clip
  const tags = manualTags?.scene
    ? manualTags // Use manual tags if scene is provided (they specified enough)
    : inferTagsFromDescription(description || url);

  // Re-host to Supabase storage
  const blob = new Blob([videoBuffer], { type: "video/mp4" });
  const storagePath = `broll/library/${source}_${Date.now()}.mp4`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("renders")
    .upload(storagePath, blob, { contentType: "video/mp4", upsert: false });

  if (uploadErr) {
    return createApiErrorResponse(
      "STORAGE_ERROR",
      `Upload failed: ${uploadErr.message}`,
      500,
      correlationId
    );
  }

  const { data: urlData } = supabaseAdmin.storage.from("renders").getPublicUrl(storagePath);
  const clipUrl = urlData.publicUrl;

  // Save to broll_clips as a reusable library clip (no product_id — it's generic)
  const { data: clip, error: insertErr } = await supabaseAdmin
    .from("broll_clips")
    .insert({
      product_id: null,
      video_id: null,
      scene_number: 0,
      prompt: description || `Imported from ${source}: ${url}`,
      clip_url: clipUrl,
      duration_seconds,
      render_provider: source,
      source: "stock",
      status: "done",
      reusable: true,
      tags,
      used_count: 0,
    })
    .select("id, clip_url, tags, source, status, created_at")
    .single();

  if (insertErr) {
    return createApiErrorResponse(
      "DB_ERROR",
      `Failed to save clip: ${insertErr.message}`,
      500,
      correlationId
    );
  }

  return NextResponse.json({
    ok: true,
    clip,
    size_mb: Math.round(videoBuffer.byteLength / 1024 / 1024 * 10) / 10,
    correlation_id: correlationId,
  });
}
