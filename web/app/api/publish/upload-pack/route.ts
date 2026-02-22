/**
 * POST /api/publish/upload-pack
 *
 * Generates an ephemeral UploadPack for a ready_to_post video.
 * Bundles caption, hashtags, hook, CTA, cover text, and a video URL
 * so a human uploader can quickly post to TikTok.
 *
 * Request body: { video_id: "uuid" }
 * Auth: admin or uploader role required
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { postMCDoc } from "@/lib/flashflow/mission-control";
import type { UploadPack } from "@/lib/publish/upload-pack";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ScriptLockedJson {
  // Standard fields
  hook?: string;
  body?: string;
  cta?: string;
  bullets?: string[];
  on_screen_text?: string[];
  b_roll?: string[];
  sections?: { name: string; content: string }[];
  // HeyGen scene-builder variants
  hook_line?: string;
  cta_line?: string;
  cta_overlay?: string;
  overlays?: string[];
  beats?: { dialogue?: string; on_screen_text?: string; action?: string; t?: string }[];
  // Product linking
  product_key?: string;
  tiktok_product_id?: string;
}

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  if (!authContext.isAdmin && !authContext.isUploader) {
    return createApiErrorResponse("FORBIDDEN", "Admin or uploader access required", 403, correlationId);
  }

  // Parse body
  let body: { video_id?: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const videoId = body.video_id;
  if (!videoId || typeof videoId !== "string") {
    return createApiErrorResponse("BAD_REQUEST", "video_id is required", 400, correlationId);
  }
  if (!UUID_REGEX.test(videoId)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  // Fetch video (core columns that always exist)
  const { data: video, error: videoErr } = await supabaseAdmin
    .from("videos")
    .select("id, status, product_id, final_video_url, script_locked_json, script_id, concept_id")
    .eq("id", videoId)
    .single();

  if (videoErr || !video) {
    return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
  }

  // Try to read work_lane (may not exist in all environments)
  let workLane: string | null = null;
  try {
    const { data: laneRow } = await supabaseAdmin
      .from("videos")
      .select("work_lane")
      .eq("id", videoId)
      .single();
    workLane = (laneRow as Record<string, unknown>)?.work_lane as string | null;
  } catch {
    // Column doesn't exist — that's fine
  }

  if (video.status !== "ready_to_post") {
    return createApiErrorResponse("INVALID_TRANSITION", `Video status is "${video.status}", expected "ready_to_post"`, 400, correlationId, {
      current_status: video.status,
    });
  }

  if (!video.final_video_url) {
    return createApiErrorResponse("FINAL_ASSET_REQUIRED", "Video has no final_video_url", 422, correlationId);
  }

  // Extract script data — prefer script_locked_json, fall back to scripts table
  const lockedJson = (video.script_locked_json || {}) as ScriptLockedJson;

  // Resolve tiktok_product_id:
  //   a) video/script has tiktok_product_id directly (locked json or products table)
  //   b) product_key in locked json → ff_products lookup
  //   c) else 400
  let tiktokProductId: string | undefined;
  let productKey: string | undefined;
  let productDisplayName: string | undefined;

  // (a) Check locked json first for an explicit tiktok_product_id
  if (lockedJson.tiktok_product_id) {
    tiktokProductId = lockedJson.tiktok_product_id;
  }

  // (a) Check products table via video.product_id
  let productName = "Unknown Product";
  if (video.product_id) {
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("name, primary_link, tiktok_product_id")
      .eq("id", video.product_id)
      .single();
    if (product) {
      productName = product.name;
      if (!tiktokProductId && product.tiktok_product_id) {
        tiktokProductId = product.tiktok_product_id;
      }
    }
  }

  // (b) If still no tiktok_product_id, try product_key → ff_products lookup
  if (!tiktokProductId && lockedJson.product_key) {
    productKey = lockedJson.product_key;
    const { data: ffProduct } = await supabaseAdmin
      .from("ff_products")
      .select("tiktok_product_id, display_name, key")
      .eq("key", productKey)
      .single();
    if (ffProduct) {
      tiktokProductId = ffProduct.tiktok_product_id;
      productDisplayName = ffProduct.display_name || undefined;
      productKey = ffProduct.key;
      // Touch last_used_at (non-blocking)
      supabaseAdmin
        .from("ff_products")
        .update({ last_used_at: new Date().toISOString() })
        .eq("key", productKey)
        .then(() => {});
    }
  }

  // (c) No tiktok_product_id resolved
  if (!tiktokProductId) {
    return createApiErrorResponse("MISSING_PRODUCT_ID", "No tiktok_product_id found on video, product, or ff_products", 400, correlationId);
  }
  let caption = "";
  let hashtags: string[] = [];
  let hook = lockedJson.hook || lockedJson.hook_line || "";
  let cta = lockedJson.cta || lockedJson.cta_line || "";
  let coverText = "";

  // Cover text: on_screen_text array > overlays array > first beat's on_screen_text
  if (lockedJson.on_screen_text?.length) {
    coverText = lockedJson.on_screen_text[0];
  } else if (lockedJson.overlays?.length) {
    coverText = lockedJson.overlays[0];
  } else if (lockedJson.beats?.length && lockedJson.beats[0].on_screen_text) {
    coverText = lockedJson.beats[0].on_screen_text;
  }

  // Build caption from beats dialogue if no body
  if (lockedJson.beats?.length && !lockedJson.body) {
    const dialogue = lockedJson.beats.map(b => b.dialogue).filter(Boolean).join(" ");
    if (dialogue) caption = dialogue;
  }

  // Try to get caption/hashtags from the scripts table
  if (video.script_id) {
    const { data: script } = await supabaseAdmin
      .from("scripts")
      .select("caption, hashtags, cta, on_screen_text")
      .eq("id", video.script_id)
      .single();

    if (script) {
      caption = script.caption || caption;
      if (script.hashtags) {
        hashtags = script.hashtags
          .split(/[\s,]+/)
          .map((t: string) => t.trim())
          .filter((t: string) => t.length > 0)
          .map((t: string) => (t.startsWith("#") ? t : `#${t}`));
      }
      if (!cta && script.cta) cta = script.cta;
      if (!coverText && script.on_screen_text) coverText = script.on_screen_text;
    }
  }

  // If no caption from scripts table, compose from locked json body
  if (!caption && lockedJson.body) {
    caption = lockedJson.body;
  }
  if (!caption && hook) {
    caption = hook;
  }

  // Ensure #ad is present
  const hasAd = hashtags.some((h) => h.toLowerCase() === "#ad");
  if (!hasAd) {
    hashtags.unshift("#ad");
  }

  // Determine lane
  const lane = workLane || "general";

  // Build references from concept source_url
  const references: string[] = [];
  if (video.concept_id) {
    const { data: concept } = await supabaseAdmin
      .from("concepts")
      .select("source_url")
      .eq("id", video.concept_id)
      .single();
    if (concept?.source_url) {
      references.push(concept.source_url);
    }
  }

  // Build description = caption + hashtags
  const description = [caption, hashtags.join(" ")].filter(Boolean).join("\n");

  // Build the pack
  const pack: UploadPack = {
    video_id: videoId,
    product_id: video.product_id || "",
    generated_at: new Date().toISOString(),
    lane,
    product_name: productName,
    caption,
    description,
    hashtags,
    cover_text: coverText,
    hook,
    cta,
    compliance_notes: "#ad required",
    references,
    video_url: video.final_video_url,
    video_path: video.final_video_url,
    video_source: { type: "local", local_path: video.final_video_url },
    product: {
      ...(productKey ? { key: productKey } : {}),
      ...(productDisplayName ? { display_name: productDisplayName } : {}),
      tiktok_product_id: tiktokProductId,
    },
  };

  // Post SOP doc to Mission Control (non-blocking)
  let mcDocId: string | undefined;
  const mcPromise = postMCDoc({
    title: `Upload Pack: ${productName} (${lane})`,
    content: formatMCDoc(pack),
    category: "reports",
    lane: "FlashFlow",
    tags: ["upload-pack", lane, productName.toLowerCase().replace(/\s+/g, "-")],
  }).then((res) => {
    if (res.ok) mcDocId = res.id;
  }).catch(() => {
    // Non-blocking — swallow errors
  });

  // Wait briefly for MC doc (non-blocking intent, but try to include ID in response)
  await Promise.race([mcPromise, new Promise((r) => setTimeout(r, 2000))]);

  return NextResponse.json({
    ok: true,
    data: {
      pack,
      mc_doc_id: mcDocId ?? null,
    },
    correlation_id: correlationId,
  });
}

function formatMCDoc(pack: UploadPack): string {
  return [
    `# Upload Pack: ${pack.product_name}`,
    "",
    `**Video ID:** ${pack.video_id}`,
    `**Lane:** ${pack.lane}`,
    `**Generated:** ${pack.generated_at}`,
    "",
    "## Caption",
    pack.caption,
    "",
    "## Hashtags",
    pack.hashtags.join(" "),
    "",
    "## Hook",
    pack.hook,
    "",
    "## CTA",
    pack.cta,
    "",
    "## Cover Text",
    pack.cover_text,
    "",
    "## Compliance",
    pack.compliance_notes,
    "",
    "## Video URL",
    pack.video_url,
    "",
    pack.references.length > 0
      ? `## References\n${pack.references.map((r) => `- ${r}`).join("\n")}`
      : "",
  ].join("\n");
}
