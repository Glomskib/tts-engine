/**
 * Auth Callback Route
 * Handles OAuth redirects from providers like Google.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const redirect = requestUrl.searchParams.get('redirect') || '/admin/content-studio';
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Auth callback error:', error);
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    // Get user to check their role/subscription
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Check if user has a subscription, if not create default
      const { data: existingSub } = await supabase
        .from('user_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!existingSub) {
        // Create default subscription for new users
        await supabase.from('user_subscriptions').insert({
          user_id: user.id,
          plan_id: 'free',
          subscription_type: 'saas',
          status: 'active',
        });

        // Create default credits
        await supabase.from('user_credits').insert({
          user_id: user.id,
          credits_remaining: 5, // Free plan credits
          credits_used_this_period: 0,
          period_start: new Date().toISOString(),
          period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
  }

  // Redirect to the intended destination
  return NextResponse.redirect(`${origin}${redirect}`);
}
