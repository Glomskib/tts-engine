import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

const MAX_URLS = 50;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Decode common HTML entities back to plain text.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/**
 * Extract a human-readable product name from a URL path.
 * Tries to parse the last meaningful path segment and convert hyphens/underscores to spaces.
 */
function extractNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);

    // Walk backwards to find the most descriptive segment (skip short IDs)
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      // Skip segments that look like pure numeric IDs or very short tokens
      if (/^\d+$/.test(seg) || seg.length < 4) continue;

      // Remove common URL suffixes like .html
      const cleaned = seg.replace(/\.(html?|php|aspx?)$/i, "");

      // Convert hyphens / underscores to spaces and title-case
      const words = cleaned
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      if (words.length >= 4) return words;
    }

    // Fallback: use hostname + first meaningful segment
    const host = parsed.hostname.replace(/^www\./, "");
    return segments.length > 0
      ? `Product from ${host}`
      : `Product from ${host}`;
  } catch {
    return "Unknown Product";
  }
}

/**
 * Extract the content of a meta tag from raw HTML.
 * Supports both <meta property="..." content="..."> and <meta name="..." content="..."> forms.
 */
function extractMetaContent(html: string, tag: string): string | null {
  // Try property="tag" first (Open Graph), then name="tag"
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${tag}["'][^>]+content=["']([^"']*?)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*?)["'][^>]+property=["']${tag}["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${tag}["'][^>]+content=["']([^"']*?)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*?)["'][^>]+name=["']${tag}["']`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return null;
}

/**
 * Extract price from HTML meta tags or structured data.
 */
function extractPrice(html: string): number | null {
  // Try og:price:amount or product:price:amount
  const priceStr =
    extractMetaContent(html, "og:price:amount") ||
    extractMetaContent(html, "product:price:amount") ||
    extractMetaContent(html, "price");

  if (priceStr) {
    const num = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
    if (!isNaN(num) && num > 0) return num;
  }

  // Try JSON-LD price
  const jsonLdMatch = html.match(
    /"price"\s*:\s*["']?(\d+\.?\d*)["']?/i
  );
  if (jsonLdMatch?.[1]) {
    const num = parseFloat(jsonLdMatch[1]);
    if (!isNaN(num) && num > 0) return num;
  }

  return null;
}

interface ScrapedData {
  title: string | null;
  description: string | null;
  image: string | null;
  price: number | null;
}

/**
 * Fetch a URL and extract product metadata from its HTML.
 */
async function scrapeProductUrl(url: string): Promise<ScrapedData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; FlashFlowBot/1.0; +https://flashflow.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return { title: null, description: null, image: null, price: null };
    }

    const html = await res.text();

    const title =
      extractMetaContent(html, "og:title") ||
      extractMetaContent(html, "twitter:title") ||
      (() => {
        const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return m?.[1] ? decodeHtmlEntities(m[1].trim()) : null;
      })();

    const description =
      extractMetaContent(html, "og:description") ||
      extractMetaContent(html, "description") ||
      extractMetaContent(html, "twitter:description");

    const image =
      extractMetaContent(html, "og:image") ||
      extractMetaContent(html, "twitter:image");

    const price = extractPrice(html);

    return { title, description, image, price };
  } catch {
    return { title: null, description: null, image: null, price: null };
  } finally {
    clearTimeout(timeout);
  }
}

interface ImportResult {
  url: string;
  status: "created" | "exists" | "error";
  product?: Record<string, unknown>;
  existing?: Record<string, unknown>;
  scraped?: ScrapedData;
  error?: string;
}

/**
 * POST /api/products/import-urls
 *
 * Import TikTok Shop products by scraping metadata from provided URLs.
 *
 * Body: { urls: string[], brand?: string, category?: string }
 *
 * Returns per-URL results with summary counts.
 */
export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

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
    let body: { urls: unknown; brand?: unknown; category?: unknown };
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

    // Validate urls
    if (!Array.isArray(body.urls) || body.urls.length === 0) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "urls must be a non-empty array of strings",
        400,
        correlationId
      );
    }

    if (body.urls.length > MAX_URLS) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        `Maximum ${MAX_URLS} URLs per batch`,
        400,
        correlationId
      );
    }

    const urls: string[] = body.urls.filter(
      (u): u is string => typeof u === "string" && u.trim().length > 0
    );

    if (urls.length === 0) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "No valid URL strings found in array",
        400,
        correlationId
      );
    }

    const defaultBrand =
      typeof body.brand === "string" && body.brand.trim()
        ? body.brand.trim()
        : "TikTok Shop";
    const defaultCategory =
      typeof body.category === "string" && body.category.trim()
        ? body.category.trim()
        : "General";

    const results: ImportResult[] = [];
    let created = 0;
    let existing = 0;
    let errors = 0;

    for (const rawUrl of urls) {
      const url = rawUrl.trim();

      // Basic URL validation
      try {
        new URL(url);
      } catch {
        results.push({ url, status: "error", error: "Invalid URL format" });
        errors++;
        continue;
      }

      try {
        // Scrape metadata from URL
        const scraped = await scrapeProductUrl(url);

        // Determine product name: scraped title > URL path fallback
        const productName = scraped.title
          ? scraped.title.substring(0, 255)
          : extractNameFromUrl(url);

        // Check for existing product by name (case-insensitive)
        const { data: existingProducts, error: lookupError } =
          await supabaseAdmin
            .from("products")
            .select("id, name, brand, category, primary_link")
            .eq("user_id", authContext.user!.id)
            .ilike("name", productName);

        if (lookupError) {
          results.push({
            url,
            status: "error",
            scraped,
            error: `Database lookup failed: ${lookupError.message}`,
          });
          errors++;
          continue;
        }

        if (existingProducts && existingProducts.length > 0) {
          results.push({
            url,
            status: "exists",
            existing: existingProducts[0] as Record<string, unknown>,
            scraped,
          });
          existing++;
          continue;
        }

        // Insert new product
        const insertPayload: Record<string, unknown> = {
          name: productName,
          brand: defaultBrand,
          category: defaultCategory,
          user_id: authContext.user!.id,
          primary_link: url,
          tiktok_showcase_url: url,
        };

        if (scraped.description) {
          insertPayload.description = scraped.description.substring(0, 2000);
        }

        if (scraped.price) {
          insertPayload.price = scraped.price;
        }

        const { data: newProduct, error: insertError } = await supabaseAdmin
          .from("products")
          .insert(insertPayload)
          .select()
          .single();

        if (insertError) {
          results.push({
            url,
            status: "error",
            scraped,
            error: `Insert failed: ${insertError.message}`,
          });
          errors++;
          continue;
        }

        results.push({
          url,
          status: "created",
          product: newProduct as Record<string, unknown>,
          scraped,
        });
        created++;
      } catch (err) {
        results.push({
          url,
          status: "error",
          error: `Unexpected error: ${(err as Error).message}`,
        });
        errors++;
      }
    }

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: {
        results,
        summary: {
          total: urls.length,
          created,
          existing,
          errors,
        },
      },
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (err) {
    return createApiErrorResponse(
      "INTERNAL",
      (err as Error).message,
      500,
      correlationId
    );
  }
}
