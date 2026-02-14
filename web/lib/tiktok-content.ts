/**
 * TikTok Content Posting API Client for FlashFlow
 * =================================================
 *
 * Completely separate from TikTok Shop API (lib/tiktok-shop.ts).
 * Different app, different OAuth, different base URL.
 *
 * ## Base URL
 * https://open.tiktokapis.com
 *
 * ## OAuth2 with PKCE
 * - Authorization: https://www.tiktok.com/v2/auth/authorize/
 * - Token endpoint: https://open.tiktokapis.com/v2/oauth/token/
 * - Uses code_verifier / code_challenge (S256)
 * - Scopes: user.info.basic, video.publish, video.upload
 *
 * ## Content Posting (v2)
 * - POST /v2/post/publish/inbox/video/init/   → PULL_FROM_URL upload
 * - POST /v2/post/publish/status/fetch/       → poll publish status
 * - POST /v2/post/publish/creator_info/query/  → allowed privacy levels
 *
 * ## Required Environment Variables
 * - TIKTOK_CONTENT_APP_KEY    - Client Key from TikTok Developer Portal
 * - TIKTOK_CONTENT_APP_SECRET - Client Secret from TikTok Developer Portal
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://open.tiktokapis.com';
const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = `${BASE_URL}/v2/oauth/token/`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TikTokContentConfig {
  clientKey: string;
  clientSecret: string;
}

export interface TikTokContentTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  token_type: string;
}

export interface PublishResult {
  publish_id: string;
}

export interface PublishStatusResult {
  status: 'PROCESSING_UPLOAD' | 'PROCESSING_DOWNLOAD' | 'SEND_TO_USER_INBOX' | 'PUBLISH_COMPLETE' | 'FAILED';
  fail_reason?: string;
  publicaly_available_post_id?: string[];
  uploaded_bytes?: number;
}

export interface CreatorInfo {
  creator_avatar_url: string;
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

export interface TikTokVideoItem {
  id: string;
  title: string;
  video_description: string;
  create_time: number;
  cover_image_url: string;
  share_url: string;
  duration: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  view_count: number;
}

// ---------------------------------------------------------------------------
// PKCE Helpers
// ---------------------------------------------------------------------------

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ---------------------------------------------------------------------------
// TikTok Content Client
// ---------------------------------------------------------------------------

export class TikTokContentClient {
  private clientKey: string;
  private clientSecret: string;

  constructor(config?: TikTokContentConfig) {
    this.clientKey = config?.clientKey || process.env.TIKTOK_CONTENT_APP_KEY || '';
    this.clientSecret = config?.clientSecret || process.env.TIKTOK_CONTENT_APP_SECRET || '';
  }

  isConfigured(): boolean {
    return Boolean(this.clientKey && this.clientSecret);
  }

  // -------------------------------------------------------------------------
  // OAuth2 with PKCE
  // -------------------------------------------------------------------------

  getAuthorizationUrl(
    redirectUri: string,
    codeChallenge: string,
    state?: string,
  ): string {
    const params = new URLSearchParams({
      client_key: this.clientKey,
      response_type: 'code',
      scope: 'user.info.basic,video.publish,video.upload,video.list',
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      ...(state ? { state } : {}),
    });

    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<TikTokContentTokenResponse> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
    });

    const json = await res.json();

    if (json.error) {
      throw new Error(`Token exchange failed: ${json.error} — ${json.error_description || ''}`);
    }

    return json as TikTokContentTokenResponse;
  }

  async refreshToken(refreshToken: string): Promise<TikTokContentTokenResponse> {
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

    return json as TikTokContentTokenResponse;
  }

  // -------------------------------------------------------------------------
  // Content Posting API
  // -------------------------------------------------------------------------

  /**
   * Publish a video using PULL_FROM_URL (TikTok downloads the video).
   * Posts to the creator's inbox for review before publishing.
   */
  async publishVideoFromUrl(
    accessToken: string,
    options: {
      video_url: string;
      title?: string;
      privacy_level?: string;
      disable_comment?: boolean;
      disable_duet?: boolean;
      disable_stitch?: boolean;
    },
  ): Promise<PublishResult> {
    const body = {
      post_info: {
        title: options.title || '',
        privacy_level: options.privacy_level || 'SELF_ONLY',
        disable_comment: options.disable_comment ?? false,
        disable_duet: options.disable_duet ?? false,
        disable_stitch: options.disable_stitch ?? false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: options.video_url,
      },
    };

    const res = await fetch(`${BASE_URL}/v2/post/publish/video/init/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();

    if (json.error?.code !== 'ok') {
      const errMsg = json.error?.message || json.error?.code || JSON.stringify(json);
      throw new Error(`Publish failed: ${errMsg}`);
    }

    return json.data as PublishResult;
  }

  /**
   * Check the status of a publish operation.
   */
  async getPublishStatus(
    accessToken: string,
    publishId: string,
  ): Promise<PublishStatusResult> {
    const res = await fetch(`${BASE_URL}/v2/post/publish/status/fetch/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });

    const json = await res.json();

    if (json.error?.code !== 'ok') {
      const errMsg = json.error?.message || json.error?.code || JSON.stringify(json);
      throw new Error(`Status check failed: ${errMsg}`);
    }

    return json.data as PublishStatusResult;
  }

  /**
   * Query creator info — returns allowed privacy levels and settings.
   */
  async queryCreatorInfo(accessToken: string): Promise<CreatorInfo> {
    const res = await fetch(`${BASE_URL}/v2/post/publish/creator_info/query/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({}),
    });

    const json = await res.json();

    if (json.error?.code !== 'ok') {
      const errMsg = json.error?.message || json.error?.code || JSON.stringify(json);
      throw new Error(`Creator info query failed: ${errMsg}`);
    }

    return json.data as CreatorInfo;
  }

  // -------------------------------------------------------------------------
  // Video List API
  // -------------------------------------------------------------------------

  /**
   * List videos from a creator's TikTok account.
   * Requires video.list scope.
   * Returns up to 20 videos per call with cursor pagination.
   */
  async listUserVideos(
    accessToken: string,
    cursor?: number,
    maxCount: number = 20
  ): Promise<{ videos: TikTokVideoItem[]; cursor: number; has_more: boolean }> {
    const fields = [
      'id', 'title', 'video_description', 'create_time',
      'cover_image_url', 'share_url', 'duration',
      'like_count', 'comment_count', 'share_count', 'view_count',
    ];

    const res = await fetch(`${BASE_URL}/v2/video/list/?fields=${fields.join(',')}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        max_count: Math.min(maxCount, 20),
        ...(cursor ? { cursor } : {}),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[tiktok-content] listUserVideos error:', res.status, errText);
      throw new Error(`TikTok API error: ${res.status}`);
    }

    const data = await res.json();
    const videoData = data.data || {};

    return {
      videos: (videoData.videos || []) as TikTokVideoItem[],
      cursor: videoData.cursor || 0,
      has_more: videoData.has_more || false,
    };
  }

  /**
   * Fetch ALL videos from a creator's account by paginating through listUserVideos.
   * Use for initial sync. For incremental syncs, compare create_time.
   */
  async fetchAllUserVideos(
    accessToken: string,
    maxVideos: number = 1000
  ): Promise<TikTokVideoItem[]> {
    const allVideos: TikTokVideoItem[] = [];
    let cursor: number | undefined;
    let hasMore = true;

    while (hasMore && allVideos.length < maxVideos) {
      const result = await this.listUserVideos(accessToken, cursor, 20);
      allVideos.push(...result.videos);
      cursor = result.cursor;
      hasMore = result.has_more;

      // Rate limit safety: small delay between pages
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return allVideos;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _client: TikTokContentClient | null = null;

export function getTikTokContentClient(): TikTokContentClient {
  if (!_client) {
    _client = new TikTokContentClient();
  }
  return _client;
}
