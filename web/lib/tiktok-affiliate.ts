/**
 * TikTok Shop Affiliate API client — FlashFlow's "Helium 10 wedge".
 * ================================================================
 *
 * Wraps the affiliate-specific endpoints: open-collaboration discovery,
 * product catalog browsing, sample requests, and commission analytics.
 *
 * Gating: every method here relies on the calling app being allowlisted
 * for TikTok Shop Affiliate APIs at developers.tiktok.com. Until FF is on
 * the allowlist, the routes that use this client return 503 with a
 * friendly "approval pending" message — see `assertAffiliateConfigured`.
 *
 * Endpoint references (TT Shop Open API v202309):
 *   - Open collaboration search:
 *       POST /affiliate/202309/open_collaborations/search
 *       https://partner.tiktokshop.com/docv2/page/affiliate-open-collaboration-search
 *   - Product catalog browse:
 *       POST /affiliate/202309/products/search
 *       https://partner.tiktokshop.com/docv2/page/affiliate-product-search
 *   - Sample request submit:
 *       POST /affiliate/202309/samples/request
 *       https://partner.tiktokshop.com/docv2/page/affiliate-sample-request
 *   - My collaborations list:
 *       POST /affiliate/202309/my_collaborations/search
 *       https://partner.tiktokshop.com/docv2/page/affiliate-my-collaborations
 *   - Commission stats:
 *       POST /affiliate/202309/commissions/stats
 *       https://partner.tiktokshop.com/docv2/page/affiliate-commission-stats
 *
 * IMPORTANT: TT Shop affiliate response shapes are still moving — every
 * structured field below is best-effort based on docs as of 2026-04. Where
 * we don't have a confirmed response sample, we use `unknown` with a TODO.
 * Tighten the types once we have real responses (i.e., after FF allowlist).
 */
import { generateSign } from './tiktok-shop';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://open-api.tiktokglobalshop.com';
const API_VERSION = '202309';

// ---------------------------------------------------------------------------
// Best-effort types — tighten once we have real responses
// ---------------------------------------------------------------------------

/** Affiliate collaboration row returned by open_collaborations/search */
export interface AffiliateCollaboration {
  collaboration_id: string;
  product_id: string;
  product_title: string;
  product_image_url?: string;
  /** Commission rate as a decimal (0.15 = 15%) */
  commission_rate: number;
  /** Optional brand-side budget cap in cents */
  budget_cents?: number;
  category_id?: string;
  category_name?: string;
  /** Open / closed / paused */
  status: string;
  /** Free sample available? */
  sample_available: boolean;
  /** Earliest end date for joining (unix ts) */
  apply_deadline?: number;
  // TODO: tighten once we capture a real response
  raw?: unknown;
}

export interface AffiliateProductCatalogItem {
  product_id: string;
  title: string;
  image_url?: string;
  price_cents?: number;
  currency?: string;
  category_id?: string;
  /** Available commission tiers — typically [{ tier: 'standard', rate: 0.1 }] */
  commission_tiers?: Array<{ tier: string; rate: number }>;
  /** Sales velocity hint from TT (last 30 days) */
  recent_orders_30d?: number;
  raw?: unknown;
}

export interface AffiliateSampleRequest {
  request_id: string;
  product_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'shipped' | 'delivered';
  shipping_address_id?: string;
  rejected_reason?: string;
  created_at: number;
}

export interface AffiliateMyCollaboration {
  collaboration_id: string;
  product_id: string;
  product_title: string;
  status: 'active' | 'paused' | 'ended';
  joined_at: number;
  commission_rate: number;
  total_orders?: number;
  total_commission_cents?: number;
}

export interface AffiliateCommissionStats {
  range_start: number;
  range_end: number;
  total_orders: number;
  total_gmv_cents: number;
  total_commission_cents: number;
  currency: string;
  by_product?: Array<{
    product_id: string;
    product_title: string;
    orders: number;
    gmv_cents: number;
    commission_cents: number;
  }>;
}

export interface AffiliateConfig {
  appKey: string;
  appSecret: string;
}

// ---------------------------------------------------------------------------
// Configuration & gating
// ---------------------------------------------------------------------------

/**
 * Returns the affiliate API key (alias of the TT Shop app key once FF is
 * approved for the affiliate-API allowlist). If unset, the affiliate
 * features stay dormant and the API routes return 503.
 */
export function getAffiliateApiKey(): string | null {
  return process.env.TIKTOK_AFFILIATE_API_KEY || process.env.TIKTOK_SHOP_APP_KEY || null;
}

export function isAffiliateConfigured(): boolean {
  return Boolean(getAffiliateApiKey() && process.env.TIKTOK_SHOP_APP_SECRET);
}

/**
 * Throw a typed error if the affiliate API isn't configured. API routes
 * catch this and return 503 with `notice` for the UI.
 */
export class AffiliateNotApprovedError extends Error {
  status = 503;
  constructor(public reason: string) {
    super(reason);
    this.name = 'AffiliateNotApprovedError';
  }
}

export function assertAffiliateConfigured(): void {
  if (!isAffiliateConfigured()) {
    throw new AffiliateNotApprovedError(
      'TikTok Shop Affiliate API is not yet enabled for this workspace. ' +
      'Set TIKTOK_AFFILIATE_API_KEY (or TIKTOK_SHOP_APP_KEY) + TIKTOK_SHOP_APP_SECRET ' +
      'after FlashFlow is allowlisted at developers.tiktok.com.',
    );
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class TikTokAffiliateClient {
  private appKey: string;
  private appSecret: string;

  constructor(config?: AffiliateConfig) {
    this.appKey = config?.appKey || getAffiliateApiKey() || '';
    this.appSecret = config?.appSecret || process.env.TIKTOK_SHOP_APP_SECRET || '';
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    accessToken: string,
    shopCipher: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.appKey || !this.appSecret) {
      throw new AffiliateNotApprovedError('Affiliate client missing app key/secret.');
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const queryParams: Record<string, string> = {
      app_key: this.appKey,
      timestamp,
      shop_cipher: shopCipher,
      access_token: accessToken,
    };
    const bodyStr = body ? JSON.stringify(body) : undefined;
    queryParams.sign = generateSign(path, queryParams, this.appSecret, bodyStr);

    const qs = new URLSearchParams(queryParams).toString();
    const url = `${BASE_URL}${path}?${qs}`;

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-tts-access-token': accessToken,
      },
      body: bodyStr,
    });

    const json = await res.json();
    if (json.code !== 0) {
      throw new Error(`TikTok Affiliate [${path}]: code=${json.code} message=${json.message}`);
    }
    return json.data as T;
  }

  // -------------------------------------------------------------------------
  // 1. Search open collaborations — the discovery surface
  //    Docs: https://partner.tiktokshop.com/docv2/page/affiliate-open-collaboration-search
  // -------------------------------------------------------------------------
  async searchOpenCollaborations(
    accessToken: string,
    shopCipher: string,
    options: {
      keyword?: string;
      category_id?: string;
      commission_rate_min?: number;
      page_size?: number;
      page_token?: string;
    } = {},
  ): Promise<{ collaborations: AffiliateCollaboration[]; next_page_token: string }> {
    const path = `/affiliate/${API_VERSION}/open_collaborations/search`;
    const body: Record<string, unknown> = {
      page_size: options.page_size ?? 20,
    };
    if (options.keyword) body.keyword = options.keyword;
    if (options.category_id) body.category_id = options.category_id;
    if (options.commission_rate_min !== undefined) {
      body.commission_rate_min = options.commission_rate_min;
    }
    if (options.page_token) body.page_token = options.page_token;

    // TODO: tighten this cast once we capture a real response shape
    const raw = await this.request<{ collaborations: unknown[]; next_page_token: string }>(
      'POST', path, accessToken, shopCipher, body,
    );
    const collaborations = (raw.collaborations || []).map(mapRawCollaboration);
    return { collaborations, next_page_token: raw.next_page_token };
  }

  // -------------------------------------------------------------------------
  // 2. Browse the affiliate product catalog
  //    Docs: https://partner.tiktokshop.com/docv2/page/affiliate-product-search
  // -------------------------------------------------------------------------
  async getProductCatalog(
    accessToken: string,
    shopCipher: string,
    options: {
      keyword?: string;
      category_id?: string;
      page_size?: number;
      page_token?: string;
    } = {},
  ): Promise<{ products: AffiliateProductCatalogItem[]; next_page_token: string }> {
    const path = `/affiliate/${API_VERSION}/products/search`;
    const body: Record<string, unknown> = { page_size: options.page_size ?? 20 };
    if (options.keyword) body.keyword = options.keyword;
    if (options.category_id) body.category_id = options.category_id;
    if (options.page_token) body.page_token = options.page_token;

    // TODO: tighten cast post-allowlist
    const raw = await this.request<{ products: unknown[]; next_page_token: string }>(
      'POST', path, accessToken, shopCipher, body,
    );
    const products = (raw.products || []).map(mapRawProduct);
    return { products, next_page_token: raw.next_page_token };
  }

  // -------------------------------------------------------------------------
  // 3. Request a free sample for a product
  //    Docs: https://partner.tiktokshop.com/docv2/page/affiliate-sample-request
  // -------------------------------------------------------------------------
  async requestSample(
    accessToken: string,
    shopCipher: string,
    productId: string,
    shippingAddressId?: string,
  ): Promise<AffiliateSampleRequest> {
    const path = `/affiliate/${API_VERSION}/samples/request`;
    const body: Record<string, unknown> = { product_id: productId };
    if (shippingAddressId) body.shipping_address_id = shippingAddressId;

    return this.request('POST', path, accessToken, shopCipher, body);
  }

  // -------------------------------------------------------------------------
  // 4. List my active / past collaborations
  //    Docs: https://partner.tiktokshop.com/docv2/page/affiliate-my-collaborations
  // -------------------------------------------------------------------------
  async listMyCollaborations(
    accessToken: string,
    shopCipher: string,
    options: {
      status?: 'active' | 'paused' | 'ended';
      page_size?: number;
      page_token?: string;
    } = {},
  ): Promise<{ collaborations: AffiliateMyCollaboration[]; next_page_token: string }> {
    const path = `/affiliate/${API_VERSION}/my_collaborations/search`;
    const body: Record<string, unknown> = { page_size: options.page_size ?? 20 };
    if (options.status) body.status = options.status;
    if (options.page_token) body.page_token = options.page_token;
    return this.request('POST', path, accessToken, shopCipher, body);
  }

  // -------------------------------------------------------------------------
  // 5. Commission stats over a time range
  //    Docs: https://partner.tiktokshop.com/docv2/page/affiliate-commission-stats
  // -------------------------------------------------------------------------
  async getCommissionStats(
    accessToken: string,
    shopCipher: string,
    rangeStart: number,
    rangeEnd: number,
  ): Promise<AffiliateCommissionStats> {
    const path = `/affiliate/${API_VERSION}/commissions/stats`;
    const body = {
      range_start: rangeStart,
      range_end: rangeEnd,
    };
    return this.request('POST', path, accessToken, shopCipher, body);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _client: TikTokAffiliateClient | null = null;

export function getTikTokAffiliateClient(): TikTokAffiliateClient {
  if (!_client) {
    _client = new TikTokAffiliateClient();
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Raw → typed mappers (best effort; tighten post-allowlist)
// ---------------------------------------------------------------------------

function mapRawCollaboration(r: unknown): AffiliateCollaboration {
  const o = (r ?? {}) as Record<string, unknown>;
  return {
    collaboration_id: String(o.collaboration_id ?? o.id ?? ''),
    product_id: String(o.product_id ?? ''),
    product_title: String(o.product_title ?? o.title ?? ''),
    product_image_url: typeof o.product_image_url === 'string' ? o.product_image_url : undefined,
    commission_rate: typeof o.commission_rate === 'number' ? o.commission_rate : 0,
    budget_cents: typeof o.budget_cents === 'number' ? o.budget_cents : undefined,
    category_id: typeof o.category_id === 'string' ? o.category_id : undefined,
    category_name: typeof o.category_name === 'string' ? o.category_name : undefined,
    status: String(o.status ?? 'open'),
    sample_available: Boolean(o.sample_available),
    apply_deadline: typeof o.apply_deadline === 'number' ? o.apply_deadline : undefined,
    raw: r,
  };
}

function mapRawProduct(r: unknown): AffiliateProductCatalogItem {
  const o = (r ?? {}) as Record<string, unknown>;
  return {
    product_id: String(o.product_id ?? o.id ?? ''),
    title: String(o.title ?? o.product_title ?? ''),
    image_url: typeof o.image_url === 'string' ? o.image_url : undefined,
    price_cents: typeof o.price_cents === 'number' ? o.price_cents : undefined,
    currency: typeof o.currency === 'string' ? o.currency : undefined,
    category_id: typeof o.category_id === 'string' ? o.category_id : undefined,
    commission_tiers: Array.isArray(o.commission_tiers)
      ? (o.commission_tiers as Array<{ tier: string; rate: number }>)
      : undefined,
    recent_orders_30d: typeof o.recent_orders_30d === 'number' ? o.recent_orders_30d : undefined,
    raw: r,
  };
}
