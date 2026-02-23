/**
 * TikTok Partner API OAuth Client for FlashFlow
 * ===============================================
 *
 * Separate from TikTok Login Kit (lib/tiktok-login.ts) and Content Posting (lib/tiktok-content.ts).
 * Uses TIKTOK_PARTNER_CLIENT_KEY / TIKTOK_PARTNER_CLIENT_SECRET credentials.
 *
 * ## OAuth2 (state-based CSRF, no PKCE)
 * - Token endpoint: https://open.tiktokapis.com/v2/oauth/token/
 * - Scopes: user.info.basic, video.list
 *
 * ## Required Environment Variables
 * - TIKTOK_PARTNER_CLIENT_KEY    - Client Key from TikTok Developer Portal (Partner API app)
 * - TIKTOK_PARTNER_CLIENT_SECRET - Client Secret from TikTok Developer Portal
 * - TIKTOK_REDIRECT_URI          - OAuth redirect URI (e.g. https://flashflowai.com/api/tiktok/callback)
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TikTokPartnerConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TikTokPartnerTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  token_type: string;
}

// ---------------------------------------------------------------------------
// TikTok Partner API Client
// ---------------------------------------------------------------------------

export class TikTokPartnerClient {
  private clientKey: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(config?: Partial<TikTokPartnerConfig>) {
    this.clientKey = (config?.clientKey || process.env.TIKTOK_PARTNER_CLIENT_KEY || '').trim();
    this.clientSecret = (config?.clientSecret || process.env.TIKTOK_PARTNER_CLIENT_SECRET || '').trim();
    this.redirectUri = (config?.redirectUri || process.env.TIKTOK_REDIRECT_URI || '').trim();
  }

  isConfigured(): boolean {
    return Boolean(this.clientKey && this.clientSecret && this.redirectUri);
  }

  async refreshAccessToken(refreshToken: string): Promise<TikTokPartnerTokenResponse> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });

    const json = await res.json();

    if (json.error) {
      throw new Error(`Token refresh failed: ${json.error} — ${json.error_description || ''}`);
    }

    return json as TikTokPartnerTokenResponse;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _client: TikTokPartnerClient | null = null;

export function getTikTokPartnerClient(): TikTokPartnerClient {
  if (!_client) {
    _client = new TikTokPartnerClient();
  }
  return _client;
}

// ---------------------------------------------------------------------------
// DB Helper: Refresh a user's Partner API token
// ---------------------------------------------------------------------------

/**
 * Reads the active Partner API connection for a user, refreshes the token,
 * and upserts the new credentials back to the database.
 *
 * Can be called by a future cron job or explicit refresh endpoint.
 */
export async function refreshPartnerToken(userId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  // 1. Read the active connection
  const { data: connection, error: readError } = await supabaseAdmin
    .from('tiktok_connections')
    .select('id, tiktok_open_id, refresh_token')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (readError) {
    return { success: false, error: readError.message };
  }

  if (!connection) {
    return { success: false, error: 'No active Partner API connection found' };
  }

  // 2. Call TikTok refresh endpoint
  const client = getTikTokPartnerClient();
  let tokenData: TikTokPartnerTokenResponse;

  try {
    tokenData = await client.refreshAccessToken(connection.refresh_token);
  } catch (err) {
    // Mark connection as expired on refresh failure
    await supabaseAdmin
      .from('tiktok_connections')
      .update({
        status: 'expired',
        last_error: err instanceof Error ? err.message : 'Token refresh failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    return {
      success: false,
      error: err instanceof Error ? err.message : 'Token refresh failed',
    };
  }

  // 3. Upsert new tokens
  const { error: upsertError } = await supabaseAdmin
    .from('tiktok_connections')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      refresh_token_expires_at: tokenData.refresh_expires_in
        ? new Date(Date.now() + tokenData.refresh_expires_in * 1000).toISOString()
        : null,
      scopes: tokenData.scope || null,
      status: 'active',
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  if (upsertError) {
    return { success: false, error: upsertError.message };
  }

  return { success: true };
}
