/**
 * Unified TikTok publish endpoint.
 *
 * Replaces the separate Direct/Inbox publish routes that lived per-token-table
 * pre-Phase-1.3. Resolves the account from `tiktok_oauth_accounts` (the new
 * unified OAuth-token table), decrypts the access token via
 * lib/crypto/encrypt.ts, and routes through the existing TikTokContentClient.
 *
 * Body:
 *   { accountId: string,
 *     mode: 'direct' | 'inbox',
 *     videoUrl: string,
 *     caption?: string,
 *     privacyLevel?: string,
 *     disableComment?: boolean,
 *     disableDuet?: boolean,
 *     disableStitch?: boolean }
 *
 * Returns:
 *   { ok: true, publishId } on success.
 *   429 with `Retry-After` header if the account is in cooldown after a
 *   previous 429 from TikTok.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getTikTokContentClient } from '@/lib/tiktok-content';
import { decrypt, looksEncrypted } from '@/lib/crypto/encrypt';

export const runtime = 'nodejs';

// ── In-memory rate tracker, keyed by accountId ────────────────────────────────
// Exponential backoff after a 429 from TikTok. State is per-instance: that's
// fine for MVP since concurrency is bounded and the worst case is one extra
// 429 from a different lambda — TikTok will tell us to back off again. For
// strict global state, swap to Redis.

interface CooldownEntry {
  retryAfterMs: number;     // wall-clock timestamp until which we're in cooldown
  consecutive429s: number;  // number of consecutive 429s seen
}
const COOLDOWNS = new Map<string, CooldownEntry>();

function getCooldown(accountId: string): CooldownEntry | null {
  const e = COOLDOWNS.get(accountId);
  if (!e) return null;
  if (e.retryAfterMs <= Date.now()) {
    COOLDOWNS.delete(accountId);
    return null;
  }
  return e;
}

function recordRateLimit(accountId: string, hintSeconds?: number) {
  const prev = COOLDOWNS.get(accountId);
  const consecutive = (prev?.consecutive429s ?? 0) + 1;
  // Exponential backoff: 30s, 60s, 120s, 240s, capped at 30 min.
  const baseMs = Math.min(30_000 * 2 ** (consecutive - 1), 30 * 60_000);
  const ms = hintSeconds ? Math.max(hintSeconds * 1000, baseMs) : baseMs;
  COOLDOWNS.set(accountId, { retryAfterMs: Date.now() + ms, consecutive429s: consecutive });
}

function clearRateLimit(accountId: string) {
  COOLDOWNS.delete(accountId);
}

// ── Handler ───────────────────────────────────────────────────────────────────

interface PublishBody {
  accountId?: string;
  mode?: 'direct' | 'inbox';
  videoUrl?: string;
  caption?: string;
  privacyLevel?: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let body: PublishBody;
  try {
    body = (await req.json()) as PublishBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const { accountId, mode = 'inbox', videoUrl } = body;
  if (!accountId) {
    return NextResponse.json({ ok: false, error: 'accountId required' }, { status: 400 });
  }
  if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) {
    return NextResponse.json({ ok: false, error: 'videoUrl must be http(s) url' }, { status: 400 });
  }
  if (mode !== 'direct' && mode !== 'inbox') {
    return NextResponse.json({ ok: false, error: 'mode must be "direct" or "inbox"' }, { status: 400 });
  }

  // 3. Cooldown gate
  const cd = getCooldown(accountId);
  if (cd) {
    const retryAfter = Math.ceil((cd.retryAfterMs - Date.now()) / 1000);
    return NextResponse.json(
      { ok: false, error: 'rate_limited', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // 4. Resolve account → token (must belong to this user)
  // NOTE: this is the OAuth-token table created in migration
  // 20260501000001_tiktok_oauth_accounts.sql, NOT the existing
  // `tiktok_accounts` CMS table (handles + posting frequency).
  const { data: account, error: acctErr } = await supabaseAdmin
    .from('tiktok_oauth_accounts')
    .select('id, user_id, account_type, encrypted_access_token, expires_at')
    .eq('id', accountId)
    .maybeSingle();
  if (acctErr || !account || account.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: 'account not found' }, { status: 404 });
  }

  if (account.expires_at && new Date(account.expires_at as string).getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, error: 'access token expired — refresh required' },
      { status: 401 },
    );
  }

  let accessToken: string;
  try {
    const stored = account.encrypted_access_token as string;
    accessToken = looksEncrypted(stored) ? decrypt(stored) : stored;
  } catch (err) {
    console.error('[PUBLISH_TT] decrypt failed for', accountId, err);
    return NextResponse.json({ ok: false, error: 'token decrypt failed' }, { status: 500 });
  }

  // 5. Call TikTok
  const client = getTikTokContentClient();
  try {
    let publishId: string;
    if (mode === 'direct') {
      const result = await client.publishVideoFromUrl(accessToken, {
        video_url: videoUrl,
        title: body.caption,
        privacy_level: body.privacyLevel,
        disable_comment: body.disableComment,
        disable_duet: body.disableDuet,
        disable_stitch: body.disableStitch,
      });
      publishId = result.publish_id;
    } else {
      const result = await client.publishVideoToInbox(accessToken, {
        video_url: videoUrl,
        title: body.caption,
      });
      publishId = result.publish_id;
    }
    clearRateLimit(accountId);
    return NextResponse.json({ ok: true, publishId, mode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // TikTok's error envelope sometimes surfaces 429 in the message body.
    if (/\b429\b|rate.?limit|too many requests/i.test(msg)) {
      recordRateLimit(accountId);
      const cdNow = getCooldown(accountId);
      const retryAfter = cdNow ? Math.ceil((cdNow.retryAfterMs - Date.now()) / 1000) : 60;
      return NextResponse.json(
        { ok: false, error: 'rate_limited_upstream', retryAfter, detail: msg.slice(0, 200) },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }
    console.error('[PUBLISH_TT] publish failed:', msg);
    return NextResponse.json({ ok: false, error: msg.slice(0, 400) }, { status: 502 });
  }
}
