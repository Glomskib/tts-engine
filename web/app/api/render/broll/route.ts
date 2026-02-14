/**
 * POST /api/render/broll
 *
 * Generate B-roll video clips for a product using Runway image-to-video.
 * Each scene produces a 5-second clip from a different angle/action.
 *
 * B-roll clips are reusable — once generated for a product, future videos
 * can reuse the same clips without burning additional Runway credits.
 *
 * Source priority: library (free) > upload (free) > runway (paid).
 * This endpoint handles the "runway" source path.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createImageToVideo, getTaskStatus } from "@/lib/runway";
import { sendTelegramNotification } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — polling Runway takes time

// --- Scene prompt templates ---
// {product} and {setting} are replaced at runtime

const SCENE_TEMPLATES = [
  {
    label: "label_closeup",
    template:
      "Extreme close-up of {product} label on {setting}, slow zoom in, soft natural light, 9:16 vertical, product packaging fills frame, text legible",
  },
  {
    label: "hand_pickup",
    template:
      "Hand reaches for {product} on {setting}, picks it up, examines label closely, 9:16 vertical, natural indoor light, smooth motion",
  },
  {
    label: "product_use",
    template:
      "Opening {product}, satisfying detail shot of {action}, natural light, 9:16 vertical, tight framing on product",
  },
  {
    label: "hero_shot",
    template:
      "{product} centered on {setting}, camera slowly orbits around it, soft studio lighting, 9:16 vertical, product label facing camera",
  },
  {
    label: "lifestyle",
    template:
      "Person casually using {product} in everyday setting, {setting}, natural smartphone-style footage, 9:16 vertical, authentic feel",
  },
];

// Map product categories to a "use" action for scene 3
const CATEGORY_ACTIONS: Record<string, string> = {
  skincare: "applying product to skin",
  beauty: "applying product to hand",
  supplement: "shaking out capsules into palm",
  supplements: "shaking out capsules into palm",
  health: "opening bottle and pouring capsules",
  wellness: "opening container, revealing contents",
  food: "opening package, revealing food inside",
  beverage: "pouring drink into glass",
  drink: "pouring drink into glass",
  tech: "unboxing and powering on device",
  cleaning: "spraying product onto surface",
};

// Map product categories to filming settings (same as runway-prompt-builder)
const CATEGORY_SETTINGS: Record<string, string> = {
  skincare: "bright bathroom vanity",
  beauty: "well-lit vanity with ring light",
  health: "clean kitchen counter",
  supplement: "kitchen counter near water glass",
  supplements: "kitchen counter near water glass",
  wellness: "bright bedroom nightstand",
  fitness: "gym bench",
  food: "kitchen island with natural light",
  beverage: "kitchen counter",
  drink: "kitchen counter",
  tech: "clean desk",
  electronics: "modern desk",
  home: "living room coffee table",
  pet: "living room floor",
  baby: "nursery changing table",
  fashion: "bedroom mirror area",
  cleaning: "bright kitchen counter",
};

function inferSetting(category: string | null): string {
  if (!category) return "clean, well-lit surface";
  const lower = category.toLowerCase();
  for (const [key, setting] of Object.entries(CATEGORY_SETTINGS)) {
    if (lower.includes(key)) return setting;
  }
  return "clean, well-lit surface";
}

function inferAction(category: string | null): string {
  if (!category) return "opening and examining product";
  const lower = category.toLowerCase();
  for (const [key, action] of Object.entries(CATEGORY_ACTIONS)) {
    if (lower.includes(key)) return action;
  }
  return "opening and examining product";
}

const requestSchema = z.object({
  productId: z.string().uuid(),
  videoId: z.string().uuid().optional(),
  scenes: z.number().int().min(1).max(5).optional().default(3),
});

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

  const { productId, videoId, scenes } = parsed.data;

  // Check for existing done clips — B-roll is reusable per product
  const { data: existingClips } = await supabaseAdmin
    .from("broll_clips")
    .select("id, scene_number, clip_url, prompt, status")
    .eq("product_id", productId)
    .eq("status", "done")
    .order("scene_number");

  if (existingClips && existingClips.length >= scenes) {
    return NextResponse.json({
      ok: true,
      reused: true,
      clips: existingClips.slice(0, scenes),
      message: `Reusing ${existingClips.length} existing B-roll clips for this product`,
      correlation_id: correlationId,
    });
  }

  // Fetch product
  const { data: product, error: productErr } = await supabaseAdmin
    .from("products")
    .select("id, name, brand, category, product_image_url")
    .eq("id", productId)
    .single();

  if (productErr || !product) {
    return createApiErrorResponse("NOT_FOUND", "Product not found", 404, correlationId);
  }

  if (!product.product_image_url) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Product has no product_image_url — upload a product image first",
      422,
      correlationId
    );
  }

  // Build scene prompts
  const productLabel = product.brand
    ? `${product.brand} ${product.name}`
    : product.name;
  const setting = inferSetting(product.category);
  const action = inferAction(product.category);

  const scenePrompts = SCENE_TEMPLATES.slice(0, scenes).map((scene) =>
    scene.template
      .replace(/\{product\}/g, productLabel)
      .replace(/\{setting\}/g, setting)
      .replace(/\{action\}/g, action)
  );

  // Submit Runway renders for each scene
  const clipRecords: Array<{
    id: string;
    scene_number: number;
    prompt: string;
    render_task_id: string;
    status: string;
  }> = [];

  for (let i = 0; i < scenePrompts.length; i++) {
    const prompt = scenePrompts[i];
    const sceneNumber = i + 1;

    try {
      // Submit to Runway (5 second clips)
      const result = await createImageToVideo(
        product.product_image_url,
        prompt,
        "gen3a_turbo", // Cheaper model for B-roll (less critical than hero shot)
        5,
        "768:1280" // 9:16
      );

      if (!result?.id) {
        console.error(`[broll] Runway returned no task ID for scene ${sceneNumber}`);
        continue;
      }

      // Save clip record
      const { data: clip, error: insertErr } = await supabaseAdmin
        .from("broll_clips")
        .insert({
          product_id: productId,
          video_id: videoId || null,
          scene_number: sceneNumber,
          prompt,
          render_task_id: String(result.id),
          duration_seconds: 5,
          render_provider: "runway",
          source: "runway",
          status: "rendering",
        })
        .select("id, scene_number, prompt, render_task_id, status")
        .single();

      if (insertErr) {
        console.error(`[broll] DB insert failed for scene ${sceneNumber}:`, insertErr);
        continue;
      }

      clipRecords.push({
        id: clip.id,
        scene_number: clip.scene_number,
        prompt: clip.prompt,
        render_task_id: clip.render_task_id,
        status: clip.status,
      });
    } catch (err) {
      console.error(`[broll] Runway submit failed for scene ${sceneNumber}:`, err);
    }
  }

  if (!clipRecords.length) {
    return createApiErrorResponse(
      "INTERNAL",
      "All Runway submissions failed — no B-roll clips created",
      500,
      correlationId
    );
  }

  // Poll Runway for completion (up to 4 minutes)
  const deadline = Date.now() + 240_000;
  const pending = new Set(clipRecords.map((c) => c.id));
  const completed: Array<{
    id: string;
    scene_number: number;
    clip_url: string;
    status: string;
  }> = [];

  while (pending.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));

    for (const clipId of Array.from(pending)) {
      const clip = clipRecords.find((c) => c.id === clipId);
      if (!clip) { pending.delete(clipId); continue; }

      try {
        const task = await getTaskStatus(clip.render_task_id);

        if (task.status === "SUCCEEDED" && task.output?.length) {
          const videoUrl = task.output[0];

          // Re-host to Supabase (Runway URLs expire)
          const rehostedUrl = await rehostBrollClip(videoUrl, productId, clip.scene_number);

          // Update clip record
          await supabaseAdmin
            .from("broll_clips")
            .update({ clip_url: rehostedUrl, status: "done" })
            .eq("id", clipId);

          completed.push({
            id: clipId,
            scene_number: clip.scene_number,
            clip_url: rehostedUrl,
            status: "done",
          });
          pending.delete(clipId);
        } else if (task.status === "FAILED") {
          await supabaseAdmin
            .from("broll_clips")
            .update({ status: "failed" })
            .eq("id", clipId);
          pending.delete(clipId);
        }
        // else: still processing, keep polling
      } catch {
        // keep polling on error
      }
    }
  }

  // Mark timed-out clips
  for (const clipId of Array.from(pending)) {
    await supabaseAdmin
      .from("broll_clips")
      .update({ status: "failed" })
      .eq("id", clipId);
  }

  sendTelegramNotification(
    `🎬 B-roll generated: ${productLabel}\n  ${completed.length}/${clipRecords.length} scenes completed`
  );

  return NextResponse.json({
    ok: true,
    reused: false,
    product: productLabel,
    submitted: clipRecords.length,
    completed: completed.length,
    timed_out: pending.size,
    clips: completed,
    correlation_id: correlationId,
  });
}

async function rehostBrollClip(
  sourceUrl: string,
  productId: string,
  sceneNumber: number
): Promise<string> {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) throw new Error(`Failed to download B-roll clip: ${resp.status}`);

  const buffer = await resp.arrayBuffer();
  const blob = new Blob([buffer], { type: "video/mp4" });
  const path = `broll/${productId}/scene_${sceneNumber}_${Date.now()}.mp4`;

  const { error } = await supabaseAdmin.storage
    .from("renders")
    .upload(path, blob, { contentType: "video/mp4", upsert: true });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from("renders").getPublicUrl(path);
  return data.publicUrl;
}
