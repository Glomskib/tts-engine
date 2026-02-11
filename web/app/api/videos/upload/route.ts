import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";

export const runtime = "nodejs";

// 500 MB limit
const MAX_FILE_SIZE = 500 * 1024 * 1024;

// Allowed video MIME types and their extensions
const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-msvideo": "avi",
};

// Allowed extensions (fallback when MIME type is generic)
const ALLOWED_EXTENSIONS = new Set(["mp4", "mov", "webm", "avi"]);

const BUCKET_NAME = "video-files";

/**
 * Sanitize a filename for safe storage paths.
 * Strips the extension, replaces non-alphanumeric chars, and truncates.
 */
function sanitizeFilename(raw: string): string {
  return raw
    .replace(/\.[^/.]+$/, "") // remove extension
    .replace(/[^a-zA-Z0-9_-]/g, "_") // only safe chars
    .substring(0, 80); // limit length
}

/**
 * Ensure the storage bucket exists, creating it if necessary.
 * Returns true on success, or an error string on failure.
 */
async function ensureBucket(): Promise<true | string> {
  // Try listing the bucket first (cheap check)
  const { data: buckets, error: listError } =
    await supabaseAdmin.storage.listBuckets();

  if (listError) {
    return `Failed to list buckets: ${listError.message}`;
  }

  const exists = buckets?.some((b: { name: string }) => b.name === BUCKET_NAME);
  if (exists) return true;

  // Bucket doesn't exist -- create it
  const { error: createError } = await supabaseAdmin.storage.createBucket(
    BUCKET_NAME,
    {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: Object.keys(ALLOWED_VIDEO_TYPES),
    }
  );

  if (createError) {
    // Race condition: another request may have just created it
    if (
      createError.message?.includes("already exists") ||
      createError.message?.includes("duplicate")
    ) {
      return true;
    }
    return `Failed to create bucket: ${createError.message}`;
  }

  return true;
}

/**
 * POST /api/videos/upload
 *
 * Accepts multipart/form-data with a video file and optional metadata.
 * Uploads to Supabase Storage and creates/updates the pipeline video record.
 *
 * Form fields:
 *   file       - Required. Video file (mp4, mov, webm, avi). Max 500 MB.
 *   product_id - Optional UUID. Links video to a product.
 *   title      - Optional string. Display title for the video.
 *   type       - Optional. "raw" (default) or "edited".
 *   video_id   - Optional UUID. Existing video to attach file to.
 */
export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    // ----------------------------------------------------------------
    // 1. Auth
    // ----------------------------------------------------------------
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse(
        "UNAUTHORIZED",
        "Authentication required",
        401,
        correlationId
      );
    }

    const userId = authContext.user.id;

    // ----------------------------------------------------------------
    // 2. Parse multipart form data
    // ----------------------------------------------------------------
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "Invalid form data. Expected multipart/form-data.",
        400,
        correlationId
      );
    }

    const file = formData.get("file") as File | null;
    const productId = (formData.get("product_id") as string | null)?.trim() || null;
    const title = (formData.get("title") as string | null)?.trim() || null;
    const typeRaw = (formData.get("type") as string | null)?.trim()?.toLowerCase() || "raw";
    const videoId = (formData.get("video_id") as string | null)?.trim() || null;

    // ----------------------------------------------------------------
    // 3. Validate file presence
    // ----------------------------------------------------------------
    if (!file || !(file instanceof File) || file.size === 0) {
      return createApiErrorResponse(
        "VALIDATION_ERROR",
        "No video file provided. Include a 'file' field in the form data.",
        400,
        correlationId
      );
    }

    // ----------------------------------------------------------------
    // 4. Validate file type (MIME + extension fallback)
    // ----------------------------------------------------------------
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const isAllowedMime = file.type in ALLOWED_VIDEO_TYPES;
    const isAllowedExt = ALLOWED_EXTENSIONS.has(extension);

    if (!isAllowedMime && !isAllowedExt) {
      return createApiErrorResponse(
        "VALIDATION_ERROR",
        `Invalid video format. Allowed types: mp4, mov, webm, avi. Received MIME="${file.type}", extension=".${extension}".`,
        400,
        correlationId
      );
    }

    // ----------------------------------------------------------------
    // 5. Validate file size
    // ----------------------------------------------------------------
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = Math.round(file.size / 1024 / 1024);
      return createApiErrorResponse(
        "VALIDATION_ERROR",
        `File too large (${sizeMB} MB). Maximum allowed size is 500 MB.`,
        400,
        correlationId
      );
    }

    // ----------------------------------------------------------------
    // 6. Validate type field
    // ----------------------------------------------------------------
    if (typeRaw !== "raw" && typeRaw !== "edited") {
      return createApiErrorResponse(
        "VALIDATION_ERROR",
        `Invalid type "${typeRaw}". Must be "raw" or "edited".`,
        400,
        correlationId
      );
    }
    const uploadType: "raw" | "edited" = typeRaw;

    // ----------------------------------------------------------------
    // 7. Validate video_id format if provided
    // ----------------------------------------------------------------
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (videoId && !uuidRegex.test(videoId)) {
      return createApiErrorResponse(
        "INVALID_UUID",
        "Invalid video_id format. Must be a valid UUID.",
        400,
        correlationId
      );
    }

    if (productId && !uuidRegex.test(productId)) {
      return createApiErrorResponse(
        "INVALID_UUID",
        "Invalid product_id format. Must be a valid UUID.",
        400,
        correlationId
      );
    }

    // Edited uploads require an existing video_id
    if (uploadType === "edited" && !videoId) {
      return createApiErrorResponse(
        "VALIDATION_ERROR",
        'video_id is required when type is "edited". Specify which video this edit belongs to.',
        400,
        correlationId
      );
    }

    // ----------------------------------------------------------------
    // 8. Ensure storage bucket exists
    // ----------------------------------------------------------------
    const bucketResult = await ensureBucket();
    if (bucketResult !== true) {
      console.error(`[${correlationId}] Bucket error:`, bucketResult);
      return createApiErrorResponse(
        "STORAGE_ERROR",
        bucketResult,
        500,
        correlationId
      );
    }

    // ----------------------------------------------------------------
    // 9. Upload file to Supabase Storage
    // ----------------------------------------------------------------
    const sanitized = sanitizeFilename(file.name);
    const fileExt =
      ALLOWED_VIDEO_TYPES[file.type] || (isAllowedExt ? extension : "mp4");
    const storagePath = `${userId}/${uploadType}/${Date.now()}_${sanitized}.${fileExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data: uploadData, error: uploadError } =
      await supabaseAdmin.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
        contentType: file.type || "video/mp4",
        upsert: false,
      });

    if (uploadError) {
      console.error(
        `[${correlationId}] Storage upload error:`,
        uploadError
      );
      return createApiErrorResponse(
        "STORAGE_ERROR",
        `Upload failed: ${uploadError.message}`,
        500,
        correlationId
      );
    }

    // ----------------------------------------------------------------
    // 10. Get public URL
    // ----------------------------------------------------------------
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage
      .from(BUCKET_NAME)
      .getPublicUrl(uploadData.path);

    const fileSizeMb = parseFloat((file.size / (1024 * 1024)).toFixed(2));

    // ----------------------------------------------------------------
    // 11. Create or update video record
    // ----------------------------------------------------------------
    let videoRecord: Record<string, unknown> | null = null;

    if (uploadType === "raw" && !videoId) {
      // --- Case A: New pipeline entry for raw footage ---
      const videoTitle =
        title || file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

      const insertPayload: Record<string, unknown> = {
        user_id: userId,
        title: videoTitle,
        recording_status: "NEEDS_EDIT",
        raw_video_url: publicUrl,
        file_size_mb: fileSizeMb,
        status: "needs_edit",
      };

      if (productId) {
        insertPayload.product_id = productId;
      }

      const { data, error } = await supabaseAdmin
        .from("videos")
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error(
          `[${correlationId}] DB insert error:`,
          error
        );
        return createApiErrorResponse(
          "DB_ERROR",
          `Failed to create video record: ${error.message}`,
          500,
          correlationId
        );
      }

      videoRecord = data;
    } else if (uploadType === "raw" && videoId) {
      // --- Case B: Attach raw footage to existing video ---
      const updatePayload: Record<string, unknown> = {
        raw_video_url: publicUrl,
        file_size_mb: fileSizeMb,
      };

      const { data, error } = await supabaseAdmin
        .from("videos")
        .update(updatePayload)
        .eq("id", videoId)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return createApiErrorResponse(
            "NOT_FOUND",
            `Video not found: ${videoId}`,
            404,
            correlationId
          );
        }
        console.error(
          `[${correlationId}] DB update error (raw):`,
          error
        );
        return createApiErrorResponse(
          "DB_ERROR",
          `Failed to update video record: ${error.message}`,
          500,
          correlationId
        );
      }

      videoRecord = data;
    } else if (uploadType === "edited" && videoId) {
      // --- Case C: Attach edited version to existing video ---
      const updatePayload: Record<string, unknown> = {
        edited_video_url: publicUrl,
        recording_status: "REVIEW",
      };

      const { data, error } = await supabaseAdmin
        .from("videos")
        .update(updatePayload)
        .eq("id", videoId)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return createApiErrorResponse(
            "NOT_FOUND",
            `Video not found: ${videoId}`,
            404,
            correlationId
          );
        }
        console.error(
          `[${correlationId}] DB update error (edited):`,
          error
        );
        return createApiErrorResponse(
          "DB_ERROR",
          `Failed to update video record: ${error.message}`,
          500,
          correlationId
        );
      }

      videoRecord = data;
    }

    // ----------------------------------------------------------------
    // 12. Return success response
    // ----------------------------------------------------------------
    const response = NextResponse.json(
      {
        ok: true,
        data: {
          video: videoRecord,
          file: {
            url: publicUrl,
            path: uploadData.path,
            size_mb: fileSizeMb,
            type: uploadType,
          },
        },
        correlation_id: correlationId,
      },
      { status: videoId ? 200 : 201 }
    );

    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Unexpected error in video upload:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      "Internal server error during video upload",
      500,
      correlationId
    );
  }
}
