import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { generateSlug, generateAccountSlug, formatDateForVideoCode } from "@/lib/createVideoFromProduct";

export const runtime = "nodejs";

/**
 * Generate a unique video code with retry on conflict
 * New format: ACCOUNT-BRAND-SKU-MM/DD/YY-###
 */
async function generateAndSetVideoCode(
  videoId: string,
  accountName: string | null,
  brandName: string | null,
  productName: string | null,
  productSlug: string | null,
  createdAt: string
): Promise<{ success: boolean; videoCode: string | null; error?: string }> {
  const accountSlug = generateAccountSlug(accountName);
  const brandSlug = brandName ? generateSlug(brandName, 6) : "UNMAPD";
  const skuSlug = productSlug
    ? productSlug.toUpperCase().slice(0, 6)
    : productName
      ? generateSlug(productName, 6)
      : "UNMAPD";

  const videoDate = new Date(createdAt);
  const dateCode = formatDateForVideoCode(videoDate);
  const prefix = `${accountSlug}-${brandSlug}-${skuSlug}-${dateCode}`;

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
 * Extract account name from video data
 * Priority: account.name > posting_meta.target_account > null
 */
function extractAccountName(
  account: { name: string } | null,
  postingMeta: Record<string, unknown> | null
): string | null {
  if (account?.name) {
    return account.name;
  }
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
  const { searchParams } = new URL(request.url);

  const dryRun = searchParams.get("dry_run") === "true";
  const limitParam = searchParams.get("limit");
  const limit = Math.min(parseInt(limitParam || "100", 10), 1000);

  console.log(`[${correlationId}] Starting video_code backfill (dry_run=${dryRun}, limit=${limit})`);

  try {
    // Fetch videos without video_code, join with products for data
    // Note: accounts table may not exist, so we get account info from posting_meta
    const { data: videos, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select(`
        id,
        created_at,
        product_id,
        account_id,
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
      return NextResponse.json(
        { ok: false, error: "Failed to fetch videos", correlation_id: correlationId },
        { status: 500 }
      );
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
      // Get account name from posting_meta.target_account (accounts table may not exist)
      const accountName = extractAccountName(null, postingMeta);

      if (dryRun) {
        // In dry run, just show what would be generated
        const accountSlug = generateAccountSlug(accountName);
        const brandSlug = product?.brand ? generateSlug(product.brand, 6) : "UNMAPD";
        const skuSlug = product?.slug
          ? product.slug.toUpperCase().slice(0, 6)
          : product?.name
            ? generateSlug(product.name, 6)
            : "UNMAPD";
        const dateCode = formatDateForVideoCode(new Date(video.created_at));

        results.push({
          videoId: video.id,
          videoCode: `${accountSlug}-${brandSlug}-${skuSlug}-${dateCode}-???`,
          success: true,
        });
      } else {
        // Actually generate and set the code
        const result = await generateAndSetVideoCode(
          video.id,
          accountName,
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
    return NextResponse.json(
      { ok: false, error: "Backfill failed", correlation_id: correlationId },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/backfill-video-codes
 *
 * Check how many videos need backfilling.
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  try {
    const { count, error } = await supabaseAdmin
      .from("videos")
      .select("id", { count: "exact", head: true })
      .is("video_code", null);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Failed to count videos", correlation_id: correlationId },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      videos_needing_backfill: count || 0,
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] Count error:`, error);
    return NextResponse.json(
      { ok: false, error: "Count failed", correlation_id: correlationId },
      { status: 500 }
    );
  }
}
