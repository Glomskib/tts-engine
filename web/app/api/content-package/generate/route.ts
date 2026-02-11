import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";
import { CONTENT_TYPES } from "@/lib/content-types";
import {
  expandBriefToScript, pickPersona, pickSalesApproach,
  type ScriptBrief,
} from "@/lib/script-expander";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Hook templates used when no winner patterns are available
// ---------------------------------------------------------------------------
const DEFAULT_HOOK_TEMPLATES = [
  "Wait until you see what {product} does...",
  "I can't believe nobody talks about {product}",
  "POV: You just discovered {product}",
  "Stop scrolling — {product} changed everything",
  "3 reasons you NEED {product} right now",
];

// All content type IDs from the canonical list
const CONTENT_TYPE_IDS: string[] = CONTENT_TYPES.map((ct) => ct.id);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick a random element from an array. */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Score based on coverage gap, winner hooks, content diversity, and quality jitter.
 *  Typical output range: 4-9 (see clamp at end). */
function scoreItem(
  videosForProduct: number,
  maxVideos: number,
  hasWinnerHook: boolean,
  rotationScore: number,
  contentTypeVariety: number
): number {
  // Base: inverse coverage (0-2 points)
  const coverageBase = maxVideos > 0
    ? (1 - videosForProduct / maxVideos) * 2
    : 1;

  // Rotation need from product (0-2 points, normalized from 0-100)
  const rotationFactor = Math.min(2, (rotationScore / 100) * 2);

  // Winner hook bonus (0 or 1.5)
  const hookBonus = hasWinnerHook ? 1.5 : 0;

  // Content diversity penalty: more items for same product → lower score
  const diversityPenalty = Math.min(1.5, contentTypeVariety * 0.5);

  // Quality jitter for natural variation (-0.7 to +0.7)
  const jitter = (Math.random() - 0.5) * 1.4;

  // Base of 5 + modifiers = typical range of 4-9
  const raw = 5 + coverageBase + rotationFactor + hookBonus - diversityPenalty + jitter;
  return Math.min(9, Math.max(4, Math.round(raw)));
}

/** Build a lightweight script body (metadata, not AI-generated prose). */
function buildScriptBody(
  product: { name: string; brand: string },
  contentType: string,
  hook: string
): string {
  const ct = CONTENT_TYPES.find((c) => c.id === contentType);
  const subtypes = ct?.subtypes ?? [];
  const subtype = subtypes.length > 0 ? pickRandom(subtypes) : null;

  const ctName = ct?.name ?? contentType;
  const lines = [
    `[Hook] ${hook}`,
    `[Content Type] ${ctName}${subtype ? ` — ${subtype.name}` : ""}`,
    `[Product] ${product.name} (${product.brand})`,
    `[Direction] Feature ${product.name} using a ${ctName.toLowerCase()} approach.`,
  ];

  if (subtype) {
    lines.push(`[Subtype Tip] ${subtype.description}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// POST /api/content-package/generate
// Generate a prioritised content package for the authenticated user.
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // 1. Auth -------------------------------------------------------------------
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  // 2. Parse body -------------------------------------------------------------
  let body: { count?: number } = {};
  try {
    body = (await request.json()) as { count?: number };
  } catch {
    // Empty body is fine — defaults apply
  }

  const targetCount = Math.min(Math.max(body.count ?? 20, 1), 100);

  // 3a. Get products sorted by content coverage (fewest videos first) ---------
  const { data: products, error: productsError } = await supabaseAdmin
    .from("products")
    .select("id, name, brand, category, rotation_score")
    .eq("user_id", authContext.user.id)
    .order("name", { ascending: true });

  if (productsError) {
    console.error(
      `[${correlationId}] content-package/generate products error:`,
      productsError
    );
    return createApiErrorResponse(
      "DB_ERROR",
      productsError.message,
      500,
      correlationId
    );
  }

  if (!products || products.length === 0) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "No products found. Add products before generating a content package.",
      400,
      correlationId
    );
  }

  // Count videos per product
  const { data: videoCounts, error: videoCountError } = await supabaseAdmin
    .from("videos")
    .select("product_id")
    .in(
      "product_id",
      products.map((p) => p.id)
    );

  if (videoCountError) {
    console.error(
      `[${correlationId}] content-package/generate video count error:`,
      videoCountError
    );
    return createApiErrorResponse(
      "DB_ERROR",
      videoCountError.message,
      500,
      correlationId
    );
  }

  const videoCountMap: Record<string, number> = {};
  for (const v of videoCounts ?? []) {
    videoCountMap[v.product_id] =
      (videoCountMap[v.product_id] || 0) + 1;
  }

  // Sort products by ascending video count (lowest coverage first)
  const sortedProducts = [...products].sort(
    (a, b) => (videoCountMap[a.id] || 0) - (videoCountMap[b.id] || 0)
  );

  const maxVideos = Math.max(
    ...products.map((p) => videoCountMap[p.id] || 0),
    1
  );

  // 3b. Get winning hook patterns ---------------------------------------------
  // Production DB uses TypeScript field names (hook, video_url, etc.)
  const { data: winners } = await supabaseAdmin
    .from("winners_bank")
    .select("hook, hook_type, content_format, performance_score")
    .eq("is_active", true)
    .order("performance_score", { ascending: false })
    .limit(50);

  const winnerHooks: string[] = [];
  const winnerHookTypes: string[] = [];
  if (winners && winners.length > 0) {
    for (const w of winners) {
      if (w.hook) winnerHooks.push(w.hook as string);
      if (w.hook_type) winnerHookTypes.push(w.hook_type as string);
    }
  }

  // 3c. Get unique brands -----------------------------------------------------
  const brandSet = new Set(products.map((p) => p.brand).filter(Boolean));

  // 4. Create package record --------------------------------------------------
  const { data: pkg, error: pkgError } = await supabaseAdmin
    .from("content_packages")
    .insert({
      user_id: authContext.user.id,
      generated_at: new Date().toISOString(),
      script_count: 0,
      scripts_kept: 0,
      status: "generating",
      config: {
        target_count: targetCount,
        brands: Array.from(brandSet),
        winner_hooks_available: winnerHooks.length,
      },
    })
    .select()
    .single();

  if (pkgError || !pkg) {
    console.error(
      `[${correlationId}] content-package/generate create package error:`,
      pkgError
    );
    return createApiErrorResponse(
      "DB_ERROR",
      pkgError?.message ?? "Failed to create package",
      500,
      correlationId
    );
  }

  // 5. Generate items ---------------------------------------------------------
  const items: Array<{
    package_id: string;
    product_id: string;
    product_name: string;
    brand: string;
    content_type: string;
    hook: string;
    script_body: string;
    score: number;
    kept: boolean;
    added_to_pipeline: boolean;
  }> = [];

  let productIndex = 0;
  let generated = 0;

  // Round-robin across sorted products (lowest coverage first)
  while (items.length < targetCount && generated < targetCount * 3) {
    const product = sortedProducts[productIndex % sortedProducts.length];
    productIndex++;
    generated++;

    const contentType = pickRandom(CONTENT_TYPE_IDS);

    // Choose hook: prefer winner hooks, fall back to templates
    let hook: string;
    let usedWinnerHook = false;
    if (winnerHooks.length > 0 && Math.random() < 0.6) {
      // 60% chance to use a proven winner hook pattern (adapted with product name)
      const winnerHook = pickRandom(winnerHooks);
      hook = winnerHook;
      usedWinnerHook = true;
    } else {
      const template = pickRandom(DEFAULT_HOOK_TEMPLATES);
      hook = template.replace("{product}", product.name);
    }

    const scriptBody = buildScriptBody(
      { name: product.name, brand: product.brand },
      contentType,
      hook
    );

    const videosForProduct = videoCountMap[product.id] || 0;
    const rotationScore = Number(product.rotation_score) || 50;
    // Count how many items already generated for this product (content diversity)
    const existingItemsForProduct = items.filter(i => i.product_id === product.id).length;
    const score = scoreItem(videosForProduct, maxVideos, usedWinnerHook, rotationScore, existingItemsForProduct);

    // Include all generated items (scores range 4-9)
    {
      items.push({
        package_id: pkg.id,
        product_id: product.id,
        product_name: product.name,
        brand: product.brand,
        content_type: contentType,
        hook,
        script_body: scriptBody,
        score,
        kept: true,
        added_to_pipeline: false,
      });
    }
  }

  // 6. Insert items -----------------------------------------------------------
  let insertedCount = 0;
  if (items.length > 0) {
    const { error: itemsError } = await supabaseAdmin
      .from("content_package_items")
      .insert(items);

    if (itemsError) {
      console.error(
        `[${correlationId}] content-package/generate insert items error:`,
        itemsError
      );
      // Mark package as failed but don't blow up — partial success is possible
      await supabaseAdmin
        .from("content_packages")
        .update({ status: "error" })
        .eq("id", pkg.id);

      return createApiErrorResponse(
        "DB_ERROR",
        itemsError.message,
        500,
        correlationId
      );
    }
    insertedCount = items.length;
  }

  // 6b. Expand top items into full AI-generated scripts -----------------------
  // Only expand the top 5 by score (one per product) to keep cost/latency down.
  // Failures here are non-blocking — items still exist with their briefs.
  if (insertedCount > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      // Fetch the inserted items with IDs
      const { data: insertedItems } = await supabaseAdmin
        .from("content_package_items")
        .select("id, product_id, product_name, brand, content_type, hook, score")
        .eq("package_id", pkg.id)
        .order("score", { ascending: false });

      if (insertedItems && insertedItems.length > 0) {
        // Pick top 5, one per product
        const seen = new Set<string>();
        const topItems: typeof insertedItems = [];
        for (const item of insertedItems) {
          if (!seen.has(item.product_name)) {
            seen.add(item.product_name);
            topItems.push(item);
            if (topItems.length >= 5) break;
          }
        }

        // Fetch product details for enriched prompts
        const productIds = [...new Set(topItems.map(i => i.product_id))];
        const { data: productDetails } = await supabaseAdmin
          .from("products")
          .select("id, name, brand, category, notes, pain_points")
          .in("id", productIds);
        const productMap = new Map(
          (productDetails || []).map(p => [p.id, p])
        );

        // Expand each top item with persona/approach rotation
        const usedPersonas: string[] = [];
        const usedApproaches: string[] = [];

        const expansionPromises = topItems.map(async (item) => {
          try {
            const persona = pickPersona(usedPersonas);
            const approach = pickSalesApproach(item.content_type, usedApproaches);
            usedPersonas.push(persona.id);
            usedApproaches.push(approach.id);

            const product = productMap.get(item.product_id);
            const ct = CONTENT_TYPES.find(c => c.id === item.content_type);

            const brief: ScriptBrief = {
              hook: item.hook,
              content_type: item.content_type,
              content_type_name: ct?.name || item.content_type,
              product_name: item.product_name,
              brand: item.brand,
              product_notes: product?.notes || null,
              product_category: product?.category || null,
              pain_points: Array.isArray(product?.pain_points)
                ? product.pain_points.map((pp: { point?: string }) =>
                    typeof pp === 'string' ? pp : pp.point || ''
                  ).filter(Boolean)
                : null,
            };

            const fullScript = await expandBriefToScript(brief, persona, approach);

            // Store the full script on the item
            await supabaseAdmin
              .from("content_package_items")
              .update({ full_script: fullScript })
              .eq("id", item.id);

          } catch (err) {
            console.error(
              `[${correlationId}] expand script failed for item ${item.id}:`,
              err
            );
            // Non-blocking — item keeps its brief
          }
        });

        await Promise.all(expansionPromises);
      }
    } catch (err) {
      console.error(
        `[${correlationId}] content-package/generate expansion error:`,
        err
      );
      // Non-blocking — package is still valid with briefs only
    }
  }

  // 7. Update package status to complete --------------------------------------
  const { error: updateError } = await supabaseAdmin
    .from("content_packages")
    .update({
      status: "complete",
      script_count: generated,
      scripts_kept: insertedCount,
    })
    .eq("id", pkg.id);

  if (updateError) {
    console.error(
      `[${correlationId}] content-package/generate update package error:`,
      updateError
    );
  }

  // 8. Return the full package with items -------------------------------------
  const { data: fullPackage, error: fetchError } = await supabaseAdmin
    .from("content_packages")
    .select("*, items:content_package_items(*)")
    .eq("id", pkg.id)
    .single();

  if (fetchError) {
    console.error(
      `[${correlationId}] content-package/generate fetch result error:`,
      fetchError
    );
    return createApiErrorResponse(
      "DB_ERROR",
      fetchError.message,
      500,
      correlationId
    );
  }

  return NextResponse.json({
    ok: true,
    data: fullPackage,
    correlation_id: correlationId,
  });
}

// ---------------------------------------------------------------------------
// GET /api/content-package/generate
// Return the latest content package for the authenticated user.
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  const { data, error } = await supabaseAdmin
    .from("content_packages")
    .select("*, items:content_package_items(*)")
    .eq("user_id", authContext.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // PGRST116 = no rows found — not a real error
    if (error.code === "PGRST116") {
      return NextResponse.json({
        ok: true,
        data: null,
        correlation_id: correlationId,
      });
    }

    console.error(
      `[${correlationId}] GET /api/content-package/generate error:`,
      error
    );
    return createApiErrorResponse(
      "DB_ERROR",
      error.message,
      500,
      correlationId
    );
  }

  return NextResponse.json({
    ok: true,
    data,
    correlation_id: correlationId,
  });
}
