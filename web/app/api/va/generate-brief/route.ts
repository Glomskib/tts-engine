import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface ScriptJson {
  hook?: string;
  body?: string;
  cta?: string;
  bullets?: string[];
  on_screen_text?: string[];
  b_roll?: string[];
  sections?: { name: string; content: string }[];
}

interface BriefData {
  video_id: string;
  video_code: string | null;
  brand: string | null;
  product_name: string | null;
  product_id: string | null;
  due_date: string;
  hook: string | null;
  scenes: string | null;
  cta: string | null;
  script_text: string | null;
  reference_winners: {
    id: string;
    hook: string | null;
    video_url: string | null;
    view_count: number | null;
    product_name: string | null;
    product_category: string | null;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build scenes/beats text from the script JSON body, bullets, and sections.
 */
function extractScenes(scriptJson: ScriptJson | null): string | null {
  if (!scriptJson) return null;

  const parts: string[] = [];

  if (scriptJson.body?.trim()) {
    parts.push(scriptJson.body.trim());
  }

  if (scriptJson.bullets && scriptJson.bullets.length > 0) {
    const valid = scriptJson.bullets.filter((b) => b?.trim());
    if (valid.length > 0) {
      parts.push(valid.map((b) => `- ${b.trim()}`).join("\n"));
    }
  }

  if (scriptJson.sections && scriptJson.sections.length > 0) {
    for (const section of scriptJson.sections) {
      if (section.name && section.content?.trim()) {
        parts.push(`**${section.name}:** ${section.content.trim()}`);
      }
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * Generate the markdown brief document.
 */
function generateBriefMarkdown(data: BriefData): string {
  const lines: string[] = [];

  // Header
  lines.push("# VA Editing Brief");
  lines.push("");

  // Video Details
  lines.push("## Video Details");
  lines.push(`- **Video Code:** ${data.video_code || "N/A"}`);
  lines.push(`- **Brand:** ${data.brand || "N/A"}`);
  lines.push(`- **Product:** ${data.product_name || "N/A"}`);
  lines.push(`- **Due Date:** ${new Date(data.due_date).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`);
  lines.push("");

  // Script
  lines.push("## Script");

  if (data.hook) {
    lines.push(`**Hook:** ${data.hook}`);
    lines.push("");
  }

  if (data.scenes) {
    lines.push("### Scenes");
    lines.push(data.scenes);
    lines.push("");
  }

  if (data.cta) {
    lines.push("### CTA");
    lines.push(data.cta);
    lines.push("");
  }

  if (!data.hook && !data.scenes && !data.cta && data.script_text) {
    lines.push("### Full Script");
    lines.push(data.script_text);
    lines.push("");
  }

  // Editing Instructions
  lines.push("## Editing Instructions");
  lines.push("- **Music Style:** Upbeat/trending TikTok sound");
  lines.push("- **Pace:** Fast cuts (2-3 seconds per scene)");
  lines.push("- **Text Overlays:** Bold, centered, large font for hook");
  lines.push("- **Transitions:** Quick cuts, no fancy transitions");
  lines.push("");

  // Reference Videos
  if (data.reference_winners.length > 0) {
    lines.push("## Reference Videos");
    for (const winner of data.reference_winners) {
      const label = winner.hook || winner.product_name || "Reference";
      if (winner.video_url) {
        lines.push(`- [${label}](${winner.video_url})${winner.view_count ? ` (${winner.view_count.toLocaleString()} views)` : ""}`);
      } else {
        lines.push(`- ${label}${winner.view_count ? ` (${winner.view_count.toLocaleString()} views)` : ""}`);
      }
    }
    lines.push("");
  }

  // Quality Checklist
  lines.push("## Quality Checklist");
  lines.push("- [ ] Hook in first 1-3 seconds");
  lines.push("- [ ] Product clearly visible");
  lines.push("- [ ] Text overlays readable on mobile");
  lines.push("- [ ] Audio levels balanced");
  lines.push("- [ ] No watermarks");
  lines.push("- [ ] Correct aspect ratio (9:16)");
  lines.push("- [ ] Under 60 seconds");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// POST /api/va/generate-brief
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // 1. Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // 2. Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const { video_id } = body as { video_id?: string };

  if (!video_id || typeof video_id !== "string") {
    return createApiErrorResponse("BAD_REQUEST", "video_id is required", 400, correlationId);
  }

  // 3. Validate UUID format
  if (!UUID_REGEX.test(video_id)) {
    return createApiErrorResponse("INVALID_UUID", "video_id must be a valid UUID", 400, correlationId);
  }

  try {
    // 4. Fetch the video with product join (NO sku column)
    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .select(`
        id, video_code, product_id, script_id,
        script_locked_text, script_locked_json,
        product:product_id(id, name, brand)
      `)
      .eq("id", video_id)
      .single();

    if (videoError || !video) {
      if (videoError?.code === "PGRST116") {
        return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
      }
      return createApiErrorResponse("DB_ERROR", videoError?.message || "Failed to fetch video", 500, correlationId);
    }

    // Flatten the product join
    const productRaw = video.product;
    const product = (Array.isArray(productRaw) ? productRaw[0] : productRaw) as { id: string; name: string; brand: string } | null;
    const productName = product?.name || null;
    const productBrand = product?.brand || null;
    const productId = product?.id || video.product_id;

    // 5. Fetch the script for this video
    //    The relationship is: videos.script_id -> scripts.id
    //    Also try the locked script on the video itself
    let scriptJson: ScriptJson | null = null;
    let scriptText: string | null = null;

    if (video.script_id) {
      const { data: script } = await supabaseAdmin
        .from("scripts")
        .select("script_json, script_text")
        .eq("id", video.script_id)
        .single();

      if (script) {
        scriptJson = (script.script_json as ScriptJson) || null;
        scriptText = script.script_text || null;
      }
    }

    // Fall back to locked script on the video itself
    if (!scriptJson && video.script_locked_json) {
      scriptJson = video.script_locked_json as ScriptJson;
    }
    if (!scriptText && video.script_locked_text) {
      scriptText = video.script_locked_text as string;
    }

    // Extract structured parts from script JSON
    const hook = scriptJson?.hook || null;
    const scenes = extractScenes(scriptJson);
    const cta = scriptJson?.cta || null;

    // 6. Fetch reference winners from winners_bank (same product or brand, limit 3)
    //    Production DB uses TypeScript field names: hook, video_url, view_count, notes, patterns
    let referenceWinners: BriefData["reference_winners"] = [];

    if (productName || productBrand) {
      // Try matching by product_name or product_category (brand)
      let winnersQuery = supabaseAdmin
        .from("winners_bank")
        .select("id, hook, video_url, view_count, product_name, product_category")
        .order("performance_score", { ascending: false })
        .limit(3);

      // Build filter: match on product_name OR product_category (brand)
      const orFilters: string[] = [];
      if (productName) {
        orFilters.push(`product_name.ilike.%${productName}%`);
      }
      if (productBrand) {
        orFilters.push(`product_category.ilike.%${productBrand}%`);
      }
      if (orFilters.length > 0) {
        winnersQuery = winnersQuery.or(orFilters.join(","));
      }

      const { data: winners } = await winnersQuery;

      if (winners && winners.length > 0) {
        referenceWinners = winners.map((w) => ({
          id: w.id,
          hook: w.hook || null,
          video_url: w.video_url || null,
          view_count: w.view_count || null,
          product_name: w.product_name || null,
          product_category: w.product_category || null,
        }));
      }
    }

    // 7. Generate the brief
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const briefData: BriefData = {
      video_id,
      video_code: video.video_code || null,
      brand: productBrand,
      product_name: productName,
      product_id: productId || null,
      due_date: dueDate,
      hook,
      scenes,
      cta,
      script_text: scriptText,
      reference_winners: referenceWinners,
    };

    const briefMarkdown = generateBriefMarkdown(briefData);

    // 8. Save to va_briefs table
    const { data: savedBrief, error: insertError } = await supabaseAdmin
      .from("va_briefs")
      .insert({
        video_id,
        user_id: authContext.user.id,
        brief_markdown: briefMarkdown,
        brief_data: briefData,
        due_date: dueDate,
      })
      .select()
      .single();

    if (insertError) {
      console.error(`[${correlationId}] Failed to save VA brief:`, insertError.message);
      return createApiErrorResponse("DB_ERROR", "Failed to save brief", 500, correlationId);
    }

    // 9. Return the brief
    return NextResponse.json({
      ok: true,
      data: {
        id: savedBrief.id,
        video_id: savedBrief.video_id,
        brief_markdown: briefMarkdown,
        brief_data: briefData,
        due_date: dueDate,
        generated_at: savedBrief.generated_at,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] VA generate-brief error:`, err);
    return createApiErrorResponse("INTERNAL", "Internal server error", 500, correlationId);
  }
}

// ---------------------------------------------------------------------------
// GET /api/va/generate-brief?video_id=<uuid>
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("video_id");

  if (!videoId) {
    return createApiErrorResponse("BAD_REQUEST", "video_id query parameter is required", 400, correlationId);
  }

  if (!UUID_REGEX.test(videoId)) {
    return createApiErrorResponse("INVALID_UUID", "video_id must be a valid UUID", 400, correlationId);
  }

  try {
    // Fetch the most recent brief for this video
    const { data: brief, error } = await supabaseAdmin
      .from("va_briefs")
      .select("id, video_id, user_id, brief_markdown, brief_data, due_date, generated_at, created_at")
      .eq("video_id", videoId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return createApiErrorResponse("NOT_FOUND", "No brief found for this video", 404, correlationId);
      }
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: brief,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] VA get brief error:`, err);
    return createApiErrorResponse("INTERNAL", "Internal server error", 500, correlationId);
  }
}
