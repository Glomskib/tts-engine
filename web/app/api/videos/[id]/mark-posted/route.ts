/**
 * POST /api/videos/[id]/mark-posted
 *
 * Transitions a video from ready_to_post to posted status and records posting details.
 *
 * Request body:
 * - posted_url: string (required, valid URL)
 * - platform: "tiktok" | "instagram" | "youtube" | "other" (optional, default "tiktok")
 * - force: boolean (optional, default false - admin only)
 *
 * Stores in posting_meta:
 * - posted_url: The URL where the video was posted
 * - posted_at: ISO timestamp of when mark-posted was called
 * - posted_by: User ID or email of who marked it posted
 * - platform: Platform where video was posted
 *
 * Idempotent behavior:
 * - If already posted with same posted_url -> returns ok with idempotent=true
 * - If already posted with different posted_url -> admin can update, others get error
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId, type ApiErrorCode } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { transitionVideoStatusAtomic } from "@/lib/video-status-machine";
import { type VideoStatus } from "@/lib/video-pipeline";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_PLATFORMS = ["tiktok", "instagram", "youtube", "other"] as const;
type Platform = (typeof VALID_PLATFORMS)[number];

interface MarkPostedRequest {
  posted_url: string;
  platform?: Platform;
  force?: boolean;
}

interface PostingMetaWithPosted {
  target_account?: string | null;
  uploader_checklist_completed_at?: string | null;
  posted_url?: string | null;
  posted_at?: string | null;
  posted_by?: string | null;
  platform?: string | null;
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Writes a video_mark_posted event to video_events table
 */
async function writeMarkPostedEvent(params: {
  video_id: string;
  correlation_id: string;
  actor: string;
  from_status: string;
  to_status: string;
  posted_url: string;
  platform: string;
  posted_at: string;
  posted_by: string;
  idempotent: boolean;
}): Promise<void> {
  try {
    await supabaseAdmin.from("video_events").insert({
      video_id: params.video_id,
      event_type: "video_mark_posted",
      correlation_id: params.correlation_id,
      actor: params.actor,
      from_status: params.from_status,
      to_status: params.to_status,
      details: {
        posted_url: params.posted_url,
        platform: params.platform,
        posted_at: params.posted_at,
        posted_by: params.posted_by,
        idempotent: params.idempotent,
      },
    });
  } catch (err) {
    console.error("Failed to write mark_posted event:", err);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: videoId } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID
  if (!UUID_REGEX.test(videoId)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  // Get auth context
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const actor = authContext.user.id;
  const actorEmail = authContext.user.email;
  const isAdmin = authContext.isAdmin;
  const isUploader = authContext.isUploader;

  // Access control: admin OR uploader
  if (!isAdmin && !isUploader) {
    return createApiErrorResponse("FORBIDDEN", "Admin or uploader access required", 403, correlationId);
  }

  // Parse body
  let body: MarkPostedRequest;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  // Validate posted_url
  if (!body.posted_url || typeof body.posted_url !== "string") {
    return createApiErrorResponse("BAD_REQUEST", "posted_url is required", 400, correlationId);
  }

  if (!isValidUrl(body.posted_url)) {
    return createApiErrorResponse("BAD_REQUEST", "posted_url must be a valid HTTP/HTTPS URL", 400, correlationId);
  }

  // Validate platform
  const platform: Platform = body.platform && VALID_PLATFORMS.includes(body.platform as Platform)
    ? (body.platform as Platform)
    : "tiktok";

  // Force flag only allowed for admins
  const force = isAdmin && body.force === true;

  // Fetch current video state
  const { data: video, error: fetchError } = await supabaseAdmin
    .from("videos")
    .select("id, status, posting_meta")
    .eq("id", videoId)
    .single();

  if (fetchError || !video) {
    return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
  }

  const currentStatus = video.status as VideoStatus;
  const currentPostingMeta = (video.posting_meta || {}) as PostingMetaWithPosted;
  const postedAt = new Date().toISOString();
  const postedBy = actorEmail || actor;

  // Handle idempotency: if already posted
  if (currentStatus === "posted") {
    const existingUrl = currentPostingMeta.posted_url;

    // Same URL - idempotent success
    if (existingUrl === body.posted_url) {
      await writeMarkPostedEvent({
        video_id: videoId,
        correlation_id: correlationId,
        actor,
        from_status: "posted",
        to_status: "posted",
        posted_url: body.posted_url,
        platform: currentPostingMeta.platform || platform,
        posted_at: currentPostingMeta.posted_at || postedAt,
        posted_by: currentPostingMeta.posted_by || postedBy,
        idempotent: true,
      });

      return NextResponse.json({
        ok: true,
        data: {
          video_id: videoId,
          previous_status: "posted",
          new_status: "posted",
          posted_url: body.posted_url,
          posted_at: currentPostingMeta.posted_at,
          posted_by: currentPostingMeta.posted_by,
          platform: currentPostingMeta.platform,
        },
        meta: {
          action: "no_change",
          idempotent: true,
        },
        correlation_id: correlationId,
      });
    }

    // Different URL - only admin can update
    if (!isAdmin) {
      return createApiErrorResponse("CONFLICT", "Video already posted with a different URL. Only admins can update the posted URL.", 409, correlationId, {
        existing_posted_url: existingUrl,
        requested_posted_url: body.posted_url,
      });
    }

    // Admin updating posted URL
    const newPostingMeta: PostingMetaWithPosted = {
      ...currentPostingMeta,
      posted_url: body.posted_url,
      posted_at: postedAt,
      posted_by: postedBy,
      platform,
    };

    const { error: updateError } = await supabaseAdmin
      .from("videos")
      .update({ posting_meta: newPostingMeta })
      .eq("id", videoId);

    if (updateError) {
      return createApiErrorResponse("DB_ERROR", `Failed to update posting metadata: ${updateError.message}`, 500, correlationId);
    }

    await writeMarkPostedEvent({
      video_id: videoId,
      correlation_id: correlationId,
      actor,
      from_status: "posted",
      to_status: "posted",
      posted_url: body.posted_url,
      platform,
      posted_at: postedAt,
      posted_by: postedBy,
      idempotent: false,
    });

    return NextResponse.json({
      ok: true,
      data: {
        video_id: videoId,
        previous_status: "posted",
        new_status: "posted",
        posted_url: body.posted_url,
        posted_at: postedAt,
        posted_by: postedBy,
        platform,
      },
      meta: {
        action: "updated",
        admin_override: true,
      },
      correlation_id: correlationId,
    });
  }

  // Normal flow: transition from ready_to_post to posted
  // Prepare updated posting_meta with posted fields
  const newPostingMeta: PostingMetaWithPosted = {
    ...currentPostingMeta,
    posted_url: body.posted_url,
    posted_at: postedAt,
    posted_by: postedBy,
    platform,
  };

  // Use transitionVideoStatusAtomic for the status change
  // It will enforce FINAL_ASSET_REQUIRED gate and write status_change event
  const transitionResult = await transitionVideoStatusAtomic(supabaseAdmin, {
    video_id: videoId,
    actor,
    target_status: "posted",
    correlation_id: correlationId,
    force,
    additional_updates: {
      posting_meta: newPostingMeta,
    },
  });

  if (!transitionResult.ok) {
    // Map error codes to API responses
    const errorMap: Record<string, { code: ApiErrorCode; status: number }> = {
      NOT_FOUND: { code: "NOT_FOUND", status: 404 },
      INVALID_TRANSITION: { code: "INVALID_TRANSITION", status: 400 },
      FINAL_ASSET_REQUIRED: { code: "FINAL_ASSET_REQUIRED", status: 422 },
      POSTING_META_INCOMPLETE: { code: "POSTING_META_INCOMPLETE", status: 422 },
      COMPLIANCE_BLOCKED: { code: "COMPLIANCE_BLOCKED", status: 422 },
      CLAIM_REQUIRED: { code: "CLAIM_REQUIRED", status: 409 },
      CONFLICT: { code: "CONFLICT", status: 409 },
    };

    const errorInfo = errorMap[transitionResult.error_code || ""] || { code: "DB_ERROR" as ApiErrorCode, status: 500 };
    return createApiErrorResponse(errorInfo.code, transitionResult.message, errorInfo.status, correlationId, {
      current_status: transitionResult.current_status,
      allowed_next: transitionResult.allowed_next,
      error_code: transitionResult.error_code,
    });
  }

  // Write the video_mark_posted event (status_change already written by transitionVideoStatusAtomic)
  await writeMarkPostedEvent({
    video_id: videoId,
    correlation_id: correlationId,
    actor,
    from_status: transitionResult.previous_status || "ready_to_post",
    to_status: "posted",
    posted_url: body.posted_url,
    platform,
    posted_at: postedAt,
    posted_by: postedBy,
    idempotent: false,
  });

  // Auto-increment brand's videos_this_month quota counter (non-blocking)
  try {
    const { data: videoWithProduct } = await supabaseAdmin
      .from("videos")
      .select("product_id")
      .eq("id", videoId)
      .single();

    if (videoWithProduct?.product_id) {
      const { data: product } = await supabaseAdmin
        .from("products")
        .select("brand_id")
        .eq("id", videoWithProduct.product_id)
        .single();

      if (product?.brand_id) {
        const { data: brand } = await supabaseAdmin
          .from("brands")
          .select("id, videos_this_month, monthly_video_quota")
          .eq("id", product.brand_id)
          .single();

        if (brand && brand.monthly_video_quota > 0) {
          await supabaseAdmin
            .from("brands")
            .update({ videos_this_month: (brand.videos_this_month || 0) + 1 })
            .eq("id", brand.id);
        }
      }
    }
  } catch (quotaErr) {
    console.error("Failed to increment brand quota counter:", quotaErr);
    // Non-blocking — don't fail the mark-posted operation
  }

  return NextResponse.json({
    ok: true,
    data: {
      video_id: videoId,
      previous_status: transitionResult.previous_status,
      new_status: "posted",
      posted_url: body.posted_url,
      posted_at: postedAt,
      posted_by: postedBy,
      platform,
    },
    meta: {
      action: transitionResult.action,
      force_used: force,
    },
    correlation_id: correlationId,
  });
}
