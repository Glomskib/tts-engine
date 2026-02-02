/**
 * Auth Callback Route
 * Handles OAuth redirects from providers like Google.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('redirect') ?? '/admin/content-studio';
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Log for debugging
  console.log('Auth callback received:', { code: !!code, error, errorDescription });

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

    console.log('Exchange result:', {
      user: data?.user?.email,
      session: !!data?.session,
      error: exchangeError?.message
    });

    if (exchangeError) {
      console.error('Code exchange error:', exchangeError);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`
      );
    }

    if (data?.user) {
      // Try to ensure user has subscription and credits (non-fatal errors)
      try {
        // Use upsert to handle race conditions with the database trigger
        const { error: subError } = await supabase
          .from('user_subscriptions')
          .upsert({
            user_id: data.user.id,
            plan_id: 'free',
            subscription_type: 'saas',
            status: 'active',
          }, {
            onConflict: 'user_id'
          });

        if (subError) {
          console.error('Subscription upsert error (non-fatal):', subError);
        }

        // Also ensure credits exist
        const { error: creditError } = await supabase
          .from('user_credits')
          .upsert({
            user_id: data.user.id,
            credits_remaining: 5,
            free_credits_total: 5,
            free_credits_used: 0,
            credits_used_this_period: 0,
            lifetime_credits_used: 0,
            period_start: new Date().toISOString(),
            period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          }, {
            onConflict: 'user_id'
          });

        if (creditError) {
          console.error('Credit upsert error (non-fatal):', creditError);
        }
      } catch (e) {
        // Log but don't fail - user is authenticated
        console.error('Error initializing user data (non-fatal):', e);
      }

      // Successfully authenticated - redirect to destination
      console.log('Auth successful, redirecting to:', next);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // No code received
  console.error('Auth callback: No code received');
  return NextResponse.redirect(`${origin}/login?error=no_code`);
}
