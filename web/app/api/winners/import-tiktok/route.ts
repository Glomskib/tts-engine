import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createWinner } from '@/lib/winners';
import { z } from 'zod';

export const runtime = 'nodejs';

const TIKTOK_URL_PATTERNS = [
  /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/,
  /^https?:\/\/vm\.tiktok\.com\/([\w-]+)/,
  /^https?:\/\/(www\.)?tiktok\.com\/t\/([\w-]+)/,
];

const ImportTikTokSchema = z.object({
  url: z.string().url(),
  brand_name: z.string().max(200).optional(),
  product_name: z.string().max(200).optional(),
  product_category: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
});

function isValidTikTokUrl(url: string): boolean {
  return TIKTOK_URL_PATTERNS.some(p => p.test(url));
}

interface OEmbedResponse {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
  html: string;
  provider_name: string;
}

/**
 * POST /api/winners/import-tiktok
 * Import a TikTok video as a winner entry.
 * Fetches metadata via oEmbed, optionally resolves brand/product, creates winner.
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = ImportTikTokSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  const { url, brand_name, product_name, product_category, notes } = parsed.data;

  if (!isValidTikTokUrl(url)) {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid TikTok URL format', 400, correlationId);
  }

  try {
    // 1. Fetch oEmbed metadata
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const oembedRes = await fetch(oembedUrl);

    if (!oembedRes.ok) {
      return createApiErrorResponse(
        'BAD_REQUEST',
        'Could not fetch TikTok video metadata. Check the URL is valid and public.',
        400,
        correlationId
      );
    }

    const oembed: OEmbedResponse = await oembedRes.json();

    // 2. Extract hook from title (first sentence or full title if short)
    const hook = extractHook(oembed.title);

    // 3. Resolve brand/product if provided
    let resolvedProductId: string | undefined;
    let resolvedBrandName = brand_name || oembed.author_name;
    let resolvedProductName = product_name;

    if (brand_name || product_name) {
      const productResult = await resolveOrCreateProduct(
        authContext.user.id,
        brand_name,
        product_name,
        product_category
      );
      if (productResult) {
        resolvedProductId = productResult.id;
        resolvedBrandName = productResult.brand || resolvedBrandName;
        resolvedProductName = productResult.name || resolvedProductName;
      }
    }

    // 4. Create winner entry
    const { winner, error: winnerError } = await createWinner(authContext.user.id, {
      source_type: 'external',
      hook,
      full_script: oembed.title,
      video_url: url,
      thumbnail_url: oembed.thumbnail_url,
      notes: notes || `Imported from TikTok (@${oembed.author_name})`,
      product_category: product_category || undefined,
    });

    if (winnerError) {
      return createApiErrorResponse('DB_ERROR', 'Failed to create winner entry', 500, correlationId);
    }

    // 5. Also save the hook
    await supabaseAdmin.from('saved_hooks').insert({
      user_id: authContext.user.id,
      hook_text: hook,
      source: 'tiktok_import',
      product_name: resolvedProductName || undefined,
      brand_name: resolvedBrandName || undefined,
      notes: `From @${oembed.author_name}: ${url}`,
    });

    const response = NextResponse.json({
      ok: true,
      data: {
        winner_id: winner?.id,
        winner,
        oembed: {
          title: oembed.title,
          author_name: oembed.author_name,
          author_url: oembed.author_url,
          thumbnail_url: oembed.thumbnail_url,
        },
        hook,
        brand: resolvedBrandName,
        product: resolvedProductName,
        product_id: resolvedProductId,
      },
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] TikTok import error:`, error);
    return createApiErrorResponse(
      'INTERNAL',
      error instanceof Error ? error.message : 'Failed to import TikTok video',
      500,
      correlationId
    );
  }
}

/**
 * Extract a hook from a TikTok title.
 * Takes the first sentence or first 100 chars, whichever is shorter.
 */
function extractHook(title: string): string {
  if (!title) return '';

  // Remove hashtags
  const cleaned = title.replace(/#\w+/g, '').trim();

  // Try to get first sentence
  const sentenceEnd = cleaned.search(/[.!?]\s/);
  if (sentenceEnd > 0 && sentenceEnd < 120) {
    return cleaned.substring(0, sentenceEnd + 1).trim();
  }

  // Use full cleaned title if short enough
  if (cleaned.length <= 120) return cleaned;

  // Truncate at word boundary
  const truncated = cleaned.substring(0, 120);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 80 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
}

/**
 * Look up an existing product by name/brand, or create a new one.
 */
async function resolveOrCreateProduct(
  userId: string,
  brandName?: string,
  productName?: string,
  category?: string
): Promise<{ id: string; name: string; brand: string } | null> {
  if (!productName && !brandName) return null;

  // Try to find existing product
  if (productName) {
    let query = supabaseAdmin
      .from('products')
      .select('id, name, brand')
      .ilike('name', productName);

    if (brandName) {
      query = query.ilike('brand', brandName);
    }

    const { data } = await query.limit(1).single();
    if (data) return data as { id: string; name: string; brand: string };
  }

  // Create new product if we have enough info
  if (productName) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .insert({
        name: productName,
        brand: brandName || 'Unknown',
        category: category || 'Other',
        created_by: userId,
      })
      .select('id, name, brand')
      .single();

    if (!error && data) {
      return data as { id: string; name: string; brand: string };
    }
  }

  return null;
}
