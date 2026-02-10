import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createVideoFromProduct, CreateVideoParams } from "@/lib/createVideoFromProduct";
import { z } from "zod";

export const runtime = "nodejs";

// --- Input Validation Schema ---

const SendToVideoInputSchema = z.object({
  posting_account_id: z.string().uuid().optional(),
  priority: z.enum(["normal", "high"]).default("normal"),
}).strict();

/**
 * POST /api/skits/[id]/send-to-video
 *
 * Creates a video from a saved skit and links them together.
 * The skit's script content is used as the video's script draft.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id: skitId } = await params;

  // Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!skitId || skitId.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Skit ID is required", 400, correlationId);
  }

  // Parse optional input
  let input: z.infer<typeof SendToVideoInputSchema> = { priority: "normal" };
  try {
    const body = await request.json();
    input = SendToVideoInputSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    // If no body provided or invalid JSON, use defaults
  }

  try {
    // Fetch the skit with full data
    const { data: skit, error: skitError } = await supabaseAdmin
      .from("saved_skits")
      .select("*")
      .eq("id", skitId.trim())
      .eq("user_id", authContext.user.id)
      .single();

    if (skitError || !skit) {
      return createApiErrorResponse("NOT_FOUND", "Skit not found", 404, correlationId, { skit_id: skitId.trim() });
    }

    // Check if skit already has a linked video
    if (skit.video_id) {
      return createApiErrorResponse(
        "CONFLICT",
        "This skit already has a linked video",
        409,
        correlationId,
        { video_id: skit.video_id }
      );
    }

    // Verify product exists
    if (!skit.product_id) {
      return createApiErrorResponse(
        "VALIDATION_ERROR",
        "Skit must have a product to create a video",
        400,
        correlationId
      );
    }

    // Build script from skit data
    const skitData = skit.skit_data as {
      hook_line: string;
      beats: Array<{ t: string; action: string; dialogue?: string; on_screen_text?: string }>;
      cta_line: string;
      cta_overlay: string;
      b_roll?: string[];
      overlays?: string[];
    };

    const scriptLines: string[] = [];

    // Hook
    scriptLines.push(`[HOOK]`);
    scriptLines.push(skitData.hook_line);
    scriptLines.push("");

    // Scenes/Beats
    for (let i = 0; i < skitData.beats.length; i++) {
      const beat = skitData.beats[i];
      scriptLines.push(`[SCENE ${i + 1}] ${beat.t}`);
      scriptLines.push(`Action: ${beat.action}`);
      if (beat.dialogue) {
        scriptLines.push(`Dialogue: "${beat.dialogue}"`);
      }
      if (beat.on_screen_text) {
        scriptLines.push(`On-screen text: "${beat.on_screen_text}"`);
      }
      scriptLines.push("");
    }

    // CTA
    scriptLines.push(`[CTA]`);
    scriptLines.push(skitData.cta_line);
    if (skitData.cta_overlay) {
      scriptLines.push(`Overlay: "${skitData.cta_overlay}"`);
    }

    // B-roll suggestions
    if (skitData.b_roll && skitData.b_roll.length > 0) {
      scriptLines.push("");
      scriptLines.push(`[B-ROLL SUGGESTIONS]`);
      skitData.b_roll.forEach((b, i) => scriptLines.push(`${i + 1}. ${b}`));
    }

    // Overlays
    if (skitData.overlays && skitData.overlays.length > 0) {
      scriptLines.push("");
      scriptLines.push(`[TEXT OVERLAYS]`);
      skitData.overlays.forEach((o, i) => scriptLines.push(`${i + 1}. ${o}`));
    }

    const scriptDraft = scriptLines.join("\n");

    // Create video from product with the skit script
    const videoParams: CreateVideoParams = {
      product_id: skit.product_id,
      script_path: "existing", // Script is provided
      script_draft: scriptDraft,
      brief: {
        hook: skitData.hook_line,
        notes: `Generated from skit: ${skit.title}`,
      },
      priority: input.priority,
      posting_account_id: input.posting_account_id,
    };

    const videoResult = await createVideoFromProduct(videoParams, correlationId, "skit-to-video");

    if (!videoResult.ok || !videoResult.data) {
      return createApiErrorResponse(
        "INTERNAL",
        videoResult.error || "Failed to create video from skit",
        500,
        correlationId
      );
    }

    // Link the skit to the video and update status to "produced"
    const { error: linkError } = await supabaseAdmin
      .from("saved_skits")
      .update({
        video_id: videoResult.data.video.id,
        status: "produced"
      })
      .eq("id", skitId.trim())
      .eq("user_id", authContext.user.id);

    if (linkError) {
      console.error(`[${correlationId}] Failed to link skit to video:`, linkError);
      // Video was created but linking failed - still return success with warning
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        skit_id: skitId.trim(),
        video_id: videoResult.data.video.id,
        video_code: videoResult.data.video.video_code,
        message: "Skit sent to video queue successfully",
      },
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Send to video error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to send skit to video queue",
      500,
      correlationId
    );
  }
}
