import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { NextResponse } from "next/server";
import { generateSlug, generateAccountSlug, formatDateForVideoCode } from "@/lib/createVideoFromProduct";

export const runtime = "nodejs";

// Cache for account codes to avoid repeated DB lookups
const accountCodeCache = new Map<string, string>();

/**
 * Get account_code from posting_accounts table by ID
 */
async function getAccountCodeById(postingAccountId: string): Promise<string | null> {
  if (accountCodeCache.has(postingAccountId)) {
    return accountCodeCache.get(postingAccountId) || null;
  }

  try {
    const { data } = await supabaseAdmin
      .from("posting_accounts")
      .select("account_code")
      .eq("id", postingAccountId)
      .single();

    if (data?.account_code) {
      accountCodeCache.set(postingAccountId, data.account_code);
      return data.account_code;
    }
  } catch {
    // Table might not exist yet
  }

  return null;
}

/**
 * Generate a unique video code with retry on conflict
 * New format: ACCOUNT-BRAND-SKU-MM-DD-YY-### (all hyphens, filesystem-safe)
 */
async function generateAndSetVideoCode(
  videoId: string,
  postingAccountId: string | null,
  accountNameFallback: string | null,
  brandName: string | null,
  productName: string | null,
  productSlug: string | null,
  createdAt: string
): Promise<{ success: boolean; videoCode: string | null; error?: string }> {
  // Get account code: try posting_accounts table first, then fallback to slug generation
  let accountCode: string;
  if (postingAccountId) {
    const code = await getAccountCodeById(postingAccountId);
    accountCode = code || generateAccountSlug(accountNameFallback);
  } else if (accountNameFallback) {
    accountCode = generateAccountSlug(accountNameFallback);
  } else {
    accountCode = "UNMAPD";
  }

  const brandSlug = brandName ? generateSlug(brandName, 6) : "UNMAPD";
  const skuSlug = productSlug
    ? productSlug.toUpperCase().slice(0, 6)
    : productName
      ? generateSlug(productName, 6)
      : "UNMAPD";

  const videoDate = new Date(createdAt);
  const dateCode = formatDateForVideoCode(videoDate); // Now returns MM-DD-YY
  const prefix = `${accountCode}-${brandSlug}-${skuSlug}-${dateCode}`;

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      // Query existing codes with this prefix to find next sequence
      const { data: existing } = await supabaseAdmin
        .from("videos")
        .select("video_code")
        .like("video_code", `${prefix}-%`)
        .order("video_code", { ascending: false })
        .limit(1);

      let sequence = 1;
      if (existing && existing.length > 0 && existing[0].video_code) {
        const lastCode = existing[0].video_code;
        const lastSeq = parseInt(lastCode.split("-").pop() || "0", 10);
        sequence = lastSeq + 1;
      }

      // Add attempt offset for retry
      sequence += attempt;
      const videoCode = `${prefix}-${String(sequence).padStart(3, "0")}`;

      // Try to update the video with this code
      const { error } = await supabaseAdmin
        .from("videos")
        .update({ video_code: videoCode })
        .eq("id", videoId)
        .is("video_code", null); // Only update if still null (prevent double-processing)

      if (!error) {
        return { success: true, videoCode };
      } else if (error.code === "23505") {
        // Unique constraint violation, retry with next sequence
        continue;
      } else {
        return { success: false, videoCode: null, error: error.message };
      }
    } catch (err) {
      return { success: false, videoCode: null, error: String(err) };
    }
  }

  return { success: false, videoCode: null, error: "Max retries exceeded" };
}

/**
 * Extract account name from video data (fallback for backwards compatibility)
 * Priority: posting_meta.target_account > null
 */
function extractAccountName(
  postingMeta: Record<string, unknown> | null
): string | null {
  if (postingMeta?.target_account && typeof postingMeta.target_account === "string") {
    return postingMeta.target_account;
  }
  return null;
}

/**
 * POST /api/admin/backfill-video-codes
 *
 * Backfills video_code for all videos where it's currently null.
 * New format: ACCOUNT-BRAND-SKU-MM/DD/YY-###
 * Admin-only. Use with caution in production.
 *
 * Query params:
 * - dry_run=true: Preview what would be updated without making changes
 * - limit=N: Process only N videos (default: 100, max: 1000)
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Not authenticated", 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }
  const { searchParams } = new URL(request.url);

  const dryRun = searchParams.get("dry_run") === "true";
  const limitParam = searchParams.get("limit");
  const limit = Math.min(parseInt(limitParam || "100", 10), 1000);

  console.log(`[${correlationId}] Starting video_code backfill (dry_run=${dryRun}, limit=${limit})`);

  try {
    // Fetch videos without video_code, join with products for data
    const { data: videos, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select(`
        id,
        created_at,
        product_id,
        posting_account_id,
        posting_meta,
        products:product_id (
          name,
          brand,
          slug
        )
      `)
      .is("video_code", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error(`[${correlationId}] Failed to fetch videos:`, fetchError);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch videos", 500, correlationId);
    }

    if (!videos || videos.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No videos need backfilling",
        processed: 0,
        correlation_id: correlationId,
      });
    }

    console.log(`[${correlationId}] Found ${videos.length} videos to backfill`);

    const results: { videoId: string; videoCode: string | null; success: boolean; error?: string }[] = [];

    for (const video of videos) {
      // Supabase returns single relation as object, but TS may infer array
      const productData = video.products as unknown;
      const product = productData as { name: string; brand: string; slug: string | null } | null;

      const postingMeta = video.posting_meta as Record<string, unknown> | null;
      const postingAccountId = (video as Record<string, unknown>).posting_account_id as string | null;
      // Fallback: get account name from posting_meta.target_account
      const accountNameFallback = extractAccountName(postingMeta);

      if (dryRun) {
        // In dry run, just show what would be generated
        let accountCode: string;
        if (postingAccountId) {
          const code = await getAccountCodeById(postingAccountId);
          accountCode = code || generateAccountSlug(accountNameFallback);
        } else {
          accountCode = accountNameFallback ? generateAccountSlug(accountNameFallback) : "UNMAPD";
        }

        const brandSlug = product?.brand ? generateSlug(product.brand, 6) : "UNMAPD";
        const skuSlug = product?.slug
          ? product.slug.toUpperCase().slice(0, 6)
          : product?.name
            ? generateSlug(product.name, 6)
            : "UNMAPD";
        const dateCode = formatDateForVideoCode(new Date(video.created_at));

        results.push({
          videoId: video.id,
          videoCode: `${accountCode}-${brandSlug}-${skuSlug}-${dateCode}-???`,
          success: true,
        });
      } else {
        // Actually generate and set the code
        const result = await generateAndSetVideoCode(
          video.id,
          postingAccountId,
          accountNameFallback,
          product?.brand || null,
          product?.name || null,
          product?.slug || null,
          video.created_at
        );

        results.push({
          videoId: video.id,
          videoCode: result.videoCode,
          success: result.success,
          error: result.error,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[${correlationId}] Backfill complete: ${successCount} success, ${failCount} failed`);

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      processed: results.length,
      success_count: successCount,
      fail_count: failCount,
      results: results.slice(0, 50), // Return first 50 for review
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] Backfill error:`, error);
    return createApiErrorResponse("INTERNAL", "Backfill failed", 500, correlationId);
  }
}

/**
 * GET /api/admin/backfill-video-codes
 *
 * Check how many videos need backfilling.
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Not authenticated", 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  try {
    const { count, error } = await supabaseAdmin
      .from("videos")
      .select("id", { count: "exact", head: true })
      .is("video_code", null);

    if (error) {
      return createApiErrorResponse("DB_ERROR", "Failed to count videos", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      videos_needing_backfill: count || 0,
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] Count error:`, error);
    return createApiErrorResponse("INTERNAL", "Count failed", 500, correlationId);
  }
}
