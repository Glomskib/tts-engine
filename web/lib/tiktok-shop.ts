/**
 * TikTok Shop Open API Client for FlashFlow
 * ==========================================
 *
 * ## API Overview
 * TikTok Shop Open API allows sellers and developers to manage products,
 * orders, fulfillment, and affiliate collaborations programmatically.
 *
 * ## Authentication
 * - OAuth2 three-legged flow for seller authorization
 * - Authorization URL: https://services.tiktokshop.com/open/authorize
 * - Token endpoint:   https://auth.tiktok-shops.com/api/v2/token/get
 * - Access tokens expire in ~24 hours; refresh tokens last much longer
 * - Refresh does NOT require user re-authorization
 *
 * ## Request Signing (HMAC-SHA256)
 * Every API request must include a `sign` query parameter:
 * 1. Collect all query params EXCEPT `sign` and `access_token`
 * 2. Sort params alphabetically by key
 * 3. Concatenate as `key1value1key2value2...`
 * 4. Prepend the API path: `/product/202309/products/search`
 * 5. Wrap with app_secret: `{app_secret}{path}{sorted_params}{app_secret}`
 * 6. HMAC-SHA256 with app_secret as key, hex-encode result
 *
 * ## Base URL
 * https://open-api.tiktokglobalshop.com
 *
 * ## API Version
 * Current: 202309 (used in URL path, e.g. /product/202309/products/search)
 *
 * ## Key Endpoints (v202309)
 * - Authorization:  GET  /authorization/202309/shops
 * - Products:       POST /product/202309/products/search
 *                   GET  /product/202309/products/{product_id}
 *                   POST /product/202309/products
 *                   PUT  /product/202309/products/{product_id}
 *                   DELETE /product/202309/products
 * - Orders:         POST /order/202309/orders/search
 *                   GET  /order/202309/orders/{order_id}
 * - Fulfillment:    POST /fulfillment/202309/orders/{order_id}/packages
 * - Finance:        POST /finance/202309/settlements/search
 * - Affiliate:      POST /affiliate/202309/open_collaborations/search
 *
 * ## Rate Limits
 * - Default: 10 requests/second per app per shop
 * - Burst: up to 20 requests/second briefly
 * - Products search: 5 requests/second
 * - Order operations: 10 requests/second
 * - Exceeding limits returns HTTP 429
 *
 * ## Required Environment Variables
 * - TIKTOK_SHOP_APP_KEY     - App key from TikTok Shop Partner Center
 * - TIKTOK_SHOP_APP_SECRET  - App secret from TikTok Shop Partner Center
 *
 * ## Stored in Supabase (tiktok_shop_connections table)
 * - access_token, refresh_token, token_expires_at
 * - shop_id, shop_name, shop_cipher, seller_base_region
 *
 * ## References
 * - Partner Center: https://partner.tiktokshop.com
 * - API Concepts:   https://partner.tiktokshop.com/docv2/page/tts-api-concepts-overview
 * - Sign Requests:  https://partner.tiktokshop.com/docv2/page/sign-your-api-request
 * - Affiliate APIs: https://developers.tiktok.com/blog/2024-tiktok-shop-affiliate-apis-launch-developer-opportunity
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://open-api.tiktokglobalshop.com';
const AUTH_URL = 'https://services.tiktokshop.com/open/authorize';
const TOKEN_URL = 'https://auth.tiktok-shops.com/api/v2/token/get';
const API_VERSION = '202309';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TikTokShopConfig {
  appKey: string;
  appSecret: string;
}

export interface TikTokTokenResponse {
  access_token: string;
  access_token_expire_in: number;
  refresh_token: string;
  refresh_token_expire_in: number;
  open_id: string;
  seller_name: string;
  seller_base_region: string;
  user_type: number;
}

export interface TikTokShop {
  id: string;
  name: string;
  region: string;
  seller_type: string;
  cipher: string;
}

export interface TikTokProduct {
  id: string;
  title: string;
  status: string;
  create_time: number;
  update_time: number;
  images?: { url: string }[];
  skus?: {
    id: string;
    price: { amount: string; currency: string };
    inventory?: { quantity: number };
  }[];
}

export interface TikTokOrder {
  id: string;
  status: string;
  create_time: number;
  update_time: number;
  payment: {
    total_amount: string;
    currency: string;
  };
  line_items: {
    product_id: string;
    product_name: string;
    sku_id: string;
    quantity: number;
  }[];
}

// ---------------------------------------------------------------------------
// Request Signing
// ---------------------------------------------------------------------------

/**
 * Generate HMAC-SHA256 signature for TikTok Shop API requests.
 *
 * Algorithm:
 * 1. Collect all query params except `sign` and `access_token`
 * 2. Sort alphabetically by key
 * 3. Concatenate as key1value1key2value2...
 * 4. Prepend the path (e.g. /product/202309/products/search)
 * 5. Wrap: {app_secret}{path}{params}{app_secret}
 * 6. HMAC-SHA256(app_secret, wrapped_string) → hex
 */
export function generateSign(
  path: string,
  params: Record<string, string>,
  appSecret: string,
  body?: string,
): string {
  // Filter out sign and access_token
  const filtered = Object.entries(params)
    .filter(([key]) => key !== 'sign' && key !== 'access_token')
    .sort(([a], [b]) => a.localeCompare(b));

  const paramString = filtered.map(([k, v]) => `${k}${v}`).join('');
  const signBase = `${appSecret}${path}${paramString}${body || ''}${appSecret}`;

  return crypto
    .createHmac('sha256', appSecret)
    .update(signBase)
    .digest('hex');
}

// ---------------------------------------------------------------------------
// TikTok Shop Client
// ---------------------------------------------------------------------------

export class TikTokShopClient {
  private appKey: string;
  private appSecret: string;

  constructor(config?: TikTokShopConfig) {
    this.appKey = config?.appKey || process.env.TIKTOK_SHOP_APP_KEY || '';
    this.appSecret = config?.appSecret || process.env.TIKTOK_SHOP_APP_SECRET || '';
  }

  /** Check whether app credentials are configured */
  isConfigured(): boolean {
    return Boolean(this.appKey && this.appSecret);
  }

  // -------------------------------------------------------------------------
  // OAuth2 Flow
  // -------------------------------------------------------------------------

  /**
   * Build the OAuth2 authorization URL.
   * Redirect the user's browser here to start the OAuth flow.
   */
  getAuthorizationUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      app_key: this.appKey,
      // state for CSRF protection
      ...(state ? { state } : {}),
    });

    return `${AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange an authorization code for access + refresh tokens.
   * Called after the user authorizes and TikTok redirects back with `code`.
   */
  async getAccessToken(authCode: string): Promise<TikTokTokenResponse> {
    const params = new URLSearchParams({
      app_key: this.appKey,
      app_secret: this.appSecret,
      auth_code: authCode,
      grant_type: 'authorized_code',
    });

    const res = await fetch(`${TOKEN_URL}?${params.toString()}`, {
      method: 'GET',
    });

    const json = await res.json();

    if (json.code !== 0) {
      throw new Error(`Token exchange failed: ${json.message || JSON.stringify(json)}`);
    }

    return json.data as TikTokTokenResponse;
  }

  /**
   * Refresh an expired access token using a refresh token.
   * No user interaction required.
   */
  async refreshAccessToken(refreshToken: string): Promise<TikTokTokenResponse> {
    const params = new URLSearchParams({
      app_key: this.appKey,
      app_secret: this.appSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const res = await fetch(`${TOKEN_URL}?${params.toString()}`, {
      method: 'GET',
    });

    const json = await res.json();

    if (json.code !== 0) {
      throw new Error(`Token refresh failed: ${json.message || JSON.stringify(json)}`);
    }

    return json.data as TikTokTokenResponse;
  }

  // -------------------------------------------------------------------------
  // Signed API Request Helper
  // -------------------------------------------------------------------------

  private async apiRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    accessToken: string,
    shopCipher: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const queryParams: Record<string, string> = {
      app_key: this.appKey,
      timestamp,
      shop_cipher: shopCipher,
      access_token: accessToken,
    };

    const bodyStr = body ? JSON.stringify(body) : undefined;
    const sign = generateSign(path, queryParams, this.appSecret, bodyStr);
    queryParams.sign = sign;

    const qs = new URLSearchParams(queryParams).toString();
    const url = `${BASE_URL}${path}?${qs}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-tts-access-token': accessToken,
    };

    const res = await fetch(url, {
      method,
      headers,
      body: bodyStr,
    });

    const json = await res.json();

    if (json.code !== 0) {
      throw new Error(
        `TikTok Shop API error [${path}]: code=${json.code} message=${json.message}`
      );
    }

    return json.data as T;
  }

  // -------------------------------------------------------------------------
  // Authorization / Shops
  // -------------------------------------------------------------------------

  /** Get list of shops authorized by the seller */
  async getAuthorizedShops(accessToken: string): Promise<TikTokShop[]> {
    const path = `/authorization/${API_VERSION}/shops`;
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const queryParams: Record<string, string> = {
      app_key: this.appKey,
      timestamp,
      access_token: accessToken,
    };

    const sign = generateSign(path, queryParams, this.appSecret);
    queryParams.sign = sign;

    const qs = new URLSearchParams(queryParams).toString();
    const url = `${BASE_URL}${path}?${qs}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-tts-access-token': accessToken,
      },
    });

    const json = await res.json();

    if (json.code !== 0) {
      throw new Error(`Failed to get shops: ${json.message}`);
    }

    return (json.data?.shops || []).map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      region: s.region,
      seller_type: s.seller_type,
      cipher: s.cipher,
    }));
  }

  // -------------------------------------------------------------------------
  // Products API
  // -------------------------------------------------------------------------

  /** Search products in the shop */
  async searchProducts(
    accessToken: string,
    shopCipher: string,
    options: {
      page_size?: number;
      page_token?: string;
      status?: string; // DRAFT, PENDING, FAILED, LIVE, SELLER_DEACTIVATED, etc.
    } = {},
  ): Promise<{ products: TikTokProduct[]; next_page_token: string; total_count: number }> {
    const path = `/product/${API_VERSION}/products/search`;
    const body: Record<string, unknown> = {
      page_size: options.page_size || 20,
    };
    if (options.page_token) body.page_token = options.page_token;
    if (options.status) body.filter_status = options.status;

    return this.apiRequest('POST', path, accessToken, shopCipher, body);
  }

  /** Get a single product by ID */
  async getProduct(
    accessToken: string,
    shopCipher: string,
    productId: string,
  ): Promise<TikTokProduct> {
    const path = `/product/${API_VERSION}/products/${productId}`;
    return this.apiRequest('GET', path, accessToken, shopCipher);
  }

  // -------------------------------------------------------------------------
  // Orders API
  // -------------------------------------------------------------------------

  /** Search orders */
  async searchOrders(
    accessToken: string,
    shopCipher: string,
    options: {
      page_size?: number;
      page_token?: string;
      order_status?: number; // 100=unpaid, 111=awaiting shipment, 112=shipped, etc.
      create_time_ge?: number; // unix timestamp
      create_time_lt?: number;
    } = {},
  ): Promise<{ orders: TikTokOrder[]; next_page_token: string; total_count: number }> {
    const path = `/order/${API_VERSION}/orders/search`;
    const body: Record<string, unknown> = {
      page_size: options.page_size || 20,
    };
    if (options.page_token) body.page_token = options.page_token;
    if (options.order_status) body.order_status = options.order_status;
    if (options.create_time_ge || options.create_time_lt) {
      body.create_time = {
        ...(options.create_time_ge ? { ge: options.create_time_ge } : {}),
        ...(options.create_time_lt ? { lt: options.create_time_lt } : {}),
      };
    }

    return this.apiRequest('POST', path, accessToken, shopCipher, body);
  }

  /** Get order detail by ID */
  async getOrder(
    accessToken: string,
    shopCipher: string,
    orderId: string,
  ): Promise<TikTokOrder> {
    const path = `/order/${API_VERSION}/orders/${orderId}`;
    return this.apiRequest('GET', path, accessToken, shopCipher);
  }

  // -------------------------------------------------------------------------
  // Affiliate API
  // -------------------------------------------------------------------------

  /** Search open collaborations (affiliate marketplace) */
  async searchOpenCollaborations(
    accessToken: string,
    shopCipher: string,
    options: {
      page_size?: number;
      page_token?: string;
    } = {},
  ): Promise<{ collaborations: unknown[]; next_page_token: string }> {
    const path = `/affiliate/${API_VERSION}/open_collaborations/search`;
    const body: Record<string, unknown> = {
      page_size: options.page_size || 20,
    };
    if (options.page_token) body.page_token = options.page_token;

    return this.apiRequest('POST', path, accessToken, shopCipher, body);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _client: TikTokShopClient | null = null;

export function getTikTokShopClient(): TikTokShopClient {
  if (!_client) {
    _client = new TikTokShopClient();
  }
  return _client;
}
