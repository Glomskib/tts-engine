import { NextResponse } from "next/server";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";

export const runtime = "nodejs";

const TIKTOK_URL_PATTERNS = [
  /tiktok\.com\/shop\/pdp\//i,
  /shop\.tiktok\.com\/view\/product\//i,
  /tiktok\.com\/@.*\/product\//i,
  /tiktok\.com\/t\//i, // short links
];

/**
 * Validate if a URL is a TikTok Shop product URL
 */
function isTikTokShopUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (!parsed.hostname.includes("tiktok.com")) {
      return false;
    }

    return TIKTOK_URL_PATTERNS.some((pattern) => pattern.test(url));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// ScrapeCreators actual response types (top-level, NOT nested in product_info)
// ---------------------------------------------------------------------------

interface ScrapeCreatorsImageObj {
  height?: number;
  width?: number;
  uri?: string;
  url_list?: string[];
  thumb_url_list?: string[];
}

interface ScrapeCreatorsResponse {
  success: boolean;
  credits_remaining?: number;
  product_id?: string;
  seller?: {
    name?: string;
    seller_location?: string;
    seller_id?: string;
  };
  product_base?: {
    title?: string;
    sold_count?: number;
    category_name?: string;
    price?: {
      original_price?: string;
      real_price?: string;
      discount?: string;
      currency?: string;
    };
    images?: ScrapeCreatorsImageObj[];
    description?: string;
    desc_detailv3?: string;
  };
  sale_props?: Array<{
    prop_name?: string;
    prop_values?: Array<{ name?: string }>;
  }>;
  // Error responses
  error?: string;
  errorStatus?: number;
  message?: string;
}

interface ScrapedProductData {
  name: string;
  brand: string;
  category: string;
  description: string | null;
  price: number | null;
  original_price: number | null;
  discount: string | null;
  sold_count: number | null;
  seller_location: string | null;
  images: string[];
  variants: string[];
  tiktok_product_id: string | null;
}

/**
 * Parse price string to number
 * Handles formats like "$3.00", "3.00", "$2.64"
 */
function parsePrice(priceStr: string | undefined): number | null {
  if (!priceStr) return null;

  const cleaned = priceStr.replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);

  return !isNaN(num) && num > 0 ? num : null;
}

/**
 * Extract usable image URLs from the ScrapeCreators image objects.
 * Each image is an object with url_list / thumb_url_list arrays.
 */
function extractImageUrls(images: ScrapeCreatorsImageObj[] | undefined): string[] {
  if (!images || !Array.isArray(images)) return [];

  const urls: string[] = [];
  for (const img of images) {
    // Prefer full-size url_list, fall back to thumb_url_list
    const urlList = img.url_list || img.thumb_url_list;
    if (urlList && urlList.length > 0) {
      urls.push(urlList[0]);
    }
  }
  return urls;
}

/**
 * POST /api/products/scrape-tiktok
 *
 * Scrape TikTok Shop product data using ScrapeCreators API.
 *
 * Body: { url: string }
 *
 * Returns: Structured product data ready for preview/save
 */
export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  try {
    // Auth check — supports SESSION, API KEY (ff_ak_*), or SERVICE_API_KEY
    const auth = await validateApiAccess(request);
    if (!auth) {
      return createApiErrorResponse(
        "UNAUTHORIZED",
        "Authentication required",
        401,
        correlationId,
      );
    }

    // Parse body
    let body: { url: unknown };
    try {
      body = await request.json();
    } catch {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "Invalid JSON body",
        400,
        correlationId,
      );
    }

    // Validate URL
    if (!body.url || typeof body.url !== "string" || !body.url.trim()) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "url is required and must be a non-empty string",
        400,
        correlationId,
      );
    }

    const url = body.url.trim();

    // Validate it's a TikTok Shop URL
    if (!isTikTokShopUrl(url)) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "URL must be a valid TikTok Shop product URL (e.g., tiktok.com/shop/pdp/..., shop.tiktok.com/view/product/..., or tiktok.com/t/...)",
        400,
        correlationId,
      );
    }

    // Check for API key
    const apiKey = process.env.SCRAPECREATORS_API_KEY;
    if (!apiKey) {
      return createApiErrorResponse(
        "CONFIG_ERROR",
        "SCRAPECREATORS_API_KEY is not configured. Please add your ScrapeCreators API key to the environment variables.",
        500,
        correlationId,
      );
    }

    // Call ScrapeCreators API
    const scrapeUrl = `https://api.scrapecreators.com/v1/tiktok/product?url=${encodeURIComponent(url)}&get_related_videos=false&region=US`;

    let scrapeResponse: Response;
    try {
      scrapeResponse = await fetch(scrapeUrl, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
        },
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
      return createApiErrorResponse(
        "INTERNAL",
        `Failed to fetch from ScrapeCreators API: ${errorMessage}`,
        500,
        correlationId,
      );
    }

    // Parse response
    let data: ScrapeCreatorsResponse;
    try {
      data = (await scrapeResponse.json()) as ScrapeCreatorsResponse;
    } catch {
      return createApiErrorResponse(
        "INTERNAL",
        "Failed to parse ScrapeCreators API response",
        500,
        correlationId,
      );
    }

    // Check for API-level errors first (error/message fields appear on failures)
    if (data.error && data.error !== "not_found") {
      return createApiErrorResponse(
        "INTERNAL",
        `ScrapeCreators API error: ${data.message || data.error}`,
        500,
        correlationId,
      );
    }

    // Check if scraping was successful — product_base at top level, not nested
    if (!data.success || !data.product_base) {
      const errorMsg =
        data.message || data.error || "Product data not found";
      return createApiErrorResponse(
        "NOT_FOUND",
        `TikTok product scraping failed: ${errorMsg}. The URL may be invalid or the product may not be available in the US region.`,
        400,
        correlationId,
      );
    }

    // Data is at TOP LEVEL (not nested in product_info)
    const productBase = data.product_base;
    const seller = data.seller || {};
    const price = productBase.price || {};

    // Extract and normalize product data
    const scrapedData: ScrapedProductData = {
      name: (productBase.title || "Unknown Product").substring(0, 255),
      brand: (seller.name || "TikTok Shop").substring(0, 100),
      category: productBase.category_name || "General",
      description: productBase.description || null,
      price: parsePrice(price.real_price),
      original_price: parsePrice(price.original_price),
      discount: price.discount || null,
      sold_count: productBase.sold_count || null,
      seller_location: seller.seller_location || null,
      // Images are objects with url_list arrays, not plain strings
      images: extractImageUrls(productBase.images),
      variants: (data.sale_props || [])
        .map(
          (prop) =>
            `${prop.prop_name || ""}: ${(prop.prop_values || []).map((v) => v.name).join(", ")}`,
        )
        .filter((v) => v.length > 2),
      tiktok_product_id: data.product_id || null,
    };

    // Return structured data for preview
    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: {
        product: scrapedData,
        raw_api_response: {
          success: data.success,
          product_id: data.product_id,
          sold_count: productBase.sold_count,
          credits_remaining: data.credits_remaining,
        },
      },
    });

    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (err) {
    return createApiErrorResponse(
      "INTERNAL",
      `Unexpected error: ${(err as Error).message}`,
      500,
      correlationId,
    );
  }
}
