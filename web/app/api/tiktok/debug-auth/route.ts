import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';

function mask(value: string | undefined | null): {
  length: number;
  preview: string;
  hasWhitespace: boolean;
  lastSixCharCodes: number[];
} {
  if (!value) return { length: 0, preview: '(empty)', hasWhitespace: false, lastSixCharCodes: [] };
  return {
    length: value.length,
    preview: value.length > 6 ? value.slice(0, 2) + '***' + value.slice(-4) : '***',
    hasWhitespace: /\s/.test(value),
    lastSixCharCodes: [...value.slice(-6)].map(c => c.charCodeAt(0)),
  };
}

/**
 * GET /api/tiktok/debug-auth
 * Debug endpoint to inspect TikTok OAuth config. Admin only.
 * Returns masked env var values and the constructed auth URL.
 * Never returns raw secret values.
 */
export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!authContext.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const rawClientKey = process.env.TIKTOK_PARTNER_CLIENT_KEY;
  const rawClientSecret = process.env.TIKTOK_PARTNER_CLIENT_SECRET;
  const rawRedirectUri = process.env.TIKTOK_REDIRECT_URI;

  const clientKey = rawClientKey?.trim() ?? '';
  const redirectUri = rawRedirectUri?.trim() ?? '';

  // Build the same auth URL the auth route would build
  const scope = 'user.info.basic,video.list';
  const state = randomBytes(16).toString('hex');
  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authUrl.searchParams.set('client_key', clientKey);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  // Mask client_key in the URL for display
  const maskedUrl = authUrl.toString().replace(
    clientKey,
    clientKey.length > 6 ? clientKey.slice(0, 2) + '***' + clientKey.slice(-4) : '***'
  );

  const clientKeyInfo = mask(rawClientKey);
  const clientKeyTrimmedInfo = mask(clientKey);

  return NextResponse.json({
    env_vars_read: {
      client_key: 'TIKTOK_PARTNER_CLIENT_KEY',
      client_secret: 'TIKTOK_PARTNER_CLIENT_SECRET',
      redirect_uri: 'TIKTOK_REDIRECT_URI',
    },
    using_TIKTOK_PARTNER_CLIENT_KEY: true,
    using_NEXT_PUBLIC_variant: false,
    client_key_raw: {
      length: clientKeyInfo.length,
      preview: clientKeyInfo.preview,
      hasWhitespace: clientKeyInfo.hasWhitespace,
      lastSixCharCodes: clientKeyInfo.lastSixCharCodes,
      matchesAlphanumeric: /^[A-Za-z0-9_-]+$/.test(rawClientKey ?? ''),
    },
    client_key_trimmed: {
      length: clientKeyTrimmedInfo.length,
      preview: clientKeyTrimmedInfo.preview,
      hasWhitespace: clientKeyTrimmedInfo.hasWhitespace,
      lastSixCharCodes: clientKeyTrimmedInfo.lastSixCharCodes,
      matchesAlphanumeric: /^[A-Za-z0-9_-]+$/.test(clientKey),
      differs_from_raw: rawClientKey !== clientKey,
    },
    client_secret: {
      set: !!rawClientSecret,
      length: rawClientSecret?.length ?? 0,
      hasWhitespace: /\s/.test(rawClientSecret ?? ''),
    },
    redirect_uri: {
      length: rawRedirectUri?.length ?? 0,
      trimmed_length: redirectUri.length,
      differs_from_raw: rawRedirectUri !== redirectUri,
      hasWhitespace: /\s/.test(rawRedirectUri ?? ''),
      // Show redirect URI masked (domain visible, path visible) since it's needed for debugging
      // but don't leak full value in case it contains tokens
      preview: redirectUri ? new URL(redirectUri).origin + new URL(redirectUri).pathname : '(empty)',
    },
    auth_url_masked: maskedUrl,
    scope,
  });
}
