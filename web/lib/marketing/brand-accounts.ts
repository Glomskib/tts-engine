/**
 * Brand → Late Account ID mapping.
 *
 * Resolution order:
 *   1. DB: marketing_brand_accounts table (hot-reloadable, admin-editable)
 *   2. Env: LATE_BRAND_ACCOUNTS_JSON (JSON string, for CI/preview deploys)
 *   3. Fallback: hardcoded defaults (always available)
 *
 * Usage:
 *   const targets = await resolveTargets('Making Miles Matter', ['facebook', 'twitter']);
 */

import type { PlatformTarget, LatePlatform } from './types';
import { LATE_ACCOUNTS, FACEBOOK_PAGES } from './types';

const LOG_PREFIX = '[marketing:brands]';

// ── Hardcoded fallback (always works, no DB needed) ─────────────
export interface BrandAccount {
  brand: string;
  platform: LatePlatform;
  account_id: string;
  page_id?: string;
  enabled: boolean;
  /**
   * Umbrella brand this row rolls up to. NULL means this row IS the umbrella.
   * Added 2026-05-30 for the farm pattern (e.g. brand="POTS Patrol",
   * parent_brand="Zebby's World"). See migration 20260530200000.
   */
  parent_brand?: string | null;
}

const DEFAULT_BRAND_ACCOUNTS: BrandAccount[] = [
  // Making Miles Matter (MMM) — cycling brand
  { brand: 'Making Miles Matter', platform: 'facebook',  account_id: LATE_ACCOUNTS.facebook, page_id: FACEBOOK_PAGES.makingMilesMatter, enabled: true },
  { brand: 'Making Miles Matter', platform: 'twitter',   account_id: LATE_ACCOUNTS.twitter,   enabled: true },
  { brand: 'Making Miles Matter', platform: 'linkedin',  account_id: LATE_ACCOUNTS.linkedin,  enabled: true },
  { brand: 'Making Miles Matter', platform: 'tiktok',    account_id: LATE_ACCOUNTS.tiktok,    enabled: true },
  { brand: 'Making Miles Matter', platform: 'youtube',   account_id: LATE_ACCOUNTS.youtube,   enabled: true },
  { brand: 'Making Miles Matter', platform: 'pinterest', account_id: LATE_ACCOUNTS.pinterest, enabled: true },

  // Zebby's World — EDS/POTS awareness brand
  { brand: "Zebby's World", platform: 'facebook',  account_id: LATE_ACCOUNTS.facebook, page_id: FACEBOOK_PAGES.zebbysWorld, enabled: true },
  { brand: "Zebby's World", platform: 'twitter',   account_id: LATE_ACCOUNTS.twitter,  enabled: true },
  { brand: "Zebby's World", platform: 'linkedin',  account_id: LATE_ACCOUNTS.linkedin, enabled: true },
  // Added 2026-05-24 for the Zebby content engine. Routes through the shared
  // Late account_ids — replace with Zebby-dedicated account_ids if/when they're
  // provisioned in Late.dev → Settings → Accounts (then update LATE_ACCOUNTS
  // in types.ts or override per-brand here).
  //
  // Instagram is intentionally absent — Late.dev publishes IG via the FB Page
  // graph today; the FB row above carries IG cross-posts when the page is
  // linked to an IG Business profile.
  { brand: "Zebby's World", platform: 'tiktok',   account_id: LATE_ACCOUNTS.tiktok,  enabled: true },
  { brand: "Zebby's World", platform: 'youtube',  account_id: LATE_ACCOUNTS.youtube, enabled: true },

  // FlashFlow — meta brand (internal/ops)
  { brand: 'FlashFlow', platform: 'twitter',  account_id: LATE_ACCOUNTS.twitter,  enabled: true },
  { brand: 'FlashFlow', platform: 'linkedin', account_id: LATE_ACCOUNTS.linkedin, enabled: true },
];

// ── In-memory cache (TTL 5 min for DB rows) ─────────────────────
let _cache: BrandAccount[] | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Get brand accounts — tries DB first, then env, then hardcoded.
 */
export async function getBrandAccounts(): Promise<BrandAccount[]> {
  // Check cache
  if (_cache && Date.now() - _cacheTs < CACHE_TTL_MS) {
    return _cache;
  }

  // 1. Try DB
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
    const { data, error } = await supabaseAdmin
      .from('marketing_brand_accounts')
      .select('*')
      .eq('enabled', true);

    if (!error && data && data.length > 0) {
      _cache = data as BrandAccount[];
      _cacheTs = Date.now();
      return _cache;
    }
  } catch {
    // DB not available (e.g. running as CLI script without Supabase)
  }

  // 2. Try env JSON
  const envJson = process.env.LATE_BRAND_ACCOUNTS_JSON;
  if (envJson) {
    try {
      const parsed = JSON.parse(envJson) as BrandAccount[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        _cache = parsed;
        _cacheTs = Date.now();
        return _cache;
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} Failed to parse LATE_BRAND_ACCOUNTS_JSON:`, err);
    }
  }

  // 3. Hardcoded fallback
  _cache = DEFAULT_BRAND_ACCOUNTS;
  _cacheTs = Date.now();
  return _cache;
}

/**
 * Map a brand name (lane) to its default platforms if none specified.
 */
function defaultPlatformsForBrand(brand: string): LatePlatform[] {
  switch (brand) {
    case 'Making Miles Matter': return ['facebook', 'twitter', 'linkedin'];
    case "Zebby's World":       return ['facebook', 'twitter'];
    case 'FlashFlow':           return ['twitter', 'linkedin'];
    default:                    return ['facebook', 'twitter', 'linkedin'];
  }
}

/**
 * Resolve brand + optional platform filter → PlatformTarget[].
 * This is the main public API for wiring drafts to the right Late accounts.
 */
export async function resolveTargets(
  brand: string,
  platforms?: LatePlatform[],
): Promise<PlatformTarget[]> {
  const accounts = await getBrandAccounts();

  const brandAccounts = accounts.filter(
    (a) => a.brand === brand && a.enabled,
  );

  // Use provided platforms or brand defaults
  const targetPlatforms = platforms || defaultPlatformsForBrand(brand);

  const targets: PlatformTarget[] = [];
  for (const platform of targetPlatforms) {
    const acct = brandAccounts.find((a) => a.platform === platform);
    if (!acct) {
      console.warn(`${LOG_PREFIX} No account for brand="${brand}" platform="${platform}" — skipping`);
      continue;
    }

    const target: PlatformTarget = {
      platform: acct.platform,
      accountId: acct.account_id,
    };

    if (acct.page_id && platform === 'facebook') {
      target.platformSpecificData = { pageId: acct.page_id };
    }

    targets.push(target);
  }

  return targets;
}

/**
 * Resolve umbrella brand → PlatformTarget[] for every farm page underneath it.
 *
 * Added 2026-05-30 for the farm pattern. e.g. resolveTargetsByUmbrella("Zebby's World")
 * returns targets for Zebby's World itself PLUS POTS Patrol, EDS Daily, Stomach
 * Stories, Mast be Monday, Bendy Body Daily — all 6 Facebook pages plus any
 * Zebby's own non-FB platforms (twitter/linkedin/tiktok/youtube).
 *
 * Includes:
 *   - the umbrella row itself (parent_brand IS NULL AND brand = umbrella)
 *   - every farm row (parent_brand = umbrella)
 *
 * If platforms filter is provided, only returns targets for those platforms.
 */
export async function resolveTargetsByUmbrella(
  umbrella: string,
  platforms?: LatePlatform[],
): Promise<PlatformTarget[]> {
  const accounts = await getBrandAccounts();

  const matchingAccounts = accounts.filter(
    (a) =>
      a.enabled &&
      (
        // The umbrella itself
        (a.brand === umbrella && (a.parent_brand === null || a.parent_brand === undefined)) ||
        // Any farm row whose parent_brand IS this umbrella
        a.parent_brand === umbrella
      ),
  );

  if (matchingAccounts.length === 0) {
    console.warn(`${LOG_PREFIX} No accounts found under umbrella="${umbrella}"`);
    return [];
  }

  const filterPlatforms = platforms ? new Set(platforms) : null;
  const targets: PlatformTarget[] = [];

  for (const acct of matchingAccounts) {
    if (filterPlatforms && !filterPlatforms.has(acct.platform)) continue;

    const target: PlatformTarget = {
      platform: acct.platform,
      accountId: acct.account_id,
    };
    if (acct.page_id && acct.platform === 'facebook') {
      target.platformSpecificData = { pageId: acct.page_id };
    }
    targets.push(target);
  }

  console.log(
    `${LOG_PREFIX} resolveTargetsByUmbrella("${umbrella}") → ${targets.length} target(s) across ${new Set(targets.map((t) => t.platform)).size} platform(s)`,
  );
  return targets;
}

/**
 * List every child (farm) brand under a given umbrella. Convenience helper
 * for admin UIs and mc-post.
 */
export async function listChildBrands(umbrella: string): Promise<BrandAccount[]> {
  const accounts = await getBrandAccounts();
  return accounts.filter((a) => a.parent_brand === umbrella);
}

/**
 * Invalidate cache (call after DB updates).
 */
export function invalidateBrandCache(): void {
  _cache = null;
  _cacheTs = 0;
}
