/**
 * TikTok Login Kit OAuth Client for FlashFlow
 * =============================================
 *
 * Separate from TikTok Content Posting (lib/tiktok-content.ts) and Shop (lib/tiktok-shop.ts).
 * Different app credentials, different scopes. Provides basic profile identity only.
 *
 * ## OAuth2 (no PKCE — web apps use state param for CSRF)
 * - Authorization: https://www.tiktok.com/v2/auth/authorize/
 * - Token endpoint: https://open.tiktokapis.com/v2/oauth/token/
 * - User info: https://open.tiktokapis.com/v2/user/info/
 * - Scope: user.info.basic
 *
 * ## Required Environment Variables
 * - TIKTOK_CLIENT_KEY       - Client Key from TikTok Developer Portal (Login Kit app)
 * - TIKTOK_CLIENT_SECRET    - Client Secret from TikTok Developer Portal
 * - TIKTOK_REDIRECT_URI     - OAuth redirect URI (e.g. https://flashflowai.com/api/tiktok/callback)
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://open.tiktokapis.com';
const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = `${BASE_URL}/v2/oauth/token/`;
const USER_INFO_URL = `${BASE_URL}/v2/user/info/`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TikTokLoginConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TikTokLoginTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  token_type: string;
}

export interface TikTokLoginUserInfo {
  open_id: string;
  union_id: string;
  avatar_url: string;
  display_name: string;
}

// ---------------------------------------------------------------------------
// TikTok Login Kit Client
// ---------------------------------------------------------------------------

export class TikTokLoginClient {
  private clientKey: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(config?: Partial<TikTokLoginConfig>) {
    this.clientKey = config?.clientKey || process.env.TIKTOK_CLIENT_KEY || '';
    this.clientSecret = config?.clientSecret || process.env.TIKTOK_CLIENT_SECRET || '';
    this.redirectUri = config?.redirectUri || process.env.TIKTOK_REDIRECT_URI || '';
  }

  isConfigured(): boolean {
    return Boolean(this.clientKey && this.clientSecret && this.redirectUri);
  }

  // -------------------------------------------------------------------------
  // OAuth2 (state-based CSRF, no PKCE)
  // -------------------------------------------------------------------------

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_key: this.clientKey,
      response_type: 'code',
      scope: 'user.info.basic',
      redirect_uri: this.redirectUri,
      state,
    });

    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<TikTokLoginTokenResponse> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      }).toString(),
    });

    const json = await res.json();

    if (json.error) {
      throw new Error(`Token exchange failed: ${json.error} — ${json.error_description || ''}`);
    }

    return json as TikTokLoginTokenResponse;
  }

  async refreshAccessToken(refreshToken: string): Promise<TikTokLoginTokenResponse> {
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

    return json as TikTokLoginTokenResponse;
  }

  async getUserInfo(accessToken: string): Promise<TikTokLoginUserInfo> {
    const params = new URLSearchParams({
      fields: 'open_id,union_id,avatar_url,display_name',
    });

    const res = await fetch(`${USER_INFO_URL}?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const json = await res.json();

    if (json.error?.code !== 'ok' && json.error) {
      const errMsg = json.error?.message || json.error?.code || JSON.stringify(json);
      throw new Error(`User info fetch failed: ${errMsg}`);
    }

    return json.data?.user as TikTokLoginUserInfo;
  }

  /**
   * Generate a random state string for CSRF protection.
   */
  static generateState(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _client: TikTokLoginClient | null = null;

export function getTikTokLoginClient(): TikTokLoginClient {
  if (!_client) {
    _client = new TikTokLoginClient();
  }
  return _client;
}
