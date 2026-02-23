/**
 * Auth Callback Route
 * Handles OAuth redirects from providers like Google.
 * Also processes referral codes (?ref=) and promo codes (?promo=) from signup.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { recordReferralSignup, ensureReferralCode } from '@/lib/referrals';
import { recordAffiliateAttribution } from '@/lib/affiliate-tracking';
import { queueEmailSequence } from '@/lib/email/scheduler';
import { syncRoleFromPlan } from '@/lib/sync-role';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const explicitRedirect = searchParams.get('redirect');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const referralCode = searchParams.get('ref');
  const promoCode = searchParams.get('promo');

  // Log for debugging (server-side only)
  if (process.env.NODE_ENV === 'development') {
    console.error('[auth/callback] received:', { code: !!code, error, errorDescription });
  }

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, errorDescription);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (process.env.NODE_ENV === 'development') {
      console.error('[auth/callback] exchange result:', {
        user: data?.user?.email,
        session: !!data?.session,
        error: exchangeError?.message
      });
    }

    if (exchangeError) {
      console.error('Code exchange error:', exchangeError);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`
      );
    }

    if (data?.user) {
      // Try to ensure user has subscription and credits (non-fatal errors)
      try {
        // Check if user already has subscription and credits (returning user)
        const { data: existingSub } = await supabase
          .from('user_subscriptions')
          .select('user_id')
          .eq('user_id', data.user.id)
          .single();

        if (!existingSub) {
          // New user — create default subscription
          const { error: subError } = await supabase
            .from('user_subscriptions')
            .insert({
              user_id: data.user.id,
              plan_id: 'free',
              subscription_type: 'saas',
              status: 'active',
            });

          if (subError) {
            console.error('Subscription insert error (non-fatal):', subError);
          }
        }

        const { data: existingCredits } = await supabase
          .from('user_credits')
          .select('user_id')
          .eq('user_id', data.user.id)
          .single();

        if (!existingCredits) {
          // New user — create default credits
          const { error: creditError } = await supabase
            .from('user_credits')
            .insert({
              user_id: data.user.id,
              credits_remaining: 5,
              free_credits_total: 5,
              free_credits_used: 0,
              credits_used_this_period: 0,
              lifetime_credits_used: 0,
              period_start: new Date().toISOString(),
              period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            });

          if (creditError) {
            console.error('Credit insert error (non-fatal):', creditError);
          }

          // Only sync role for new users
          await syncRoleFromPlan(data.user.id, 'free');
        }
      } catch (e) {
        // Log but don't fail - user is authenticated
        console.error('Error initializing user data (non-fatal):', e);
      }

      // Auto-generate referral code for new user (non-fatal)
      try {
        const firstName = data.user.user_metadata?.full_name?.split(' ')[0]
          || data.user.email?.split('@')[0]
          || undefined;
        await ensureReferralCode(data.user.id, firstName);
      } catch (e) {
        console.error('Referral code generation error (non-fatal):', e);
      }

      // Process referral code if present (non-fatal)
      if (referralCode) {
        try {
          await recordReferralSignup(referralCode, data.user.id);
        } catch (e) {
          console.error('Referral signup recording error (non-fatal):', e);
        }
      }

      // Record affiliate attribution from cookie or URL param (non-fatal)
      try {
        const cookieHeader = request.headers.get('cookie') || '';
        const ffRefMatch = cookieHeader.match(/(?:^|;\s*)ff_ref=([^;]+)/);
        const cookieRef = ffRefMatch ? decodeURIComponent(ffRefMatch[1]) : null;
        const effectiveRef = referralCode || cookieRef;

        if (effectiveRef) {
          const method = referralCode && cookieRef ? 'both'
            : referralCode ? 'url_param'
            : 'cookie';
          await recordAffiliateAttribution(effectiveRef, data.user.id, method);
        }
      } catch (e) {
        console.error('Affiliate attribution recording error (non-fatal):', e);
      }

      // Process promo code if present (non-fatal)
      if (promoCode) {
        try {
          await fetch(`${origin}/api/promo-codes/redeem`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              cookie: request.headers.get('cookie') || '',
            },
            body: JSON.stringify({ code: promoCode }),
          });
        } catch (e) {
          console.error('Promo code redemption error (non-fatal):', e);
        }
      }

      // Queue onboarding email sequence for new users (non-fatal)
      try {
        const userName = data.user.user_metadata?.full_name
          || data.user.email?.split('@')[0]
          || 'there';
        await queueEmailSequence(data.user.email!, userName, 'onboarding');
      } catch (e) {
        console.error('Onboarding email queue error (non-fatal):', e);
      }

      // Successfully authenticated - redirect to destination
      // Clear ff_ref cookie after attribution is recorded
      if (explicitRedirect) {
        const redirectRes = NextResponse.redirect(`${origin}${explicitRedirect}`);
        redirectRes.cookies.set('ff_ref', '', { maxAge: 0, path: '/' });
        return redirectRes;
      }

      // Default redirect to dashboard
      const dashboardRes = NextResponse.redirect(`${origin}/admin/dashboard`);
      dashboardRes.cookies.set('ff_ref', '', { maxAge: 0, path: '/' });
      return dashboardRes;
    }
  }

  // No code received
  console.error('Auth callback: No code received');
  return NextResponse.redirect(`${origin}/login?error=no_code`);
}
