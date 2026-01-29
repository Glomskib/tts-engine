import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";

export const runtime = "nodejs";

// --- Validation Schemas ---

const TikTokUrlSchema = z.string().url().refine(
  (url) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes('tiktok.com') ||
             parsed.hostname.includes('vm.tiktok.com');
    } catch {
      return false;
    }
  },
  { message: "Must be a valid TikTok URL" }
);

const ImportUrlsSchema = z.object({
  urls: z.array(TikTokUrlSchema).min(1).max(50),
}).strict();

const VALID_STATUSES = ['pending', 'processing', 'analyzed', 'error'] as const;

// Extract video ID from TikTok URL
function extractTikTokVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Format: tiktok.com/@user/video/1234567890
    const match = parsed.pathname.match(/\/video\/(\d+)/);
    if (match) return match[1];

    // Short URL format: vm.tiktok.com/ABC123
    if (parsed.hostname.includes('vm.tiktok.com')) {
      const shortCode = parsed.pathname.replace('/', '');
      return shortCode || null;
    }

    return null;
  } catch {
    return null;
  }
}

// --- POST: Import TikTok URLs ---

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Parse and validate input
  let input: z.infer<typeof ImportUrlsSchema>;
  try {
    const body = await request.json();
    input = ImportUrlsSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  try {
    const results: Array<{ url: string; id?: string; error?: string }> = [];

    for (const url of input.urls) {
      const videoId = extractTikTokVideoId(url);

      // Check for duplicate
      if (videoId) {
        const { data: existing } = await supabaseAdmin
          .from("imported_videos")
          .select("id")
          .eq("platform_video_id", videoId)
          .single();

        if (existing) {
          results.push({ url, error: "Already imported", id: existing.id });
          continue;
        }
      }

      // Insert new record
      const { data, error } = await supabaseAdmin
        .from("imported_videos")
        .insert({
          video_url: url,
          platform: "tiktok",
          platform_video_id: videoId,
          status: "pending",
          imported_by: authContext.user.id,
        })
        .select("id")
        .single();

      if (error) {
        console.error(`[${correlationId}] Failed to import ${url}:`, error);
        results.push({ url, error: "Failed to import" });
      } else {
        results.push({ url, id: data.id });
      }
    }

    const imported = results.filter(r => r.id && !r.error).length;
    const duplicates = results.filter(r => r.error === "Already imported").length;
    const failed = results.filter(r => r.error && r.error !== "Already imported").length;

    const response = NextResponse.json({
      ok: true,
      data: {
        results,
        summary: { imported, duplicates, failed, total: input.urls.length },
      },
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Import error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to import videos",
      500,
      correlationId
    );
  }
}

// --- GET: List imported videos ---

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const productId = searchParams.get("product_id");
  const search = searchParams.get("search");
  const sortBy = searchParams.get("sort_by") || "created_at";
  const sortOrder = searchParams.get("sort_order") === "asc" ? true : false;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  try {
    let query = supabaseAdmin
      .from("imported_videos")
      .select(`
        id, video_url, platform, platform_video_id, title, transcript,
        views, likes, comments, shares, engagement_rate,
        creator_handle, hook_line, hook_style, content_format, comedy_style,
        product_id, product_mentioned, ai_analysis, status, error_message,
        is_winner, created_at, updated_at
      `, { count: "exact" })
      .order(sortBy as string, { ascending: sortOrder })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status && VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      query = query.eq("status", status);
    }

    if (productId) {
      query = query.eq("product_id", productId);
    }

    if (search && search.trim()) {
      query = query.or(`hook_line.ilike.%${search.trim()}%,transcript.ilike.%${search.trim()}%,creator_handle.ilike.%${search.trim()}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error(`[${correlationId}] Failed to fetch imports:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch imports", 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data: data || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Fetch imports error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to fetch imports",
      500,
      correlationId
    );
  }
}
