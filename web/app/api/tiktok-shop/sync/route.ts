import { NextResponse } from 'next/server';
import { validateApiAccess } from '@/lib/auth/validateApiAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getTikTokShopClient } from '@/lib/tiktok-shop';
import type { TikTokProduct } from '@/lib/tiktok-shop';

/**
 * Helper: get a valid access token, refreshing if expired.
 */
async function getValidConnection(userId: string) {
  const { data: conn } = await supabaseAdmin
    .from('tiktok_shop_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (!conn) return null;

  const expiresAt = new Date(conn.token_expires_at);
  if (expiresAt < new Date()) {
    const client = getTikTokShopClient();
    try {
      const refreshed = await client.refreshAccessToken(conn.refresh_token);
      const newExpiry = new Date(
        Date.now() + refreshed.access_token_expire_in * 1000
      ).toISOString();

      await supabaseAdmin
        .from('tiktok_shop_connections')
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          token_expires_at: newExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      return { ...conn, access_token: refreshed.access_token };
    } catch (err) {
      await supabaseAdmin
        .from('tiktok_shop_connections')
        .update({
          status: 'expired',
          last_error: err instanceof Error ? err.message : 'Token refresh failed',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
      return null;
    }
  }

  return conn;
}

/**
 * POST /api/tiktok-shop/sync
 * Fetch all products from TikTok Shop and upsert into FlashFlow's products table.
 *
 * Returns: { ok, data: { synced, created, updated, skipped, errors } }
 */
export async function POST(request: Request) {
  const auth = await validateApiAccess(request);
  if (!auth) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const conn = await getValidConnection(auth.userId);
  if (!conn) {
    return NextResponse.json(
      { ok: false, error: 'TikTok Shop not connected or token expired' },
      { status: 400 }
    );
  }

  const client = getTikTokShopClient();
  const allProducts: TikTokProduct[] = [];

  // Paginate through all products
  let pageToken: string | undefined;
  let pages = 0;
  const maxPages = 20; // Safety limit: 20 pages x 50 = 1000 products max

  try {
    do {
      const result = await client.searchProducts(
        conn.access_token,
        conn.shop_cipher,
        { page_size: 50, page_token: pageToken }
      );

      allProducts.push(...(result.products || []));
      pageToken = result.next_page_token || undefined;
      pages++;
    } while (pageToken && pages < maxPages);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch products from TikTok Shop';
    await supabaseAdmin
      .from('tiktok_shop_connections')
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq('user_id', auth.userId);

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  // Get existing products with tiktok_product_id for this user
  const { data: existingProducts } = await supabaseAdmin
    .from('products')
    .select('id, tiktok_product_id')
    .eq('user_id', auth.userId)
    .not('tiktok_product_id', 'is', null);

  const existingByTikTokId = new Map(
    (existingProducts || []).map((p) => [p.tiktok_product_id, p.id])
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const tp of allProducts) {
    try {
      const firstSku = tp.skus?.[0];
      const imageUrl = tp.images?.[0]?.url || null;
      const priceRaw = firstSku?.price?.amount;
      // TikTok prices are in cents — convert to readable format for notes
      const priceDisplay = priceRaw
        ? `${firstSku?.price?.currency || 'USD'} ${(Number(priceRaw) / 100).toFixed(2)}`
        : null;

      const productData: Record<string, unknown> = {
        name: tp.title || `TikTok Product ${tp.id}`,
        brand: conn.shop_name || 'TikTok Shop',
        category: 'TikTok Shop',
        tiktok_product_id: tp.id,
        source: 'tiktok_shop',
        product_image_url: imageUrl,
        tiktok_showcase_url: `https://www.tiktok.com/view/product/${tp.id}`,
        notes: [
          `TikTok Shop Status: ${tp.status || 'unknown'}`,
          priceDisplay ? `Price: ${priceDisplay}` : null,
          firstSku?.inventory?.quantity !== undefined
            ? `Stock: ${firstSku.inventory.quantity}`
            : null,
        ].filter(Boolean).join(' | '),
        user_id: auth.userId,
        updated_at: new Date().toISOString(),
      };

      const existingId = existingByTikTokId.get(tp.id);

      if (existingId) {
        // Update existing product (don't overwrite user edits to name/brand/category)
        const { error: updateErr } = await supabaseAdmin
          .from('products')
          .update({
            product_image_url: productData.product_image_url,
            tiktok_showcase_url: productData.tiktok_showcase_url,
            notes: productData.notes,
            updated_at: productData.updated_at,
          })
          .eq('id', existingId);

        if (updateErr) {
          errors.push(`Update ${tp.id}: ${updateErr.message}`);
        } else {
          updated++;
        }
      } else {
        // Create new product
        const { error: insertErr } = await supabaseAdmin
          .from('products')
          .insert(productData);

        if (insertErr) {
          // Could be a constraint error (e.g. missing required field)
          errors.push(`Insert ${tp.id}: ${insertErr.message}`);
          skipped++;
        } else {
          created++;
        }
      }
    } catch (err) {
      errors.push(`${tp.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      skipped++;
    }
  }

  // Update last synced timestamp
  await supabaseAdmin
    .from('tiktok_shop_connections')
    .update({
      last_synced_at: new Date().toISOString(),
      last_error: errors.length > 0 ? `${errors.length} errors during sync` : null,
    })
    .eq('user_id', auth.userId);

  return NextResponse.json({
    ok: true,
    data: {
      total_fetched: allProducts.length,
      synced: created + updated,
      created,
      updated,
      skipped,
      errors: errors.slice(0, 10), // Limit error list
    },
  });
}
