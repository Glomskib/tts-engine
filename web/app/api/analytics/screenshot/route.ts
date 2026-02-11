import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";

export const runtime = "nodejs";

const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const EXTRACTION_PROMPT = `Extract all data from this TikTok analytics screenshot. Return JSON with: views (number), likes (number), comments (number), shares (number), gender_breakdown (object with male% and female%), age_breakdown (object with keys like '18-24', '25-34', '35-44', '45-54', '55+' as percentages), locations (object with country: percentage), follower_vs_nonfollower_ratio (number, % non-followers). Only include fields that are visible in the screenshot. Return ONLY valid JSON.`;

/**
 * POST /api/analytics/screenshot
 *
 * Upload a TikTok analytics screenshot for AI-powered data extraction.
 * Accepts multipart/form-data with:
 *   - file: image file (required)
 *   - video_id: UUID (optional) -- auto-updates video tiktok stats
 *   - product_id: UUID (optional) -- merges demographics into product
 */
export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse(
        "UNAUTHORIZED",
        "Authentication required",
        401,
        correlationId
      );
    }

    // ── Parse multipart form data ────────────────────────────────────
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "Invalid form data. Send multipart/form-data with an image file.",
        400,
        correlationId
      );
    }

    const file = formData.get("file") as File | null;
    const videoId = formData.get("video_id") as string | null;
    const productId = formData.get("product_id") as string | null;

    if (!file || !(file instanceof File)) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "Missing required field: file (image upload)",
        400,
        correlationId
      );
    }

    // ── Validate file ────────────────────────────────────────────────
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        `Unsupported image type: ${file.type}. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
        400,
        correlationId
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: 10 MB.`,
        400,
        correlationId
      );
    }

    // ── Validate optional UUIDs ──────────────────────────────────────
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (videoId && !uuidRegex.test(videoId)) {
      return createApiErrorResponse(
        "INVALID_UUID",
        "Invalid video_id format",
        400,
        correlationId
      );
    }

    if (productId && !uuidRegex.test(productId)) {
      return createApiErrorResponse(
        "INVALID_UUID",
        "Invalid product_id format",
        400,
        correlationId
      );
    }

    // ── Convert image to base64 ──────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    const mediaType = file.type === "image/jpg" ? "image/jpeg" : file.type;

    // ── Call Anthropic Claude Vision API ──────────────────────────────
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return createApiErrorResponse(
        "CONFIG_ERROR",
        "ANTHROPIC_API_KEY is not configured",
        500,
        correlationId
      );
    }

    let extractedData: Record<string, unknown>;

    try {
      const anthropicResponse = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicApiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 2000,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: mediaType,
                      data: base64Data,
                    },
                  },
                  {
                    type: "text",
                    text: EXTRACTION_PROMPT,
                  },
                ],
              },
            ],
          }),
        }
      );

      if (!anthropicResponse.ok) {
        const errorBody = await anthropicResponse.text();
        console.error(
          `[${correlationId}] Anthropic API error (${anthropicResponse.status}):`,
          errorBody
        );
        return createApiErrorResponse(
          "AI_ERROR",
          `Vision API request failed (${anthropicResponse.status})`,
          502,
          correlationId
        );
      }

      const anthropicResult = await anthropicResponse.json();

      // Extract text content from Claude's response
      const textBlock = anthropicResult.content?.find(
        (block: { type: string }) => block.type === "text"
      );
      if (!textBlock?.text) {
        return createApiErrorResponse(
          "AI_PARSE",
          "No text content in vision API response",
          502,
          correlationId
        );
      }

      // Parse JSON from Claude's response -- strip markdown fences if present
      let jsonStr = textBlock.text.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr
          .replace(/^```(?:json)?\s*\n?/, "")
          .replace(/\n?```\s*$/, "");
      }

      try {
        extractedData = JSON.parse(jsonStr);
      } catch {
        console.error(
          `[${correlationId}] Failed to parse Claude JSON:`,
          jsonStr
        );
        return createApiErrorResponse(
          "AI_PARSE",
          "Could not parse JSON from vision response",
          502,
          correlationId,
          { raw_response: jsonStr.slice(0, 500) }
        );
      }
    } catch (fetchError) {
      console.error(
        `[${correlationId}] Anthropic API fetch error:`,
        fetchError
      );
      return createApiErrorResponse(
        "AI_ERROR",
        "Failed to reach vision API",
        502,
        correlationId
      );
    }

    // ── Extract numeric fields ───────────────────────────────────────
    const views = typeof extractedData.views === "number" ? extractedData.views : null;
    const likes = typeof extractedData.likes === "number" ? extractedData.likes : null;
    const comments = typeof extractedData.comments === "number" ? extractedData.comments : null;
    const shares = typeof extractedData.shares === "number" ? extractedData.shares : null;

    const genderBreakdown =
      extractedData.gender_breakdown && typeof extractedData.gender_breakdown === "object"
        ? extractedData.gender_breakdown
        : null;
    const ageBreakdown =
      extractedData.age_breakdown && typeof extractedData.age_breakdown === "object"
        ? extractedData.age_breakdown
        : null;
    const locations =
      extractedData.locations && typeof extractedData.locations === "object"
        ? extractedData.locations
        : null;
    const followerRatio =
      typeof extractedData.follower_vs_nonfollower_ratio === "number"
        ? extractedData.follower_vs_nonfollower_ratio
        : null;

    // ── Calculate engagement rate ────────────────────────────────────
    let engagementRate: number | null = null;
    if (views && views > 0) {
      const totalEngagement =
        (likes || 0) + (comments || 0) + (shares || 0);
      engagementRate =
        Math.round(((totalEngagement / views) * 100) * 100) / 100; // 2 decimal places
    }

    const winnerSuggestion = engagementRate !== null && engagementRate > 5;

    // ── Save to analytics_screenshots table ──────────────────────────
    const insertPayload = {
      user_id: authContext.user.id,
      video_id: videoId || null,
      product_id: productId || null,
      extracted_data: extractedData,
      views,
      likes,
      comments,
      shares,
      engagement_rate: engagementRate,
      gender_breakdown: genderBreakdown,
      age_breakdown: ageBreakdown,
      locations,
      follower_ratio: followerRatio,
      status: "processed" as const,
      file_name: file.name || null,
    };

    const { data: savedRecord, error: insertError } = await supabaseAdmin
      .from("analytics_screenshots")
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      console.error(
        `[${correlationId}] Failed to save screenshot record:`,
        insertError
      );
      return createApiErrorResponse(
        "DB_ERROR",
        "Failed to save screenshot analysis",
        500,
        correlationId
      );
    }

    // ── Auto-update video tiktok stats ───────────────────────────────
    if (videoId && (views !== null || likes !== null || comments !== null || shares !== null)) {
      const videoUpdate: Record<string, unknown> = {
        stats_updated_at: new Date().toISOString(),
        last_metric_at: new Date().toISOString(),
      };

      if (views !== null) {
        videoUpdate.tiktok_views = views;
        videoUpdate.views_total = views;
      }
      if (likes !== null) {
        videoUpdate.tiktok_likes = likes;
        videoUpdate.likes_total = likes;
      }
      if (comments !== null) {
        videoUpdate.tiktok_comments = comments;
        videoUpdate.comments_total = comments;
      }
      if (shares !== null) {
        videoUpdate.tiktok_shares = shares;
        videoUpdate.shares_total = shares;
      }

      const { error: videoError } = await supabaseAdmin
        .from("videos")
        .update(videoUpdate)
        .eq("id", videoId);

      if (videoError) {
        console.error(
          `[${correlationId}] Failed to update video stats for ${videoId}:`,
          videoError
        );
        // Non-fatal: we still return success since the screenshot was saved
      }
    }

    // ── Merge demographics into product ──────────────────────────────
    if (productId && (genderBreakdown || ageBreakdown || locations)) {
      try {
        // Fetch existing demographic_data
        const { data: product } = await supabaseAdmin
          .from("products")
          .select("demographic_data, primary_gender, primary_age_range, primary_location")
          .eq("id", productId)
          .single();

        const existing =
          (product?.demographic_data as Record<string, unknown>) || {};

        // Merge: average new data with existing where both present
        const merged: Record<string, unknown> = { ...existing };

        if (genderBreakdown) {
          if (existing.gender_breakdown && typeof existing.gender_breakdown === "object") {
            // Average the gender percentages
            const oldGender = existing.gender_breakdown as Record<string, number>;
            const newGender = genderBreakdown as Record<string, number>;
            const avgGender: Record<string, number> = {};
            const allGenderKeys = new Set([
              ...Object.keys(oldGender),
              ...Object.keys(newGender),
            ]);
            for (const key of allGenderKeys) {
              const oldVal = oldGender[key] ?? 0;
              const newVal = newGender[key] ?? 0;
              avgGender[key] =
                oldVal && newVal
                  ? Math.round(((oldVal + newVal) / 2) * 10) / 10
                  : newVal || oldVal;
            }
            merged.gender_breakdown = avgGender;
          } else {
            merged.gender_breakdown = genderBreakdown;
          }
        }

        if (ageBreakdown) {
          if (existing.age_breakdown && typeof existing.age_breakdown === "object") {
            const oldAge = existing.age_breakdown as Record<string, number>;
            const newAge = ageBreakdown as Record<string, number>;
            const avgAge: Record<string, number> = {};
            const allAgeKeys = new Set([
              ...Object.keys(oldAge),
              ...Object.keys(newAge),
            ]);
            for (const key of allAgeKeys) {
              const oldVal = oldAge[key] ?? 0;
              const newVal = newAge[key] ?? 0;
              avgAge[key] =
                oldVal && newVal
                  ? Math.round(((oldVal + newVal) / 2) * 10) / 10
                  : newVal || oldVal;
            }
            merged.age_breakdown = avgAge;
          } else {
            merged.age_breakdown = ageBreakdown;
          }
        }

        if (locations) {
          if (existing.locations && typeof existing.locations === "object") {
            const oldLoc = existing.locations as Record<string, number>;
            const newLoc = locations as Record<string, number>;
            const avgLoc: Record<string, number> = {};
            const allLocKeys = new Set([
              ...Object.keys(oldLoc),
              ...Object.keys(newLoc),
            ]);
            for (const key of allLocKeys) {
              const oldVal = oldLoc[key] ?? 0;
              const newVal = newLoc[key] ?? 0;
              avgLoc[key] =
                oldVal && newVal
                  ? Math.round(((oldVal + newVal) / 2) * 10) / 10
                  : newVal || oldVal;
            }
            merged.locations = avgLoc;
          } else {
            merged.locations = locations;
          }
        }

        merged.last_updated = new Date().toISOString();
        merged.screenshot_count =
          ((existing.screenshot_count as number) || 0) + 1;

        // Derive primary fields from the merged data
        const productUpdate: Record<string, unknown> = {
          demographic_data: merged,
        };

        if (merged.gender_breakdown && typeof merged.gender_breakdown === "object") {
          const gb = merged.gender_breakdown as Record<string, number>;
          const topGender = Object.entries(gb).sort(
            ([, a], [, b]) => b - a
          )[0];
          if (topGender) {
            productUpdate.primary_gender = topGender[0];
          }
        }

        if (merged.age_breakdown && typeof merged.age_breakdown === "object") {
          const ab = merged.age_breakdown as Record<string, number>;
          const topAge = Object.entries(ab).sort(
            ([, a], [, b]) => b - a
          )[0];
          if (topAge) {
            productUpdate.primary_age_range = topAge[0];
          }
        }

        if (merged.locations && typeof merged.locations === "object") {
          const loc = merged.locations as Record<string, number>;
          const topLoc = Object.entries(loc).sort(
            ([, a], [, b]) => b - a
          )[0];
          if (topLoc) {
            productUpdate.primary_location = topLoc[0];
          }
        }

        const { error: productError } = await supabaseAdmin
          .from("products")
          .update(productUpdate)
          .eq("id", productId);

        if (productError) {
          console.error(
            `[${correlationId}] Failed to update product demographics for ${productId}:`,
            productError
          );
          // Non-fatal
        }
      } catch (productMergeError) {
        console.error(
          `[${correlationId}] Product demographic merge error:`,
          productMergeError
        );
        // Non-fatal
      }
    }

    // ── Return response ──────────────────────────────────────────────
    const response = NextResponse.json(
      {
        ok: true,
        data: {
          record: savedRecord,
          extracted: extractedData,
          engagement_rate: engagementRate,
          winner_suggestion: winnerSuggestion,
          video_updated: videoId ? true : false,
          product_updated: productId ? true : false,
        },
        correlation_id: correlationId,
      },
      { status: 201 }
    );
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Unhandled error in screenshot upload:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      "Screenshot processing failed unexpectedly",
      500,
      correlationId
    );
  }
}
