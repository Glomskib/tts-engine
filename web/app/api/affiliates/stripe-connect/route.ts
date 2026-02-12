import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe!;
}

/**
 * POST /api/affiliates/stripe-connect
 * Creates or retrieves a Stripe Connect Express account and returns the onboarding URL.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ ok: false, error: 'Stripe not configured' }, { status: 500 });
  }

  // Get affiliate account
  const { data: affiliate } = await supabaseAdmin
    .from('affiliate_accounts')
    .select('id, status, stripe_connect_id, stripe_connect_onboarded')
    .eq('user_id', user.id)
    .single();

  if (!affiliate || affiliate.status !== 'approved') {
    return NextResponse.json({ ok: false, error: 'Affiliate account not approved' }, { status: 403 });
  }

  // If already onboarded, return Stripe Express dashboard link
  if (affiliate.stripe_connect_onboarded && affiliate.stripe_connect_id) {
    try {
      const loginLink = await getStripe().accounts.createLoginLink(affiliate.stripe_connect_id);
      return NextResponse.json({ ok: true, url: loginLink.url, type: 'dashboard' });
    } catch {
      // Account may need re-onboarding
    }
  }

  try {
    let connectId = affiliate.stripe_connect_id;

    // Create Connect Express account if needed
    if (!connectId) {
      const account = await getStripe().accounts.create({
        type: 'express',
        email: user.email || undefined,
        metadata: {
          user_id: user.id,
          affiliate_id: affiliate.id,
        },
        capabilities: {
          transfers: { requested: true },
        },
      });
      connectId = account.id;

      // Save Connect account ID
      await supabaseAdmin
        .from('affiliate_accounts')
        .update({
          stripe_connect_id: connectId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', affiliate.id);
    }

    // Create onboarding link
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://flashflowai.com';
    const accountLink = await getStripe().accountLinks.create({
      account: connectId,
      refresh_url: `${origin}/admin/referrals?connect=refresh`,
      return_url: `${origin}/admin/referrals?connect=complete`,
      type: 'account_onboarding',
    });

    return NextResponse.json({ ok: true, url: accountLink.url, type: 'onboarding' });
  } catch (err) {
    console.error('Stripe Connect error:', err);
    return NextResponse.json({ ok: false, error: 'Failed to create Stripe Connect session' }, { status: 500 });
  }
}
