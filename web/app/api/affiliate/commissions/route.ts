/**
 * /api/affiliate/commissions — read commission stats over a time range.
 *
 * Query params: ?start=<unix-seconds>&end=<unix-seconds>&accountId=<uuid>
 *
 * Defaults to last 30 days if no range provided. Falls back to local cache
 * (`affiliate_commissions` rows) if the live API call fails — so the
 * dashboard always renders.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  getTikTokAffiliateClient,
  AffiliateNotApprovedError,
  isAffiliateConfigured,
} from '@/lib/tiktok-affiliate';
import { decrypt, looksEncrypted } from '@/lib/crypto/encrypt';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const accountId = url.searchParams.get('accountId') || undefined;
  const now = Math.floor(Date.now() / 1000);
  const start = Number(url.searchParams.get('start')) || now - 30 * 86400;
  const end = Number(url.searchParams.get('end')) || now;

  // Always try the cached rows so the dashboard renders even when API is down
  // or unconfigured.
  const { data: cachedRows } = await supabaseAdmin
    .from('affiliate_commissions')
    .select('*')
    .eq('user_id', user.id)
    .gte('posted_at', new Date(start * 1000).toISOString())
    .lte('posted_at', new Date(end * 1000).toISOString())
    .order('posted_at', { ascending: false });

  const fromCache = (cachedRows || []).reduce(
    (acc, r) => {
      acc.total_orders += 1;
      acc.total_gmv_cents += Number(r.gross_cents) || 0;
      acc.total_commission_cents += Number(r.commission_cents) || 0;
      return acc;
    },
    { total_orders: 0, total_gmv_cents: 0, total_commission_cents: 0 },
  );

  if (!isAffiliateConfigured()) {
    return NextResponse.json({
      ok: true,
      source: 'cache',
      notice: 'Affiliate API not yet enabled — showing cached commissions only.',
      stats: { range_start: start, range_end: end, currency: 'USD', ...fromCache },
      rows: cachedRows || [],
    });
  }

  // Account lookup (same shape as /search)
  const { data: accounts } = accountId
    ? await supabaseAdmin
        .from('tiktok_oauth_accounts')
        .select('id, user_id, encrypted_access_token, metadata')
        .eq('id', accountId)
        .eq('user_id', user.id)
    : await supabaseAdmin
        .from('tiktok_oauth_accounts')
        .select('id, user_id, encrypted_access_token, metadata')
        .eq('user_id', user.id)
        .in('account_type', ['shop', 'affiliate'])
        .order('updated_at', { ascending: false })
        .limit(1);

  const account = accounts?.[0];
  if (!account) {
    return NextResponse.json({
      ok: true, source: 'cache',
      notice: 'No connected TikTok Shop account — showing cached commissions only.',
      stats: { range_start: start, range_end: end, currency: 'USD', ...fromCache },
      rows: cachedRows || [],
    });
  }

  let accessToken: string;
  try {
    const raw = account.encrypted_access_token as string;
    accessToken = looksEncrypted(raw) ? decrypt(raw) : raw;
  } catch {
    return NextResponse.json({ ok: false, error: 'token decrypt failed' }, { status: 500 });
  }
  const meta = (account.metadata || {}) as Record<string, unknown>;
  const shopCipher = typeof meta.shop_cipher === 'string' ? meta.shop_cipher : '';

  try {
    const client = getTikTokAffiliateClient();
    const stats = await client.getCommissionStats(accessToken, shopCipher, start, end);
    return NextResponse.json({ ok: true, source: 'live', stats, rows: cachedRows || [] });
  } catch (err) {
    if (err instanceof AffiliateNotApprovedError) {
      return NextResponse.json({
        ok: true, source: 'cache', notice: err.message,
        stats: { range_start: start, range_end: end, currency: 'USD', ...fromCache },
        rows: cachedRows || [],
      });
    }
    // Fall back to cache on live-API failure.
    console.error('[affiliate/commissions] live failed, falling back to cache:', err);
    return NextResponse.json({
      ok: true, source: 'cache',
      notice: 'Live commission API unavailable — showing cached data.',
      stats: { range_start: start, range_end: end, currency: 'USD', ...fromCache },
      rows: cachedRows || [],
    });
  }
}
