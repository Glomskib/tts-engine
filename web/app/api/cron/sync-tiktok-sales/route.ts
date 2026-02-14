import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let totalOrders = 0;
  let totalAttributed = 0;
  const errors: string[] = [];

  try {
    // Get all active TikTok Shop connections
    const { data: connections } = await supabaseAdmin
      .from('tiktok_shop_connections')
      .select('id, user_id, access_token, refresh_token, token_expires_at, shop_id, shop_name, shop_cipher')
      .eq('status', 'active')
      .not('access_token', 'is', null);

    if (!connections || connections.length === 0) {
      return NextResponse.json({ ok: true, message: 'No shop connections' });
    }

    for (const conn of connections) {
      try {
        const { getTikTokShopClient } = await import('@/lib/tiktok-shop');
        const client = getTikTokShopClient();

        // Refresh token if expired
        let accessToken = conn.access_token;
        const expiresAt = new Date(conn.token_expires_at);
        if (expiresAt < new Date()) {
          try {
            const refreshed = await client.refreshAccessToken(conn.refresh_token);
            accessToken = refreshed.access_token;
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
              .eq('id', conn.id);
          } catch {
            errors.push(`${conn.shop_name}: Token refresh failed`);
            continue;
          }
        }

        // Search orders from the last 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
        let result;
        try {
          result = await client.searchOrders(accessToken, conn.shop_cipher, {
            create_time_ge: Math.floor(sevenDaysAgo.getTime() / 1000),
            create_time_lt: Math.floor(Date.now() / 1000),
            page_size: 50,
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          errors.push(`${conn.shop_name}: ${msg}`);
          continue;
        }

        const orders = result?.orders;
        if (!orders || !Array.isArray(orders)) continue;

        // Get user's brands and products for attribution
        const { data: brands } = await supabaseAdmin
          .from('brands')
          .select('id, name')
          .eq('user_id', conn.user_id);
        const { data: products } = await supabaseAdmin
          .from('products')
          .select('id, name, brand, tiktok_product_id')
          .eq('user_id', conn.user_id);

        for (const order of orders) {
          // Flatten line items — each line item becomes an order row
          const lineItems = order.line_items || [{ product_id: '', product_name: '', quantity: 1 }];

          for (const item of lineItems) {
            let brandId: string | null = null;
            let productId: string | null = null;
            const productName = (item.product_name || '').toLowerCase();

            // Try exact product match by TikTok product ID
            if (item.product_id && products) {
              const match = products.find((p: { tiktok_product_id?: string }) => p.tiktok_product_id === item.product_id);
              if (match) {
                productId = match.id;
                const brandMatch = brands?.find((b: { name: string }) =>
                  b.name.toLowerCase() === ((match as { brand?: string }).brand || '').toLowerCase()
                );
                if (brandMatch) brandId = brandMatch.id;
              }
            }

            // Fallback: fuzzy match by product name
            if (!productId && products) {
              for (const p of products) {
                if (productName.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(productName)) {
                  productId = p.id;
                  const brandMatch = brands?.find((b: { name: string }) =>
                    b.name.toLowerCase() === ((p as { brand?: string }).brand || '').toLowerCase()
                  );
                  if (brandMatch) brandId = brandMatch.id;
                  break;
                }
              }
            }

            // Fallback: match brand name from product name
            if (!brandId && brands) {
              for (const b of brands) {
                if (productName.includes(b.name.toLowerCase())) {
                  brandId = b.id;
                  break;
                }
              }
            }

            const orderAmount = order.payment?.total_amount
              ? parseFloat(order.payment.total_amount) / (lineItems.length || 1)
              : 0;

            const { error: upsertErr } = await supabaseAdmin
              .from('shop_orders')
              .upsert({
                user_id: conn.user_id,
                tiktok_order_id: `${order.id}-${item.product_id || '0'}`,
                order_status: order.status,
                product_name: item.product_name,
                product_id: item.product_id,
                sku_name: item.sku_id,
                quantity: item.quantity || 1,
                order_amount: orderAmount,
                commission_amount: 0,
                attributed_brand_id: brandId,
                attributed_product_id: productId,
                attribution_method: 'product_match',
                attribution_confidence: productId ? 0.9 : brandId ? 0.6 : 0.3,
                order_created_at: order.create_time
                  ? new Date(order.create_time * 1000).toISOString()
                  : new Date().toISOString(),
              }, { onConflict: 'user_id,tiktok_order_id' });

            if (!upsertErr) totalOrders++;
            if (brandId || productId) totalAttributed++;
          }
        }
      } catch (connErr: unknown) {
        const msg = connErr instanceof Error ? connErr.message : 'Unknown error';
        errors.push(`${conn.shop_name}: ${msg}`);
      }
    }

    return NextResponse.json({
      ok: true,
      orders_synced: totalOrders,
      attributed: totalAttributed,
      errors: errors.length ? errors : undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
