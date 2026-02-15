import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('[tiktok/callback] OAuth error:', error);
      return NextResponse.redirect(
        new URL('/admin/settings?tiktok=error&message=' + encodeURIComponent(error), request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/admin/settings?tiktok=error&message=missing_params', request.url)
      );
    }

    // Verify state matches (CSRF protection)
    const storedState = request.headers.get('cookie')?.match(/tiktok_oauth_state=([^;]+)/)?.[1];
    if (!storedState || storedState !== state) {
      return NextResponse.redirect(
        new URL('/admin/settings?tiktok=error&message=invalid_state', request.url)
      );
    }

    const clientKey = process.env.TIKTOK_PARTNER_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_PARTNER_CLIENT_SECRET;
    const redirectUri = process.env.TIKTOK_REDIRECT_URI;

    if (!clientKey || !clientSecret || !redirectUri) {
      return createApiErrorResponse(
        'INTERNAL',
        'TikTok OAuth not configured',
        503,
        correlationId
      );
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[tiktok/callback] Token exchange failed:', errorData);
      return NextResponse.redirect(
        new URL('/admin/settings?tiktok=error&message=token_exchange_failed', request.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, open_id } = tokenData;

    if (!access_token || !open_id) {
      return NextResponse.redirect(
        new URL('/admin/settings?tiktok=error&message=invalid_token_response', request.url)
      );
    }

    // Store connection in database (assumes tiktok_connections table exists)
    const { error: insertError } = await supabaseAdmin.from('tiktok_connections').upsert(
      {
        user_id: authContext.user.id,
        tiktok_open_id: open_id,
        access_token,
        refresh_token,
        expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,tiktok_open_id' }
    );

    if (insertError) {
      console.error('[tiktok/callback] Database insert failed:', insertError);
      return NextResponse.redirect(
        new URL('/admin/settings?tiktok=error&message=database_error', request.url)
      );
    }

    // Clear state cookie and redirect to settings
    const response = NextResponse.redirect(new URL('/admin/settings?tiktok=connected', request.url));
    response.cookies.delete('tiktok_oauth_state');

    return response;
  } catch (error) {
    console.error('[tiktok/callback] Error:', error);
    return NextResponse.redirect(
      new URL('/admin/settings?tiktok=error&message=unexpected_error', request.url)
    );
  }
}
