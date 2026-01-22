import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { isValidStatus, QUEUE_STATUSES } from "@/lib/video-pipeline";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function writeVideoEvent(
  videoId: string,
  eventType: string,
  correlationId: string,
  actor: string,
  fromStatus: string | null,
  toStatus: string | null,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from("video_events").insert({
      video_id: videoId,
      event_type: eventType,
      correlation_id: correlationId,
      actor,
      from_status: fromStatus,
      to_status: toStatus,
      details,
    });
  } catch (err) {
    console.error("Failed to write video event:", err);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const account_id = searchParams.get("account_id");
  const status = searchParams.get("status");
  const variant_id = searchParams.get("variant_id");

  // account_id is required for portal pages
  if (!account_id) {
    return NextResponse.json(
      { ok: false, error: "account_id is required" },
      { status: 400 }
    );
  }

  try {
    let query = supabaseAdmin
      .from("videos")
      .select("*")
      .eq("account_id", account_id)
      .order("created_at", { ascending: false });

    // Add optional query filters
    if (status) {
      query = query.eq("status", status);
    }

    if (variant_id) {
      query = query.eq("variant_id", variant_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/videos Supabase error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });

  } catch (err) {
    console.error("GET /api/videos error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // Generate or read correlation ID
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const { 
    variant_id, 
    google_drive_url,
    final_video_url, 
    account_id,
    caption_used, 
    hashtags_used, 
    status
  } = body as Record<string, unknown>;

  // Validate variant_id
  if (typeof variant_id !== "string" || variant_id.trim() === "") {
    const err = apiError("BAD_REQUEST", "variant_id is required and must be a non-empty string", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Accept google_drive_url or final_video_url (map final_video_url -> google_drive_url if google_drive_url missing)
  const google_drive_url_value = google_drive_url ?? final_video_url;

  // Validate google_drive_url_value is a non-empty string
  if (typeof google_drive_url_value !== "string" || google_drive_url_value.trim() === "") {
    const err = apiError("BAD_REQUEST", "google_drive_url or final_video_url is required and must be a non-empty string", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate status if provided
  if (status !== undefined) {
    if (typeof status !== "string" || !isValidStatus(status)) {
      const err = apiError("INVALID_STATUS", "Invalid status value", 400, { provided: status });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
  }

  // Determine effective status (default to needs_edit)
  const effectiveStatus = (status as string) || "needs_edit";

  // Check for existing queue video with same variant+account (idempotency)
  if (QUEUE_STATUSES.includes(effectiveStatus as typeof QUEUE_STATUSES[number])) {
    const { data: existing } = await supabaseAdmin
      .from("videos")
      .select("id,status")
      .eq("variant_id", (variant_id as string).trim())
      .eq("account_id", (account_id as string).trim())
      .in("status", [...QUEUE_STATUSES])
      .limit(1)
      .single();

    if (existing) {
      // Return existing record instead of creating duplicate
      const { data: fullRecord } = await supabaseAdmin
        .from("videos")
        .select("*")
        .eq("id", existing.id)
        .single();

      // Write audit event for dedupe
      await writeVideoEvent(
        existing.id,
        "dedupe_return_existing",
        correlationId,
        "api",
        null,
        existing.status,
        { variant_id, account_id, status: effectiveStatus }
      );

      return NextResponse.json({ 
        ok: true, 
        data: fullRecord,
        existing: true,
        correlation_id: correlationId
      });
    }
  }

  try {
    // Get existing columns from schema
    const existingColumns = await getVideosColumns();

    // Build insert payload - only use columns that exist in DB
    const insertPayload: Record<string, unknown> = {
      account_id: (account_id as string).trim(),
      variant_id: (variant_id as string).trim(),
      google_drive_url: google_drive_url_value.trim(),
      status: effectiveStatus,
    };

    // Add optional fields only if they exist in schema
    if (account_id !== undefined && existingColumns.has("account_id")) {
      insertPayload.account_id = account_id;
    }
    if (caption_used !== undefined && existingColumns.has("caption_used")) {
      insertPayload.caption_used = caption_used;
    }
    if (hashtags_used !== undefined && existingColumns.has("hashtags_used")) {
      insertPayload.hashtags_used = hashtags_used;
    }
    if (existingColumns.has("final_video_url")) {
      insertPayload.final_video_url = google_drive_url_value.trim();
    }

    const { data, error } = await supabaseAdmin
      .from("videos")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("POST /api/videos Supabase error:", error);
      console.error("POST /api/videos insert payload:", insertPayload);

      const err = apiError("DB_ERROR", error.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Write audit event for create
    if (data?.id) {
      await writeVideoEvent(
        data.id,
        "create",
        correlationId,
        "api",
        null,
        effectiveStatus,
        { variant_id, account_id }
      );
    }

    return NextResponse.json({ ok: true, data, correlation_id: correlationId });

  } catch (err) {
    console.error("POST /api/videos error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}

/*
PowerShell Test Plan:

# 1. Get existing variant_id from variants table
$variantResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/variants" -Method GET
$variantId = $variantResponse.data[0].id

# 2. Create video manually via POST /api/videos
$videoBody = "{`"variant_id`": `"$variantId`", `"final_video_url`": `"https://drive.google.com/file/d/test123`", `"caption_used`": `"Amazing supplement results! #health`", `"hashtags_used`": `"#supplement #health #viral`", `"status`": `"draft`"}"
$videoResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos" -Method POST -ContentType "application/json" -Body $videoBody
$videoResponse

# 3. Get videos with filters
$getVideosResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?variant_id=$variantId" -Method GET
$getVideosResponse

# 4. Get videos by status
$getDraftVideos = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?status=draft" -Method GET
$getDraftVideos
*/
