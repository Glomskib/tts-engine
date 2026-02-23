import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Discord not configured' }, { status: 500 });
  }

  // Generate CSRF state nonce
  const state = randomBytes(32).toString('hex');

  // Set state cookie for validation in callback
  const cookieStore = await cookies();
  cookieStore.set('discord_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/api/integrations/discord',
  });

  // Build Discord OAuth URL
  const redirectUri = new URL('/api/integrations/discord/callback', request.url).toString();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
  });

  return NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
}
