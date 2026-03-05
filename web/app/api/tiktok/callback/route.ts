import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

/** Read and trim an env var; throw if empty. */
function requireEnv(name: string): string {
  const raw = process.env[name];
  const value = raw?.trim() ?? '';
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

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
        new URL('/admin/settings/tiktok?partner_error=' + encodeURIComponent(error), request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/admin/settings/tiktok?partner_error=missing_params', request.url)
      );
    }

    // Verify state matches (CSRF protection)
    const storedState = request.headers.get('cookie')?.match(/tiktok_oauth_state=([^;]+)/)?.[1];
    if (!storedState || storedState !== state) {
      return NextResponse.redirect(
        new URL('/admin/settings/tiktok?partner_error=invalid_state', request.url)
      );
    }

    // Resolve client key: prefer PARTNER variant, fall back to standard
    const clientKey = (process.env.TIKTOK_PARTNER_CLIENT_KEY?.trim() || process.env.TIKTOK_CLIENT_KEY?.trim() || '');
    const clientSecret = (process.env.TIKTOK_PARTNER_CLIENT_SECRET?.trim() || process.env.TIKTOK_CLIENT_SECRET?.trim() || '');
    const redirectUri = requireEnv('TIKTOK_REDIRECT_URI');

    if (!clientKey || !clientSecret) {
      console.error('[tiktok/callback] Missing TikTok client credentials');
      return NextResponse.redirect(
        new URL('/admin/settings/tiktok?partner_error=missing_credentials', request.url)
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
        new URL('/admin/settings/tiktok?partner_error=token_exchange_failed', request.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, refresh_expires_in, open_id, scope } = tokenData;

    if (!access_token || !open_id) {
      return NextResponse.redirect(
        new URL('/admin/settings/tiktok?partner_error=invalid_token_response', request.url)
      );
    }

    // Store connection in database
    const { error: insertError } = await supabaseAdmin.from('tiktok_connections').upsert(
      {
        user_id: authContext.user.id,
        tiktok_open_id: open_id,
        access_token,
        refresh_token,
        expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
        refresh_token_expires_at: refresh_expires_in
          ? new Date(Date.now() + refresh_expires_in * 1000).toISOString()
          : null,
        scopes: scope || null,
        status: 'active',
        disconnected_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,tiktok_open_id' }
    );

    if (insertError) {
      console.error('[tiktok/callback] Database insert failed:', insertError);
      return NextResponse.redirect(
        new URL('/admin/settings/tiktok?partner_error=database_error', request.url)
      );
    }

    // Clear state cookie and redirect to settings
    const response = NextResponse.redirect(new URL('/admin/settings/tiktok?partner_connected=true', request.url));
    response.cookies.delete('tiktok_oauth_state');

    return response;
  } catch (error) {
    console.error('[tiktok/callback] Error:', error);
    return NextResponse.redirect(
      new URL('/admin/settings/tiktok?partner_error=unexpected_error', request.url)
    );
  }
}
