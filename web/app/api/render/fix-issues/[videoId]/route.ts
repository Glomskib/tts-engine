import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { runPreflight, type PreflightResult } from "@/app/api/render/preflight/[videoId]/route";

export const runtime = "nodejs";
export const maxDuration = 120;

const SCRIPT_WORD_LIMITS: Record<number, number> = {
  10: 50,
  15: 70,
  30: 120,
};

interface FixResult {
  check: string;
  action: string;
  success: boolean;
  detail: string;
}

/**
 * Call Anthropic to condense beat actions to fit a word limit.
 */
async function condenseBeatActions(
  beats: Array<{ action?: string; on_screen_text?: string; t?: string; dialogue?: string }>,
  wordLimit: number,
  productName: string
): Promise<Array<{ action: string; on_screen_text: string; t?: string; dialogue?: string }> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const beatsJson = JSON.stringify(beats);

  const prompt = `You are rewriting video scene descriptions to be shorter. The current beats total too many words.

PRODUCT: ${productName}
WORD LIMIT: ${wordLimit} words TOTAL across ALL beat actions combined
CURRENT BEATS:
${beatsJson}

Rewrite ONLY the "action" field of each beat to be concise scene descriptions (5-10 words each).
Keep the same number of beats. Keep "t" and "dialogue" unchanged.
If any beat is missing "on_screen_text", generate a short phrase (max 6 words) from the dialogue or action.

Return ONLY valid JSON array. No markdown. No explanation.
Example: [{"t":"0:00-0:05","action":"Person holds product to camera","dialogue":"...","on_screen_text":"Try this now"}]`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    const text = result.content?.[0]?.text || "";

    // Parse JSON from response
    const firstBracket = text.indexOf("[");
    const lastBracket = text.lastIndexOf("]");
    if (firstBracket === -1 || lastBracket === -1) return null;

    const parsed = JSON.parse(text.substring(firstBracket, lastBracket + 1));
    if (!Array.isArray(parsed)) return null;

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Generate on_screen_text for beats that are missing it.
 */
async function generateOnScreenText(
  beats: Array<{ action?: string; on_screen_text?: string; dialogue?: string }>
): Promise<Record<number, string> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const missingIndices = beats
    .map((b, i) => (!b.on_screen_text?.trim() ? i : -1))
    .filter((i) => i >= 0);

  if (missingIndices.length === 0) return {};

  const beatsToFill = missingIndices.map((i) => ({
    index: i,
    action: beats[i].action || "",
    dialogue: beats[i].dialogue || "",
  }));

  const prompt = `Generate short on-screen text overlays for these video beats.
Each overlay: MAX 6 words, punchy and attention-grabbing.

Beats needing text:
${JSON.stringify(beatsToFill)}

Return ONLY a JSON object mapping index to text string. No markdown.
Example: {"0": "Try this hack!", "2": "Link in bio"}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    const text = result.content?.[0]?.text || "";

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) return null;

    const parsed = JSON.parse(text.substring(firstBrace, lastBrace + 1));
    const mapped: Record<number, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      mapped[parseInt(k)] = String(v);
    }
    return mapped;
  } catch {
    return null;
  }
}

/**
 * POST /api/render/fix-issues/[videoId]
 *
 * Auto-fixes preflight failures to make a video render-ready:
 *   - scriptUnderLimit: AI-condenses beat actions to fit word limit
 *   - hasOnScreenText: AI-generates missing on_screen_text
 *   - correctStatus: resets REJECTED to NOT_RECORDED
 *   - hasProductImage: searches product for existing image URL
 *
 * Returns list of fixes attempted with success/failure.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
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

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(videoId)) {
    return createApiErrorResponse(
      "INVALID_UUID",
      "Video ID must be a valid UUID",
      400,
      correlationId
    );
  }

  // Run preflight to see what's broken
  const before: PreflightResult = await runPreflight(videoId);

  if (before.ready) {
    return NextResponse.json({
      ok: true,
      message: "Video already passes all preflight checks",
      fixes: [],
      before: before.checks,
      after: before.checks,
      correlation_id: correlationId,
    });
  }

  const fixes: FixResult[] = [];

  // --- Fix: correctStatus (REJECTED → NOT_RECORDED) ---
  if (!before.checks.correctStatus.pass) {
    const { data: video } = await supabaseAdmin
      .from("videos")
      .select("recording_status")
      .eq("id", videoId)
      .single();

    if (video?.recording_status === "REJECTED") {
      const { error } = await supabaseAdmin
        .from("videos")
        .update({ recording_status: "NOT_RECORDED" })
        .eq("id", videoId);

      if (!error) {
        await supabaseAdmin.from("video_events").insert({
          video_id: videoId,
          event_type: "status_reset_for_rerender",
          from_status: "REJECTED",
          to_status: "NOT_RECORDED",
          actor: "fix-issues",
          correlation_id: correlationId,
        });
        fixes.push({
          check: "correctStatus",
          action: "Reset REJECTED → NOT_RECORDED",
          success: true,
          detail: "Video re-queued for rendering",
        });
      } else {
        fixes.push({
          check: "correctStatus",
          action: "Reset status",
          success: false,
          detail: error.message,
        });
      }
    } else {
      fixes.push({
        check: "correctStatus",
        action: "Reset status",
        success: false,
        detail: `Status is ${video?.recording_status || "unknown"} — only REJECTED can be auto-reset`,
      });
    }
  }

  // --- Fix: hasProductImage (look for existing image on product) ---
  if (!before.checks.hasProductImage.pass) {
    const { data: video } = await supabaseAdmin
      .from("videos")
      .select("product_id")
      .eq("id", videoId)
      .single();

    if (video?.product_id) {
      const { data: product } = await supabaseAdmin
        .from("products")
        .select("id, name, product_image_url, amazon_url, description")
        .eq("id", video.product_id)
        .single();

      if (product) {
        if (product.product_image_url?.trim()) {
          // Image exists but may have been empty when checked — re-verify
          fixes.push({
            check: "hasProductImage",
            action: "Image URL already exists",
            success: true,
            detail: product.product_image_url,
          });
        } else if (product.amazon_url?.trim()) {
          // Has Amazon URL — flag for manual image extraction
          fixes.push({
            check: "hasProductImage",
            action: "Amazon URL available — needs manual image upload",
            success: false,
            detail: `Upload product image from: ${product.amazon_url}`,
          });
        } else {
          fixes.push({
            check: "hasProductImage",
            action: "No image source found",
            success: false,
            detail: "Upload a product image manually at /admin/products",
          });
        }
      }
    }
  }

  // --- Fix: scriptUnderLimit + hasOnScreenText (skit-level fixes) ---
  const { data: skit } = await supabaseAdmin
    .from("saved_skits")
    .select("id, skit_data, generation_config")
    .eq("video_id", videoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (skit) {
    const skitData = skit.skit_data as {
      beats?: Array<{
        t?: string;
        action?: string;
        dialogue?: string;
        on_screen_text?: string;
      }>;
      [key: string]: unknown;
    } | null;

    const beats = skitData?.beats || [];
    const genConfig = skit.generation_config as { duration?: number; target_duration?: string } | null;
    let duration = genConfig?.duration || 10;
    if (typeof genConfig?.target_duration === "string") {
      duration = { quick: 10, standard: 15, extended: 30, long: 30 }[genConfig.target_duration] || 10;
    }
    const wordLimit = SCRIPT_WORD_LIMITS[duration] || 50;

    // Count dialogue words (spoken script) — falls back to action for older skits
    const hasDialogue = beats.some((b) => b.dialogue?.trim());
    const currentWords = beats.reduce(
      (sum, b) => {
        const text = hasDialogue ? (b.dialogue || "") : (b.action || "");
        return sum + (text.trim() ? text.trim().split(/\s+/).length : 0);
      },
      0
    );

    let updatedBeats = [...beats];
    let skitChanged = false;

    // Fix scriptUnderLimit: condense beat actions
    if (!before.checks.scriptUnderLimit.pass && currentWords > wordLimit) {
      const condensed = await condenseBeatActions(beats, wordLimit, before.product || "the product");

      if (condensed && condensed.length === beats.length) {
        const newWords = condensed.reduce(
          (sum, b) => sum + (b.action ? b.action.trim().split(/\s+/).length : 0),
          0
        );

        if (newWords <= wordLimit) {
          updatedBeats = condensed.map((newBeat, i) => ({
            ...beats[i],
            action: newBeat.action,
            on_screen_text: newBeat.on_screen_text || beats[i]?.on_screen_text || "",
          }));
          skitChanged = true;
          fixes.push({
            check: "scriptUnderLimit",
            action: "AI-condensed beat actions",
            success: true,
            detail: `${currentWords} → ${newWords}/${wordLimit} words (${duration}s video)`,
          });
        } else {
          fixes.push({
            check: "scriptUnderLimit",
            action: "AI condensation still over limit",
            success: false,
            detail: `${currentWords} → ${newWords}/${wordLimit} words — needs manual edit`,
          });
        }
      } else {
        fixes.push({
          check: "scriptUnderLimit",
          action: "AI condensation failed",
          success: false,
          detail: "AI could not generate valid condensed beats",
        });
      }
    }

    // Fix hasOnScreenText: generate missing overlays
    if (!before.checks.hasOnScreenText.pass) {
      const beatsToCheck = skitChanged ? updatedBeats : beats;
      const missingCount = beatsToCheck.filter(
        (b) => !b.on_screen_text?.trim()
      ).length;

      if (missingCount > 0) {
        const generated = await generateOnScreenText(beatsToCheck);

        if (generated && Object.keys(generated).length > 0) {
          for (const [idxStr, text] of Object.entries(generated)) {
            const idx = parseInt(idxStr);
            if (idx >= 0 && idx < updatedBeats.length) {
              updatedBeats[idx] = { ...updatedBeats[idx], on_screen_text: text };
            }
          }
          skitChanged = true;
          fixes.push({
            check: "hasOnScreenText",
            action: "AI-generated on_screen_text for missing beats",
            success: true,
            detail: `Filled ${Object.keys(generated).length}/${missingCount} missing overlays`,
          });
        } else {
          fixes.push({
            check: "hasOnScreenText",
            action: "AI text generation failed",
            success: false,
            detail: "Could not generate on_screen_text — add manually",
          });
        }
      }
    }

    // Save updated skit if anything changed
    if (skitChanged) {
      const updatedSkitData = { ...skitData, beats: updatedBeats };
      const { error: updateErr } = await supabaseAdmin
        .from("saved_skits")
        .update({ skit_data: updatedSkitData })
        .eq("id", skit.id);

      if (updateErr) {
        fixes.push({
          check: "skit_save",
          action: "Save updated skit",
          success: false,
          detail: updateErr.message,
        });
      }
    }
  } else {
    // No skit — can't fix script/text issues
    if (!before.checks.hasScript.pass || !before.checks.scriptUnderLimit.pass) {
      fixes.push({
        check: "hasScript",
        action: "No skit linked",
        success: false,
        detail: "Generate a skit first via /api/ai/generate-skit",
      });
    }
  }

  // Re-run preflight to show the new state
  const after: PreflightResult = await runPreflight(videoId);

  return NextResponse.json({
    ok: true,
    videoId,
    readyBefore: before.ready,
    readyAfter: after.ready,
    fixes,
    before: before.checks,
    after: after.checks,
    correlation_id: correlationId,
  });
}
