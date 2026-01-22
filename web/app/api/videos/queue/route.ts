import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { QUEUE_STATUSES } from "@/lib/video-pipeline";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const VIDEO_SELECT_BASE = "id,variant_id,account_id,status,google_drive_url,created_at";
const VIDEO_SELECT_CLAIM = ",claimed_by,claimed_at,claim_expires_at";

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  const statusParam = searchParams.get("status");
  const claimedParam = searchParams.get("claimed") || "unclaimed";
  const accountId = searchParams.get("account_id");
  const limitParam = searchParams.get("limit");

  // Validate status if provided
  if (statusParam && !QUEUE_STATUSES.includes(statusParam as typeof QUEUE_STATUSES[number])) {
    const err = apiError("BAD_REQUEST", `status must be one of: ${QUEUE_STATUSES.join(", ")}`, 400, { provided: statusParam });
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate claimed param
  const validClaimedValues = ["unclaimed", "claimed", "any"];
  if (!validClaimedValues.includes(claimedParam)) {
    const err = apiError("BAD_REQUEST", `claimed must be one of: ${validClaimedValues.join(", ")}`, 400, { provided: claimedParam });
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Parse and validate limit
  let limit = 50;
  if (limitParam) {
    const parsedLimit = parseInt(limitParam, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      const err = apiError("BAD_REQUEST", "limit must be a positive integer", 400, { provided: limitParam });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    limit = Math.min(parsedLimit, 200);
  }

  try {
    // Check if claim columns exist (migration 010)
    const existingColumns = await getVideosColumns();
    const hasClaimColumns = existingColumns.has("claimed_by") && existingColumns.has("claim_expires_at");

    const selectCols = hasClaimColumns
      ? VIDEO_SELECT_BASE + VIDEO_SELECT_CLAIM
      : VIDEO_SELECT_BASE;

    let query = supabaseAdmin
      .from("videos")
      .select(selectCols)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Filter by status
    if (statusParam) {
      query = query.eq("status", statusParam);
    } else {
      query = query.in("status", [...QUEUE_STATUSES]);
    }

    // Filter by account_id if provided
    if (accountId) {
      query = query.eq("account_id", accountId);
    }

    // Apply claimed filter only if columns exist
    if (hasClaimColumns) {
      const now = new Date().toISOString();
      if (claimedParam === "unclaimed") {
        // unclaimed: claimed_by is null OR claim_expires_at < now
        query = query.or(`claimed_by.is.null,claim_expires_at.lt.${now}`);
      } else if (claimedParam === "claimed") {
        // claimed: claimed_by not null AND claim_expires_at >= now
        query = query.not("claimed_by", "is", null).gte("claim_expires_at", now);
      }
      // "any" - no additional filter
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/videos/queue Supabase error:", error);
      const err = apiError("DB_ERROR", error.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
      correlation_id: correlationId
    });

  } catch (err) {
    console.error("GET /api/videos/queue error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
