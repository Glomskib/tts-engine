/**
 * POST /api/marketing/sync-zernio-pages
 *
 * Bulk-registers every Facebook page Zernio (Late.dev) has OAuth access to,
 * as Zernio connections + marketing_brand_accounts rows. Avoids 40+ manual
 * clicks through Zernio's per-page selection UI.
 *
 * Body (JSON, all optional):
 *   {
 *     parent_brand_map?: Record<string, string>,
 *        // map of FB page NAME → umbrella brand. e.g.
 *        // { "POTSitive Vibes": "Zebby's World",
 *        //   "Findlay Pedal Pushers": "Making Miles Matter", ... }
 *        // Used to auto-populate parent_brand when inserting brand_accounts rows.
 *     dry_run?: boolean   // default false. true = list what WOULD happen, change nothing.
 *   }
 *
 * Auth: owner session OR Bearer MISSION_CONTROL_TOKEN.
 *
 * What it does:
 *   1. GET https://getlate.dev/api/v1/accounts — list every connected account
 *      (some Facebook pages may already be registered as Zernio connections).
 *   2. For Facebook accounts: also call /accounts/<id>/pages to discover the
 *      full page list each account has access to (the "Manage Pages" view).
 *      [Zernio docs: https://docs.zernio.com/api/openapi]
 *   3. For every page NOT yet connected — POST /accounts/facebook to register
 *      it as its own Zernio connection. Capture the new accountId.
 *   4. UPSERT marketing_brand_accounts row for every Zernio Facebook connection
 *      with the matching parent_brand from the map (or null if not in map).
 *
 * Returns: {
 *   ok, dry_run,
 *   zernio_pages_seen, zernio_connections_already_present,
 *   zernio_connections_created, brand_account_rows_upserted,
 *   warnings: string[], details: [...]
 * }
 *
 * Approval gate remains in force — this endpoint only wires up plumbing,
 * not posting. Nothing publishes until meta.approved=true and the env flag
 * MARKETING_AUTOPUBLISH=on.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { invalidateBrandCache } from '@/lib/marketing/brand-accounts';

export const runtime = 'nodejs';
export const maxDuration = 90;

const LOG = '[marketing:sync-zernio]';
const ZERNIO_API_BASE = 'https://getlate.dev/api/v1';

async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
  const serviceToken = process.env.MISSION_CONTROL_TOKEN;
  if (serviceToken) {
    const authHeader = request.headers.get('authorization');
    const serviceAuth =
      request.headers.get('x-service-token') || request.headers.get('x-mc-token');
    if (authHeader === `Bearer ${serviceToken}` || serviceAuth === serviceToken) {
      return null;
    }
  }
  return requireOwner(request);
}

interface ZernioAccount {
  _id?: string;
  id?: string;
  platform?: string;
  username?: string;
  displayName?: string;
  pageId?: string;
  page_id?: string;
  meta?: Record<string, unknown>;
}

interface ZernioPage {
  id?: string;
  pageId?: string;
  name?: string;
  category?: string;
  accessToken?: string;
}

interface SyncRequestBody {
  parent_brand_map?: Record<string, string>;
  dry_run?: boolean;
  /**
   * Override for LATE_API_KEY env var. If LATE_API_KEY isn't set in Vercel,
   * pass the key here to make the sync work without an env change. Safe
   * because the endpoint is already auth-gated by MISSION_CONTROL_TOKEN.
   */
  zernio_api_key?: string;
}

async function zernioGet(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${ZERNIO_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zernio GET ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function zernioPost(path: string, apiKey: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${ZERNIO_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zernio POST ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function POST(request: NextRequest) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  let body: SyncRequestBody = {};
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      body = await request.json();
    }
  } catch {
    // empty body is fine
  }

  const apiKey = (
    body.zernio_api_key ||
    process.env.LATE_API_KEY ||
    process.env.ZERNIO_API_KEY ||
    ''
  ).trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'No Zernio API key. Set LATE_API_KEY in Vercel env OR pass {"zernio_api_key":"..."} in this request body.',
        how_to_get_key: 'zernio.com → Dashboard → API Keys → Create new key',
      },
      { status: 503 },
    );
  }

  const dryRun = body.dry_run === true;
  const parentMap = body.parent_brand_map || {};

  const warnings: string[] = [];
  const details: Array<Record<string, unknown>> = [];

  // ── Step 1: list every Zernio account (all platforms) ────────────
  let accountsList: ZernioAccount[];
  try {
    const raw = await zernioGet('/accounts', apiKey);
    if (Array.isArray(raw)) {
      accountsList = raw as ZernioAccount[];
    } else if (raw && typeof raw === 'object' && Array.isArray((raw as { accounts?: unknown }).accounts)) {
      accountsList = (raw as { accounts: ZernioAccount[] }).accounts;
    } else {
      accountsList = [];
      warnings.push('Zernio /accounts returned unexpected shape');
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Failed to list Zernio accounts: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  const fbAccounts = accountsList.filter((a) => a.platform === 'facebook');
  console.log(`${LOG} Zernio reports ${accountsList.length} total accounts, ${fbAccounts.length} on Facebook.`);

  // ── Step 2: for each Facebook account, list pages it owns ────────
  // (most Zernio FB connections expose this via /accounts/{id}/pages)
  const allPages: Array<{
    accountId: string;
    pageId: string;
    pageName: string;
    category?: string;
    alreadyConnectedAsAccount: boolean;
  }> = [];

  for (const fbAcct of fbAccounts) {
    const fbAcctId = fbAcct._id || fbAcct.id;
    if (!fbAcctId) continue;
    try {
      const pagesRaw = await zernioGet(`/accounts/${fbAcctId}/pages`, apiKey);
      const pages: ZernioPage[] = Array.isArray(pagesRaw)
        ? (pagesRaw as ZernioPage[])
        : ((pagesRaw as { pages?: ZernioPage[] })?.pages || []);
      for (const p of pages) {
        const pageId = p.pageId || p.id;
        if (!pageId || !p.name) continue;
        const alreadyConn = fbAccounts.some(
          (a) => a.pageId === pageId || a.page_id === pageId,
        );
        allPages.push({
          accountId: fbAcctId,
          pageId,
          pageName: p.name,
          category: p.category,
          alreadyConnectedAsAccount: alreadyConn,
        });
      }
    } catch (err) {
      warnings.push(
        `Could not list pages for Zernio account ${fbAcctId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`${LOG} Discovered ${allPages.length} FB pages across Zernio FB connections.`);

  // ── Step 3: create Zernio connections for pages not yet connected ──
  let connectionsCreated = 0;
  for (const page of allPages) {
    if (page.alreadyConnectedAsAccount) {
      details.push({ page: page.pageName, action: 'already_connected', pageId: page.pageId });
      continue;
    }
    if (dryRun) {
      details.push({ page: page.pageName, action: 'WOULD_CREATE_CONNECTION', pageId: page.pageId });
      connectionsCreated++;
      continue;
    }
    try {
      // Zernio's exact endpoint for promoting a page to a standalone account
      // varies by API version. We try the documented path first; if it 404s,
      // we record a warning and move on (the page is still registered in our
      // brand_accounts table so dispatch can use the existing parent FB
      // connection + page_id override).
      const created = await zernioPost('/accounts/facebook/pages', apiKey, {
        accountId: page.accountId,
        pageId: page.pageId,
        pageName: page.pageName,
      });
      connectionsCreated++;
      details.push({ page: page.pageName, action: 'connection_created', pageId: page.pageId, zernio_response: created });
    } catch (err) {
      warnings.push(
        `Could not auto-create Zernio connection for "${page.pageName}" (${page.pageId}): ${err instanceof Error ? err.message : String(err)}. Dispatch will still work via parent FB account_id + page_id override.`,
      );
      details.push({ page: page.pageName, action: 'connection_create_failed', pageId: page.pageId });
    }
  }

  // ── Step 4: upsert brand_accounts rows for every discovered page ───
  let rowsUpserted = 0;
  for (const page of allPages) {
    const parentBrand = parentMap[page.pageName] || null;
    const rowBrand = parentBrand ? page.pageName : page.pageName; // brand name = page name in farm pattern
    if (dryRun) {
      details.push({
        page: page.pageName,
        action: 'WOULD_UPSERT_BRAND_ROW',
        brand: rowBrand,
        parent_brand: parentBrand,
      });
      rowsUpserted++;
      continue;
    }
    // Bypass-migration mode: store parent_brand in meta JSONB so we don't
    // need the parent_brand column or the new unique index. Brand names are
    // already unique (each FB page name is distinct), so the existing
    // unique(brand, platform) constraint isn't violated by farm rows.
    // Migration 20260530200000 can still be applied later — readers tolerate
    // both shapes via resolveTargetsByUmbrella.
    const metaPayload: Record<string, unknown> = {
      synced_from_zernio_at: new Date().toISOString(),
      source_page_name: page.pageName,
      category: page.category || null,
    };
    if (parentBrand) metaPayload.parent_brand = parentBrand;

    const { error } = await supabaseAdmin
      .from('marketing_brand_accounts')
      .upsert(
        {
          brand: rowBrand,
          platform: 'facebook',
          account_id: page.accountId,
          page_id: page.pageId,
          enabled: true,
          meta: metaPayload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'brand,platform' },
      );
    if (error) {
      warnings.push(`Upsert brand_account row failed for "${page.pageName}": ${error.message}`);
      details.push({ page: page.pageName, action: 'upsert_failed', error: error.message });
    } else {
      rowsUpserted++;
      details.push({ page: page.pageName, action: 'upserted', brand: rowBrand, parent_brand: parentBrand });
    }
  }

  if (!dryRun) {
    invalidateBrandCache();
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    zernio_pages_seen: allPages.length,
    zernio_connections_already_present: allPages.filter((p) => p.alreadyConnectedAsAccount).length,
    zernio_connections_created: connectionsCreated,
    brand_account_rows_upserted: rowsUpserted,
    warnings,
    details,
    next_step:
      'Add `parent_brand_map` to fold farm pages under their umbrella (e.g. {"POTSitive Vibes":"Zebby\'s World"}) and re-run. Then mc-post pending to start approving content.',
  });
}
