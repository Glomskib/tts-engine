import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Generate a slug from a string (uppercase alphanumeric only)
 */
function generateSlug(str: string, maxLength: number = 8): string {
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, maxLength) || "UNKNOWN";
}

/**
 * Format date as YYMMDD in America/New_York timezone
 */
function formatDateCode(): string {
  const now = new Date();
  // Format in America/New_York timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === "year")?.value || "00";
  const month = parts.find(p => p.type === "month")?.value || "00";
  const day = parts.find(p => p.type === "day")?.value || "00";
  return `${year}${month}${day}`;
}

/**
 * Generate a unique video code: BRAND-SKU-YYMMDD-###
 * Retries on conflict with incrementing sequence
 */
async function generateVideoCode(
  brandName: string,
  productName: string,
  productSlug: string | null,
  productId: string,
  correlationId: string
): Promise<string | null> {
  const brandSlug = generateSlug(brandName, 6);
  const skuSlug = productSlug ? productSlug.toUpperCase().slice(0, 6) : generateSlug(productName, 6);
  const dateCode = formatDateCode();

  // Find existing videos with same prefix today to get next sequence
  const prefix = `${brandSlug}-${skuSlug}-${dateCode}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Query existing codes with this prefix
      const { data: existing } = await supabaseAdmin
        .from("videos")
        .select("video_code")
        .like("video_code", `${prefix}-%`)
        .order("video_code", { ascending: false })
        .limit(1);

      // Calculate next sequence number
      let sequence = 1;
      if (existing && existing.length > 0 && existing[0].video_code) {
        const lastCode = existing[0].video_code;
        const lastSeq = parseInt(lastCode.split("-").pop() || "0", 10);
        sequence = lastSeq + 1;
      }

      // Add attempt offset for retry
      sequence += attempt;

      const videoCode = `${prefix}-${String(sequence).padStart(3, "0")}`;
      return videoCode;
    } catch (error) {
      console.error(`[${correlationId}] Video code generation attempt ${attempt + 1} failed:`, error);
    }
  }

  return null;
}

export interface HookPackageParams {
  spoken_hook?: string;
  visual_hook?: string;
  on_screen_text_hook?: string;
  on_screen_text_mid?: string[];
  on_screen_text_cta?: string;
  hook_type?: string;
}

export interface ReferenceParams {
  script_text?: string;
  video_url?: string;
  tone_preset?: string;
}

export interface CreateVideoParams {
  product_id: string;
  script_path: "existing" | "generate" | "later";
  existing_script_id?: string;
  brief?: {
    hook?: string;
    angle?: string;
    proof_type?: string;
    notes?: string;
  };
  hook_package?: HookPackageParams;
  reference?: ReferenceParams;
  script_draft?: string;
  priority?: "normal" | "high";
  target_account?: string;
}

export interface CreateVideoResult {
  ok: boolean;
  data?: {
    video: Record<string, unknown>;
    concept: Record<string, unknown>;
    product: Record<string, unknown>;
  };
  error?: string;
  error_code?: string;
  correlation_id: string;
}

/**
 * Internal function to create a video from product.
 * Used by both /api/videos/create-from-product and /api/videos/admin
 */
export async function createVideoFromProduct(
  params: CreateVideoParams,
  correlationId: string,
  actor: string = "api"
): Promise<CreateVideoResult> {
  const {
    product_id,
    script_path,
    existing_script_id,
    brief,
    hook_package,
    reference,
    script_draft,
    priority,
    target_account,
  } = params;

  // Validate product_id
  if (!product_id || typeof product_id !== "string" || product_id.trim() === "") {
    return {
      ok: false,
      error: "product_id is required",
      error_code: "VALIDATION_ERROR",
      correlation_id: correlationId,
    };
  }

  // Validate script_path
  const validScriptPaths = ["existing", "generate", "later"];
  if (!script_path || !validScriptPaths.includes(script_path)) {
    return {
      ok: false,
      error: `script_path must be one of: ${validScriptPaths.join(", ")}`,
      error_code: "VALIDATION_ERROR",
      correlation_id: correlationId,
    };
  }

  try {
    // Fetch product to verify it exists and get brand info
    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, name, brand, category, primary_link")
      .eq("id", product_id.trim())
      .single();

    if (productError || !product) {
      return {
        ok: false,
        error: "Product not found. Please select a valid product.",
        error_code: "NOT_FOUND",
        correlation_id: correlationId,
      };
    }

    // Validate brand exists on product
    if (!product.brand || product.brand.trim() === "") {
      return {
        ok: false,
        error: "Product has no brand assigned. Please update the product first.",
        error_code: "VALIDATION_ERROR",
        correlation_id: correlationId,
      };
    }

    // Determine recording status based on script path
    // NEEDS_SCRIPT = waiting for script (do NOT notify recorder)
    // NOT_RECORDED = ready for recording (will notify recorder)
    // GENERATING_SCRIPT = AI is generating script
    let recordingStatus: string;
    let shouldNotifyRecorder = false;

    switch (script_path) {
      case "later":
        recordingStatus = "NEEDS_SCRIPT";
        shouldNotifyRecorder = false;
        break;
      case "generate":
        recordingStatus = "GENERATING_SCRIPT";
        shouldNotifyRecorder = false;
        break;
      case "existing":
        // If script is being attached, video is ready for recording
        recordingStatus = "NOT_RECORDED";
        shouldNotifyRecorder = true;
        break;
      default:
        recordingStatus = "NEEDS_SCRIPT";
        shouldNotifyRecorder = false;
    }

    // Build the brief/concept object with defaults
    const briefData = brief || {};
    const hookValue = hook_package?.spoken_hook?.trim() || briefData.hook?.trim() || "Hook TBD";
    const angleValue = briefData.angle?.trim() || "Angle TBD";
    const proofTypeValue = briefData.proof_type || "testimonial";

    const conceptPayload: Record<string, unknown> = {
      product_id: product_id.trim(),
      title: `${product.brand} - ${product.name}`,
      angle: angleValue,
      hypothesis: briefData.notes || null,
      proof_type: proofTypeValue,
      hook_options: [hookValue],
      notes: briefData.notes || null,
    };

    // Add hook package fields if provided
    if (hook_package) {
      conceptPayload.visual_hook = hook_package.visual_hook?.trim() || null;
      conceptPayload.on_screen_text_hook = hook_package.on_screen_text_hook?.trim() || null;
      conceptPayload.on_screen_text_mid = hook_package.on_screen_text_mid || null;
      conceptPayload.on_screen_text_cta = hook_package.on_screen_text_cta?.trim() || null;
      conceptPayload.hook_type = hook_package.hook_type || null;
    }

    // Add reference data if provided
    if (reference) {
      conceptPayload.reference_script = reference.script_text || null;
      conceptPayload.reference_video_url = reference.video_url || null;
      conceptPayload.tone_preset = reference.tone_preset || null;
    }

    // Create concept first (to link brief data)
    const { data: concept, error: conceptError } = await supabaseAdmin
      .from("concepts")
      .insert(conceptPayload)
      .select()
      .single();

    if (conceptError) {
      console.error("Failed to create concept:", conceptError);
      return {
        ok: false,
        error: "Failed to create concept: " + conceptError.message,
        error_code: "DB_ERROR",
        correlation_id: correlationId,
      };
    }

    // Create video with product_id and concept_id
    const videoPayload: Record<string, unknown> = {
      product_id: product_id.trim(),
      concept_id: concept.id,
      status: "needs_edit",
      recording_status: recordingStatus,
      google_drive_url: "", // Will be set later
    };

    // If script draft is provided, lock it immediately
    if (script_draft && script_draft.trim()) {
      videoPayload.script_locked_text = script_draft.trim();
      videoPayload.script_locked_version = 1;
      // If script is provided, set to NOT_RECORDED (ready for recording)
      videoPayload.recording_status = "NOT_RECORDED";
    }

    // Add posting_meta with target_account and priority if provided
    const postingMeta: Record<string, unknown> = {};
    if (target_account) {
      postingMeta.target_account = target_account;
    }
    if (priority === "high") {
      postingMeta.priority = "high";
    }
    if (Object.keys(postingMeta).length > 0) {
      videoPayload.posting_meta = postingMeta;
    }

    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .insert(videoPayload)
      .select()
      .single();

    if (videoError) {
      console.error("Failed to create video:", videoError);
      return {
        ok: false,
        error: "Failed to create video: " + videoError.message,
        error_code: "DB_ERROR",
        correlation_id: correlationId,
      };
    }

    // Generate and set video_code
    const videoCode = await generateVideoCode(
      product.brand,
      product.name,
      (product as Record<string, unknown>).slug as string | null,
      product_id.trim(),
      correlationId
    );

    if (videoCode) {
      // Update video with code (retry on conflict)
      for (let attempt = 0; attempt < 3; attempt++) {
        const codeToTry = attempt === 0 ? videoCode : `${videoCode.slice(0, -3)}${String(parseInt(videoCode.slice(-3)) + attempt).padStart(3, "0")}`;
        const { error: codeError } = await supabaseAdmin
          .from("videos")
          .update({ video_code: codeToTry })
          .eq("id", video.id);

        if (!codeError) {
          video.video_code = codeToTry;
          break;
        } else if (codeError.code === "23505") {
          // Unique constraint violation, retry with next sequence
          console.log(`[${correlationId}] Video code conflict, retrying with next sequence`);
          continue;
        } else {
          console.error(`[${correlationId}] Failed to set video_code:`, codeError);
          break;
        }
      }
    }

    // Write audit event
    await supabaseAdmin.from("video_events").insert({
      video_id: video.id,
      event_type: "video_created",
      correlation_id: correlationId,
      actor,
      from_status: null,
      to_status: recordingStatus,
      details: {
        product_id: product_id.trim(),
        product_name: product.name,
        brand: product.brand,
        script_path,
        priority: priority || "normal",
        has_brief: !!brief,
        hook_tbd: !briefData.hook?.trim(),
        angle_tbd: !briefData.angle?.trim(),
        should_notify_recorder: shouldNotifyRecorder,
      },
    });

    // TODO: If shouldNotifyRecorder, trigger pipeline notification
    // For now, this is handled by the status machine when script is attached

    // If script_path is "generate", queue for AI generation
    if (script_path === "generate") {
      console.log(`[${correlationId}] Video ${video.id} queued for AI script generation`);
      // TODO: Trigger AI script generation job
    }

    return {
      ok: true,
      data: {
        video,
        concept,
        product,
      },
      correlation_id: correlationId,
    };

  } catch (err) {
    console.error("createVideoFromProduct error:", err);
    return {
      ok: false,
      error: "Internal server error",
      error_code: "DB_ERROR",
      correlation_id: correlationId,
    };
  }
}

/**
 * POST /api/videos/create-from-product
 *
 * Creates a new video task from a product selection.
 * This is the main entrypoint for creating videos from the pipeline UI.
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const params = body as CreateVideoParams;
  const result = await createVideoFromProduct(params, correlationId);

  if (!result.ok) {
    const statusCode = result.error_code === "NOT_FOUND" ? 404 :
                       result.error_code === "VALIDATION_ERROR" ? 400 : 500;
    return NextResponse.json({
      ok: false,
      error: result.error,
      error_code: result.error_code,
      correlation_id: correlationId,
    }, { status: statusCode });
  }

  return NextResponse.json(result);
}
