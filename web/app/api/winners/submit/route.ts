import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface SubmitWinnerRequest {
  url: string;
  category?: string;
  notes?: string;
  transcript_text?: string;
  submitted_by?: string;
  // For file uploads, we'll handle storage_path separately
  asset_storage_path?: string;
  asset_type?: "mp4" | "audio";
  // oEmbed data (auto-fetched or passed from client)
  title?: string;
  creator_handle?: string;
  thumbnail_url?: string;
}

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
}

/**
 * Fetch oEmbed data from TikTok (limited but free)
 */
async function fetchOEmbedData(url: string): Promise<OEmbedResponse | null> {
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembedUrl, {
      headers: { "User-Agent": "TTS-Engine/1.0" },
    });

    if (!res.ok) {
      console.log(`[oEmbed] Failed for ${url}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return {
      title: data.title,
      author_name: data.author_name,
      author_url: data.author_url,
      thumbnail_url: data.thumbnail_url,
    };
  } catch (err) {
    console.log(`[oEmbed] Error for ${url}:`, err);
    return null;
  }
}

/**
 * POST /api/winners/submit
 *
 * Submit a new TikTok winner to the Winners Bank.
 *
 * Behavior:
 * - If transcript_text provided → save transcript asset, set status=processing, trigger extraction
 * - If mp4/audio uploaded → save asset, set status=needs_transcription
 * - If only URL → set status=needs_file
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON", correlation_id: correlationId },
      { status: 400 }
    );
  }

  const {
    url,
    category,
    notes,
    transcript_text,
    submitted_by,
    asset_storage_path,
    asset_type,
    title,
    creator_handle,
    thumbnail_url,
  } = body as SubmitWinnerRequest;

  // Validate URL
  if (!url || typeof url !== "string" || url.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "url is required", correlation_id: correlationId },
      { status: 400 }
    );
  }

  // Basic TikTok URL validation
  const cleanUrl = url.trim();
  if (!cleanUrl.includes("tiktok.com") && !cleanUrl.includes("vm.tiktok.com")) {
    return NextResponse.json(
      { ok: false, error: "URL must be a TikTok video URL", correlation_id: correlationId },
      { status: 400 }
    );
  }

  // Determine initial status based on what's provided
  let status: string;
  if (transcript_text && transcript_text.trim()) {
    status = "processing"; // Will extract immediately
  } else if (asset_storage_path) {
    status = "needs_transcription"; // Has file but needs transcript
  } else {
    status = "needs_file"; // Only URL, needs file or transcript
  }

  const submitter = submitted_by || "anonymous";

  try {
    // Check if URL already exists
    const { data: existing } = await supabaseAdmin
      .from("reference_videos")
      .select("id, status")
      .eq("url", cleanUrl)
      .single();

    if (existing) {
      return NextResponse.json(
        {
          ok: false,
          error: "This TikTok URL has already been submitted",
          existing_id: existing.id,
          existing_status: existing.status,
          correlation_id: correlationId
        },
        { status: 409 }
      );
    }

    // Fetch oEmbed data if not provided
    let oembedData: OEmbedResponse | null = null;
    if (!title && !creator_handle) {
      oembedData = await fetchOEmbedData(cleanUrl);
    }

    // Create reference_video record
    const { data: refVideo, error: insertError } = await supabaseAdmin
      .from("reference_videos")
      .insert({
        url: cleanUrl,
        submitted_by: submitter,
        notes: notes?.trim() || null,
        category: category?.trim() || null,
        status,
        title: title || oembedData?.title || null,
        creator_handle: creator_handle || oembedData?.author_name || null,
        thumbnail_url: thumbnail_url || oembedData?.thumbnail_url || null,
      })
      .select()
      .single();

    if (insertError) {
      // Handle unique constraint violation
      if (insertError.code === "23505") {
        return NextResponse.json(
          { ok: false, error: "This TikTok URL has already been submitted", correlation_id: correlationId },
          { status: 409 }
        );
      }
      console.error(`[${correlationId}] Failed to create reference_video:`, insertError);
      return NextResponse.json(
        { ok: false, error: "Failed to create submission", correlation_id: correlationId },
        { status: 500 }
      );
    }

    // Save transcript asset if provided
    if (transcript_text && transcript_text.trim()) {
      const { error: assetError } = await supabaseAdmin
        .from("reference_assets")
        .insert({
          reference_video_id: refVideo.id,
          asset_type: "transcript",
          transcript_text: transcript_text.trim(),
        });

      if (assetError) {
        console.error(`[${correlationId}] Failed to save transcript asset:`, assetError);
      }

      // Trigger extraction (async - don't wait)
      triggerExtraction(refVideo.id, transcript_text.trim(), correlationId).catch(err => {
        console.error(`[${correlationId}] Extraction failed:`, err);
      });
    }

    // Save uploaded file asset if provided
    if (asset_storage_path && asset_type) {
      const { error: assetError } = await supabaseAdmin
        .from("reference_assets")
        .insert({
          reference_video_id: refVideo.id,
          asset_type,
          storage_path: asset_storage_path,
        });

      if (assetError) {
        console.error(`[${correlationId}] Failed to save file asset:`, assetError);
      }
    }

    return NextResponse.json({
      ok: true,
      data: refVideo,
      next_action: status === "needs_file"
        ? "Upload MP4/audio or paste transcript to continue"
        : status === "needs_transcription"
        ? "Paste transcript to extract hooks"
        : "Processing extraction...",
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] Submit winner error:`, error);
    return NextResponse.json(
      { ok: false, error: "Internal error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}

/**
 * Trigger AI extraction for a reference video
 */
async function triggerExtraction(
  referenceVideoId: string,
  transcript: string,
  correlationId: string
): Promise<void> {
  try {
    // Call the extract endpoint internally
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/winners/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify({
        reference_video_id: referenceVideoId,
        transcript_text: transcript,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(`Extraction failed: ${errorData.error || res.statusText}`);
    }
  } catch (error) {
    // Update status to failed
    await supabaseAdmin
      .from("reference_videos")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Extraction failed"
      })
      .eq("id", referenceVideoId);
    throw error;
  }
}
