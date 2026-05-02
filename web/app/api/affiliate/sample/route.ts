/**
 * /api/affiliate/sample — request a free sample for an affiliate product.
 *
 * Body: { productId: string, accountId?: string, shippingAddressId?: string }
 *
 * On success, also writes/updates a row in `affiliate_collaborations` with
 * sample_status set to 'pending' (or whatever TT returns).
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

interface SampleBody {
  productId?: string;
  accountId?: string;
  shippingAddressId?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  if (!isAffiliateConfigured()) {
    return NextResponse.json(
      {
        ok: false, error: 'affiliate_not_approved',
        notice: 'TikTok Shop Affiliate API not enabled. Lights up automatically post-allowlist.',
      },
      { status: 503 },
    );
  }

  let body: SampleBody;
  try {
    body = (await req.json()) as SampleBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  if (!body.productId) {
    return NextResponse.json({ ok: false, error: 'productId required' }, { status: 400 });
  }

  // Resolve account
  const { data: accounts, error: acctErr } = body.accountId
    ? await supabaseAdmin
        .from('tiktok_oauth_accounts')
        .select('id, user_id, account_type, encrypted_access_token, metadata')
        .eq('id', body.accountId)
        .eq('user_id', user.id)
    : await supabaseAdmin
        .from('tiktok_oauth_accounts')
        .select('id, user_id, account_type, encrypted_access_token, metadata')
        .eq('user_id', user.id)
        .in('account_type', ['shop', 'affiliate'])
        .order('updated_at', { ascending: false })
        .limit(1);

  if (acctErr) {
    return NextResponse.json({ ok: false, error: 'db error' }, { status: 500 });
  }
  const account = accounts?.[0];
  if (!account) {
    return NextResponse.json(
      { ok: false, error: 'no_tiktok_shop_account' },
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
    return NextResponse.json({ ok: false, error: 'missing shop_cipher' }, { status: 412 });
  }

  try {
    const client = getTikTokAffiliateClient();
    const result = await client.requestSample(
      accessToken,
      shopCipher,
      body.productId,
      body.shippingAddressId,
    );

    // Upsert into affiliate_collaborations so the user sees this in the My
    // Collabs tab.
    const sampleStatusMap: Record<string, string> = {
      pending: 'pending', approved: 'approved', rejected: 'rejected',
      shipped: 'shipped', delivered: 'delivered',
    };
    const sampleStatus = sampleStatusMap[result.status] || 'pending';
    await supabaseAdmin
      .from('affiliate_collaborations')
      .upsert(
        {
          user_id: user.id,
          product_id: body.productId,
          status: 'requested',
          sample_status: sampleStatus,
          sample_request_id: result.request_id,
          sample_address_id: body.shippingAddressId ?? null,
          requested_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,product_id' },
      );

    return NextResponse.json({ ok: true, sample: result });
  } catch (err) {
    if (err instanceof AffiliateNotApprovedError) {
      return NextResponse.json(
        { ok: false, error: 'affiliate_not_approved', notice: err.message },
        { status: 503 },
      );
    }
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[affiliate/sample] error', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
