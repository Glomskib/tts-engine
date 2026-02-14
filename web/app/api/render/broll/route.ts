/**
 * POST /api/render/broll
 *
 * Generate B-roll video clips for a product using Runway image-to-video.
 * Each scene produces a 5-second clip from a different angle/action.
 *
 * Reuse priority:
 *   1. Same-product clips (free, already generated)
 *   2. Cross-product library match by tags (free, reusable clips)
 *   3. Generate new via Runway (costs credits, auto-tagged for future reuse)
 *
 * Every generated clip is AI-tagged and saved permanently to the reusable library.
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

// --- Script-aware B-roll prompt generation via Claude Haiku ---

interface ScriptAwarePrompt {
  label: string;
  prompt: string;
  beat: string; // the script beat this corresponds to
}

/**
 * Generate Runway image-to-video prompts that match the script content.
 * Each prompt is tailored to visually represent what's being said in that
 * section of the script.
 *
 * Falls back to null if AI generation fails (caller uses template fallback).
 */
async function generateScriptAwareBrollPrompts(
  scriptText: string,
  productName: string,
  productCategory: string | null,
  sceneCount: number,
): Promise<ScriptAwarePrompt[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const setting = inferSetting(productCategory);

  const prompt = `You are a Runway image-to-video prompt engineer for TikTok product videos.

Given this UGC script, generate ${sceneCount} B-roll video prompts — one for each section of the script. Each prompt creates a 5-second clip that VISUALLY MATCHES what's being said at that moment.

SCRIPT:
${scriptText}

PRODUCT: ${productName}
CATEGORY: ${productCategory || 'general'}
TYPICAL SETTING: ${setting}

RULES:
- Each prompt must be a specific, filmable Runway image-to-video description
- Always include "9:16 vertical" for mobile-first format
- Include lighting, camera movement, and framing details
- Match the EMOTION and CONTENT of each script section
- First prompt should match the hook (attention-grabbing opening)
- Last prompt should match the CTA (call to action moment)
- Middle prompts should match the body/demonstration
- Reference the actual product by name
- Keep each prompt under 200 characters

Return ONLY a JSON array (no markdown, no explanation):
[
  {"label": "hook_visual", "beat": "<the script line this matches>", "prompt": "<Runway prompt>"},
  {"label": "body_visual_1", "beat": "<the script line this matches>", "prompt": "<Runway prompt>"},
  {"label": "cta_visual", "beat": "<the script line this matches>", "prompt": "<Runway prompt>"}
]`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        temperature: 0.5,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn('[broll] Script-aware prompt generation failed:', response.status);
      return null;
    }

    const data = await response.json();
    const rawText: string = data.content?.[0]?.text || '';

    // Parse JSON array from response
    let text = rawText.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket === -1 || lastBracket === -1) return null;

    const parsed = JSON.parse(text.substring(firstBracket, lastBracket + 1));
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    return parsed.slice(0, sceneCount).map((item: Record<string, unknown>) => ({
      label: String(item.label || 'scene'),
      prompt: String(item.prompt || ''),
      beat: String(item.beat || ''),
    }));
  } catch (err) {
    console.warn('[broll] Script-aware prompt generation error:', err);
    return null;
  }
}

// --- AI tag extraction from prompt ---

interface BrollTags {
  scene: string;
  action: string;
  product_type: string;
  lighting: string;
  mood: string;
}

function extractTagsFromPrompt(prompt: string, category: string | null, sceneLabel: string): BrollTags {
  const lower = prompt.toLowerCase();

  // Scene: derive from scene label and prompt content
  let scene = "studio";
  if (lower.includes("kitchen") || lower.includes("counter")) scene = "kitchen";
  else if (lower.includes("bathroom") || lower.includes("vanity")) scene = "bathroom";
  else if (lower.includes("desk") || lower.includes("office")) scene = "desk";
  else if (lower.includes("bedroom") || lower.includes("nightstand")) scene = "bedroom";
  else if (lower.includes("gym") || lower.includes("bench")) scene = "gym";
  else if (lower.includes("living room") || lower.includes("coffee table")) scene = "living_room";
  else if (lower.includes("outdoor") || lower.includes("garden")) scene = "outdoor";

  // Action: derive from scene template label
  const actionMap: Record<string, string> = {
    label_closeup: "closeup",
    hand_pickup: "pickup",
    product_use: "usage",
    hero_shot: "hero_orbit",
    lifestyle: "lifestyle_use",
  };
  const action = actionMap[sceneLabel] || "general";

  // Product type: normalize category
  const productType = (category || "general").toLowerCase().replace(/s$/, "");

  // Lighting
  let lighting = "natural";
  if (lower.includes("studio")) lighting = "studio";
  else if (lower.includes("ring light")) lighting = "ring_light";
  else if (lower.includes("soft")) lighting = "soft_natural";

  // Mood
  let mood = "product_showcase";
  if (sceneLabel === "lifestyle") mood = "casual_authentic";
  else if (sceneLabel === "hero_shot") mood = "premium";
  else if (sceneLabel === "label_closeup") mood = "detail_focus";

  return { scene, action, product_type: productType, lighting, mood };
}

// --- Library search: find reusable clips matching the needed scene ---

interface LibraryMatch {
  id: string;
  clip_url: string;
  tags: BrollTags;
  used_count: number;
  scene_number: number;
}

async function findLibraryClips(
  productType: string,
  scene: string,
  limit: number = 3
): Promise<LibraryMatch[]> {
  // Query reusable done clips, then filter by tag match
  // Uses GIN index on tags for the not-null check, app-side filtering for specifics
  const { data, error } = await supabaseAdmin
    .from("broll_clips")
    .select("id, clip_url, tags, used_count, scene_number")
    .eq("status", "done")
    .eq("reusable", true)
    .not("clip_url", "is", null)
    .not("tags", "is", null)
    .order("used_count", { ascending: true })
    .limit(100);

  if (error || !data) return [];

  // Filter by matching tags (product_type + scene)
  const matches = data.filter((clip) => {
    if (!clip.tags) return false;
    const tags = clip.tags as BrollTags;
    return tags.product_type === productType && tags.scene === scene;
  });

  return matches.slice(0, limit) as LibraryMatch[];
}

const requestSchema = z.object({
  productId: z.string().uuid(),
  videoId: z.string().uuid().optional(),
  scenes: z.number().int().min(1).max(5).optional().default(3),
  /** Full script text — when provided, AI generates scene-matched prompts instead of generic templates */
  scriptText: z.string().max(5000).optional(),
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

  const { productId, videoId, scenes, scriptText } = parsed.data;

  // --- Priority 1: Same-product clips ---
  const { data: existingClips } = await supabaseAdmin
    .from("broll_clips")
    .select("id, scene_number, clip_url, prompt, status, tags, used_count")
    .eq("product_id", productId)
    .eq("status", "done")
    .order("scene_number");

  if (existingClips && existingClips.length >= scenes) {
    // Bump used_count for reused clips
    const reused = existingClips.slice(0, scenes);
    for (const clip of reused) {
      await supabaseAdmin
        .from("broll_clips")
        .update({ used_count: (clip.used_count || 0) + 1 })
        .eq("id", clip.id);
    }

    return NextResponse.json({
      ok: true,
      reused: true,
      source: "same_product",
      clips: reused,
      message: `Reusing ${reused.length} existing B-roll clips for this product`,
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
  const productType = (product.category || "general").toLowerCase().replace(/s$/, "");

  // If script text is provided, try to fetch it from the video record
  let resolvedScriptText = scriptText;
  if (!resolvedScriptText && videoId) {
    const { data: videoData } = await supabaseAdmin
      .from("videos")
      .select("script_locked_text")
      .eq("id", videoId)
      .single();
    if (videoData?.script_locked_text) {
      resolvedScriptText = videoData.script_locked_text;
    }
  }

  // Try script-aware prompts first, fall back to generic templates
  let scenePrompts: Array<{ label: string; prompt: string }>;
  let promptSource: "script_aware" | "template" = "template";

  if (resolvedScriptText && resolvedScriptText.length > 20) {
    const aiPrompts = await generateScriptAwareBrollPrompts(
      resolvedScriptText,
      productLabel,
      product.category,
      scenes,
    );

    if (aiPrompts && aiPrompts.length >= scenes) {
      scenePrompts = aiPrompts.map((p) => ({
        label: p.label,
        prompt: p.prompt,
      }));
      promptSource = "script_aware";
      console.log(`[broll] Using ${scenePrompts.length} script-aware prompts for ${productLabel}`);
    } else {
      // AI generation failed or returned too few — fall back to templates
      scenePrompts = SCENE_TEMPLATES.slice(0, scenes).map((scene) => ({
        label: scene.label,
        prompt: scene.template
          .replace(/\{product\}/g, productLabel)
          .replace(/\{setting\}/g, setting)
          .replace(/\{action\}/g, action),
      }));
    }
  } else {
    // No script text — use generic templates
    scenePrompts = SCENE_TEMPLATES.slice(0, scenes).map((scene) => ({
      label: scene.label,
      prompt: scene.template
        .replace(/\{product\}/g, productLabel)
        .replace(/\{setting\}/g, setting)
        .replace(/\{action\}/g, action),
    }));
  }

  // --- Priority 2: Cross-product library match ---
  // For each scene, check if we already have a reusable clip with matching tags
  const libraryHits: Array<{
    sceneIndex: number;
    clip: LibraryMatch;
  }> = [];
  const scenesNeedingGeneration: number[] = [];

  for (let i = 0; i < scenePrompts.length; i++) {
    const tags = extractTagsFromPrompt(scenePrompts[i].prompt, product.category, scenePrompts[i].label);

    // Skip library search for label_closeup — those are product-specific
    if (scenePrompts[i].label === "label_closeup") {
      scenesNeedingGeneration.push(i);
      continue;
    }

    const matches = await findLibraryClips(tags.product_type, tags.scene, 1);
    if (matches.length > 0) {
      libraryHits.push({ sceneIndex: i, clip: matches[0] });
    } else {
      scenesNeedingGeneration.push(i);
    }
  }

  // Bump used_count for library hits
  const reusedFromLibrary: Array<{
    id: string;
    scene_number: number;
    clip_url: string;
    status: string;
    source: string;
  }> = [];

  for (const hit of libraryHits) {
    await supabaseAdmin
      .from("broll_clips")
      .update({ used_count: (hit.clip.used_count || 0) + 1 })
      .eq("id", hit.clip.id);

    reusedFromLibrary.push({
      id: hit.clip.id,
      scene_number: hit.sceneIndex + 1,
      clip_url: hit.clip.clip_url,
      status: "done",
      source: "library",
    });
  }

  // If everything came from library, return early
  if (scenesNeedingGeneration.length === 0) {
    return NextResponse.json({
      ok: true,
      reused: true,
      source: "library",
      clips: reusedFromLibrary,
      library_hits: libraryHits.length,
      generated: 0,
      message: `All ${scenes} clips sourced from library (free)`,
      correlation_id: correlationId,
    });
  }

  // --- Priority 3: Generate missing scenes via Runway ---
  const clipRecords: Array<{
    id: string;
    scene_number: number;
    prompt: string;
    render_task_id: string;
    status: string;
    scene_label: string;
  }> = [];

  for (const i of scenesNeedingGeneration) {
    const { prompt, label } = scenePrompts[i];
    const sceneNumber = i + 1;

    try {
      const result = await createImageToVideo(
        product.product_image_url,
        prompt,
        "gen3a_turbo",
        5,
        "768:1280"
      );

      if (!result?.id) {
        console.error(`[broll] Runway returned no task ID for scene ${sceneNumber}`);
        continue;
      }

      // AI-tag before insert
      const tags = extractTagsFromPrompt(prompt, product.category, label);

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
          reusable: true,
          tags,
          used_count: 0,
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
        scene_label: label,
      });
    } catch (err) {
      console.error(`[broll] Runway submit failed for scene ${sceneNumber}:`, err);
    }
  }

  if (!clipRecords.length && !reusedFromLibrary.length) {
    return createApiErrorResponse(
      "INTERNAL",
      "All Runway submissions failed and no library matches — no B-roll clips available",
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
    source: string;
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

          // Update clip record — mark done, reusable, keep permanently
          await supabaseAdmin
            .from("broll_clips")
            .update({
              clip_url: rehostedUrl,
              status: "done",
              reusable: true,
            })
            .eq("id", clipId);

          completed.push({
            id: clipId,
            scene_number: clip.scene_number,
            clip_url: rehostedUrl,
            status: "done",
            source: "runway",
          });
          pending.delete(clipId);
        } else if (task.status === "FAILED") {
          await supabaseAdmin
            .from("broll_clips")
            .update({ status: "failed" })
            .eq("id", clipId);
          pending.delete(clipId);
        }
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

  const allClips = [...reusedFromLibrary, ...completed];

  sendTelegramNotification(
    `🎬 B-roll: ${productLabel}\n  Library: ${reusedFromLibrary.length} reused | Runway: ${completed.length} generated | Failed: ${pending.size}`
  );

  return NextResponse.json({
    ok: true,
    reused: reusedFromLibrary.length > 0,
    product: productLabel,
    prompt_source: promptSource,
    library_hits: reusedFromLibrary.length,
    generated: completed.length,
    timed_out: pending.size,
    clips: allClips,
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
