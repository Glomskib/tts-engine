import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getDiscordUserFromToken, syncDiscordRolesIfLinked } from '@/lib/discord/roles';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');
  const accountUrl = new URL('/client/account', request.url);

  // User denied the OAuth prompt
  if (errorParam === 'access_denied') {
    accountUrl.searchParams.set('discord', 'denied');
    return NextResponse.redirect(accountUrl);
  }

  // Validate state cookie
  const cookieStore = await cookies();
  const storedState = cookieStore.get('discord_oauth_state')?.value;

  // Clear state cookie regardless
  cookieStore.set('discord_oauth_state', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/api/integrations/discord',
  });

  if (!code || !state || state !== storedState) {
    accountUrl.searchParams.set('discord', 'invalid_state');
    return NextResponse.redirect(accountUrl);
  }

  // Verify user is authenticated
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    accountUrl.searchParams.set('discord', 'unauthorized');
    return NextResponse.redirect(accountUrl);
  }

  // Exchange code for token
  const clientId = process.env.DISCORD_CLIENT_ID!;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET!;
  const redirectUri = new URL('/api/integrations/discord/callback', request.url).toString();

  const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    console.error('[discord/callback] Token exchange failed:', tokenRes.status);
    accountUrl.searchParams.set('discord', 'token_error');
    return NextResponse.redirect(accountUrl);
  }

  const tokenData = await tokenRes.json();

  // Get Discord user info
  const discordUser = await getDiscordUserFromToken(tokenData.access_token);
  if (!discordUser) {
    accountUrl.searchParams.set('discord', 'user_error');
    return NextResponse.redirect(accountUrl);
  }

  // Check if this Discord account is already linked to another FlashFlow user
  const { data: existingLink } = await supabaseAdmin
    .from('ff_discord_links')
    .select('user_id')
    .eq('discord_user_id', discordUser.id)
    .single();

  if (existingLink && existingLink.user_id !== auth.user.id) {
    accountUrl.searchParams.set('discord', 'already_linked');
    return NextResponse.redirect(accountUrl);
  }

  // Upsert Discord link (no access token stored)
  const { error } = await supabaseAdmin.from('ff_discord_links').upsert(
    {
      user_id: auth.user.id,
      discord_user_id: discordUser.id,
      discord_username: discordUser.username,
      linked_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    console.error('[discord/callback] Failed to save link:', error);
    accountUrl.searchParams.set('discord', 'save_error');
    return NextResponse.redirect(accountUrl);
  }

  // Immediately sync roles (fire-and-forget)
  syncDiscordRolesIfLinked(auth.user.id).catch((err) =>
    console.error('[discord/callback] Role sync failed:', err)
  );

  accountUrl.searchParams.set('discord', 'connected');
  return NextResponse.redirect(accountUrl);
}
