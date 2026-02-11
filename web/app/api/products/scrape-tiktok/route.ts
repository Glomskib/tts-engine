import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

const TIKTOK_URL_PATTERNS = [
  /tiktok\.com\/shop\/pdp\//i,
  /shop\.tiktok\.com\/view\/product\//i,
  /tiktok\.com\/@.*\/product\//i,
  /tiktok\.com\/t\//i,  // short links
];

/**
 * Validate if a URL is a TikTok Shop product URL
 */
function isTikTokShopUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Must be tiktok.com or shop.tiktok.com
    if (!parsed.hostname.includes('tiktok.com')) {
      return false;
    }

    // Check if it matches any of our known patterns
    return TIKTOK_URL_PATTERNS.some(pattern => pattern.test(url));
  } catch {
    return false;
  }
}

interface ScrapeCreatorsResponse {
  success: boolean;
  sale_region?: string;
  product_info?: {
    product_id?: string;
    seller?: {
      name?: string;
      seller_location?: string;
      tiktok_url?: string;
    };
    product_base?: {
      title?: string;
      sold_count?: number;
      price?: {
        original_price?: string;
        real_price?: string;
        discount?: string;
        currency?: string;
      };
      images?: string[];
      description?: string;
    };
    sale_props?: Array<{
      prop_name?: string;
      prop_values?: Array<{ name?: string }>;
    }>;
    categories?: string[];
  };
  error?: string;
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

  // Remove currency symbols and extract number
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);

  return !isNaN(num) && num > 0 ? num : null;
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
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  try {
    // Auth check
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse(
        "UNAUTHORIZED",
        "Authentication required",
        401,
        correlationId
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
        correlationId
      );
    }

    // Validate URL
    if (!body.url || typeof body.url !== "string" || !body.url.trim()) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "url is required and must be a non-empty string",
        400,
        correlationId
      );
    }

    const url = body.url.trim();

    // Validate it's a TikTok Shop URL
    if (!isTikTokShopUrl(url)) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "URL must be a valid TikTok Shop product URL (e.g., tiktok.com/shop/pdp/..., shop.tiktok.com/view/product/..., or tiktok.com/t/...)",
        400,
        correlationId
      );
    }

    // Check for API key
    const apiKey = process.env.SCRAPECREATORS_API_KEY;
    if (!apiKey) {
      return createApiErrorResponse(
        "CONFIG_ERROR",
        "SCRAPECREATORS_API_KEY is not configured. Please add your ScrapeCreators API key to the environment variables.",
        500,
        correlationId
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
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      return createApiErrorResponse(
        "INTERNAL",
        `Failed to fetch from ScrapeCreators API: ${errorMessage}`,
        500,
        correlationId
      );
    }

    // Parse response
    let data: ScrapeCreatorsResponse;
    try {
      data = await scrapeResponse.json() as ScrapeCreatorsResponse;
    } catch {
      return createApiErrorResponse(
        "INTERNAL",
        "Failed to parse ScrapeCreators API response",
        500,
        correlationId
      );
    }

    // Check if scraping was successful
    if (!data.success || !data.product_info) {
      const errorMsg = data.error || data.message || "Product data not found";
      return createApiErrorResponse(
        "NOT_FOUND",
        `TikTok product scraping failed: ${errorMsg}. The URL may be invalid or the product may not be available.`,
        400,
        correlationId
      );
    }

    const productInfo = data.product_info;
    const productBase = productInfo.product_base || {};
    const seller = productInfo.seller || {};
    const price = productBase.price || {};

    // Extract and normalize product data
    const scrapedData: ScrapedProductData = {
      name: (productBase.title || "Unknown Product").substring(0, 255),
      brand: (seller.name || "TikTok Shop").substring(0, 100),
      category: productInfo.categories?.[0] || "General",
      description: productBase.description || null,
      price: parsePrice(price.real_price),
      original_price: parsePrice(price.original_price),
      discount: price.discount || null,
      sold_count: productBase.sold_count || null,
      seller_location: seller.seller_location || null,
      images: productBase.images || [],
      variants: (productInfo.sale_props || [])
        .map(prop => `${prop.prop_name || ''}: ${(prop.prop_values || []).map(v => v.name).join(', ')}`)
        .filter(v => v.length > 2),
      tiktok_product_id: productInfo.product_id || null,
    };

    // Return structured data for preview
    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: {
        product: scrapedData,
        raw_api_response: {
          success: data.success,
          sale_region: data.sale_region,
          // Include limited raw data for debugging
          product_id: productInfo.product_id,
          sold_count: productBase.sold_count,
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
      correlationId
    );
  }
}
