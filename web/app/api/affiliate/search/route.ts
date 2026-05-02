/**
 * /api/affiliate/search — search the TikTok Shop open-collaboration marketplace.
 *
 * Body:
 *   { keyword?: string, category?: string, commission_min?: number,
 *     accountId?: string  // tiktok_oauth_accounts.id with account_type='shop' or 'affiliate'
 *   }
 *
 * Returns 503 with `notice` when TIKTOK_AFFILIATE_API_KEY is unset (FF not yet
 * allowlisted for the affiliate API). Returns 401 if the caller isn't logged
 * in. Returns 200 with `{ collaborations, next_page_token }` on success.
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

interface SearchBody {
  keyword?: string;
  category?: string;
  commission_min?: number;
  accountId?: string;
  page_token?: string;
  page_size?: number;
}

export async function POST(req: NextRequest) {
  // Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Gate: affiliate API not yet enabled?
  if (!isAffiliateConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'affiliate_not_approved',
        notice:
          'FlashFlow is awaiting allowlist approval for the TikTok Shop Affiliate API. ' +
          'This feature will light up automatically once approved.',
      },
      { status: 503 },
    );
  }

  let body: SearchBody;
  try {
    body = (await req.json()) as SearchBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  // Resolve user's TT shop OAuth account → token + shop cipher
  const accountQuery = supabaseAdmin
    .from('tiktok_oauth_accounts')
    .select('id, user_id, account_type, encrypted_access_token, metadata, expires_at')
    .eq('user_id', user.id)
    .in('account_type', ['shop', 'affiliate'])
    .order('updated_at', { ascending: false })
    .limit(1);

  const { data: accounts, error: acctErr } = body.accountId
    ? await supabaseAdmin
        .from('tiktok_oauth_accounts')
        .select('id, user_id, account_type, encrypted_access_token, metadata, expires_at')
        .eq('id', body.accountId)
        .eq('user_id', user.id)
    : await accountQuery;

  if (acctErr) {
    return NextResponse.json({ ok: false, error: 'db error' }, { status: 500 });
  }
  const account = accounts?.[0];
  if (!account) {
    return NextResponse.json(
      { ok: false, error: 'no_tiktok_shop_account', notice: 'Connect a TikTok Shop account first.' },
      { status: 412 },
    );
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
  if (!shopCipher) {
    return NextResponse.json(
      { ok: false, error: 'missing shop_cipher on account metadata' },
      { status: 412 },
    );
  }

  // Call affiliate API
  try {
    const client = getTikTokAffiliateClient();
    const result = await client.searchOpenCollaborations(accessToken, shopCipher, {
      keyword: body.keyword,
      category_id: body.category,
      commission_rate_min: body.commission_min,
      page_size: body.page_size,
      page_token: body.page_token,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AffiliateNotApprovedError) {
      return NextResponse.json(
        { ok: false, error: 'affiliate_not_approved', notice: err.message },
        { status: 503 },
      );
    }
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[affiliate/search] error', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
