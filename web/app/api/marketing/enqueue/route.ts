/**
 * /api/marketing/enqueue — HTTP front door for the marketing pipeline.
 *
 * POST: enqueue a draft (or publish-now) via the same pipeline the
 *       daily-intel + repurpose flows use. Lets Mission Control, OpenClaw,
 *       Telegram bots, the mc-post CLI, or phone shortcuts feed the queue.
 *
 * GET:  list recent marketing_posts. Thin read view for CLIs (the admin
 *       dashboard has its own richer view at /api/marketing/queue).
 *
 * Auth (both verbs): owner session OR service token (MISSION_CONTROL_TOKEN).
 * Matches the pattern used by /api/admin/command-center/dispatch.
 *
 * POST body:
 *   content      string, required — post text (1..10000 chars after trim)
 *   brand        string, required — "Making Miles Matter" | "Zebby's World" | "FlashFlow"
 *   platforms    string[] optional — subset of: facebook, twitter, linkedin,
 *                                    tiktok, youtube, pinterest, reddit
 *   media        array optional    — [{ type: "image"|"video", url }]
 *   publishNow   bool optional     — skip queue, go straight to Late.
 *                                    Still runs the claim-risk gate: HIGH risk
 *                                    is refused, MED is refused unless ?force=1.
 *   source       string optional   — provenance tag (default: "mc-enqueue")
 *   run_id       string optional   — correlation id (auto-generated if absent)
 *   meta         object optional   — extra metadata stored on the row.
 *                                    System keys (brand, run_id, via, source_*)
 *                                    are reserved and cannot be clobbered.
 *
 * GET query:
 *   status?      pending|scheduled|published|failed|cancelled
 *   brand?       brand filter
 *   limit?       1..50 (default 10)
 *
 * Returns:
 *   POST → { ok, mode: "queued"|"publish_now", post_id?, late_post_id?,
 *            claim_risk_score?, claim_risk_level?, run_id }
 *   GET  → { ok, posts: [{id, content, status, platforms, claim_risk_score,
 *            late_post_id, created_at}], total }
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enqueue, generateRunId } from '@/lib/marketing/queue';
import { createPost, isConfigured } from '@/lib/marketing/late-service';
import { resolveTargets } from '@/lib/marketing/brand-accounts';
import { classifyClaimRisk } from '@/lib/marketing/claim-risk';
import { requireOwner } from '@/lib/command-center/owner-guard';
import type { LatePlatform, MediaItem, PlatformTarget } from '@/lib/marketing/types';

export const runtime = 'nodejs';

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_CONTENT_LEN = 10_000; // well below Late's 63k, sane for all platforms
const VALID_PLATFORMS: ReadonlySet<LatePlatform> = new Set([
  'facebook', 'twitter', 'linkedin', 'tiktok', 'youtube', 'pinterest', 'reddit',
]);
const VALID_BRANDS: ReadonlySet<string> = new Set([
  'Making Miles Matter', "Zebby's World", 'FlashFlow',
]);
// System meta keys callers may not set; prevents provenance tampering.
const RESERVED_META_KEYS = new Set([
  'run_id', 'brand', 'via', 'source_platform', 'draft', 'needs_review',
  'blocked_reason', 'retry_requested', 'retry_flagged_at', 'approved_at',
  'approved_by',
]);

// ── Shared auth: owner OR MC token ───────────────────────────────────────────
async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
  const serviceToken = process.env.MISSION_CONTROL_TOKEN;
  if (serviceToken) {
    const authHeader = request.headers.get('authorization');
    const serviceAuth =
      request.headers.get('x-service-token') || request.headers.get('x-mc-token');
    if (authHeader === `Bearer ${serviceToken}` || serviceAuth === serviceToken) {
      return null; // authorized
    }
  }
  // Fall through to owner session check (returns 404 if not owner).
  return requireOwner(request);
}

function isValidPlatform(p: unknown): p is LatePlatform {
  return typeof p === 'string' && VALID_PLATFORMS.has(p as LatePlatform);
}

function sanitizeMeta(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (RESERVED_META_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function parseMedia(raw: unknown): { ok: true; media: MediaItem[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, media: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'media must be an array' };
  }
  const out: MediaItem[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') {
      return { ok: false, error: 'each media item must be an object' };
    }
    const item = m as Record<string, unknown>;
    const type = item.type;
    const url = item.url;
    if (type !== 'image' && type !== 'video') {
      return { ok: false, error: `media.type must be "image" or "video" (got ${JSON.stringify(type)})` };
    }
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      return { ok: false, error: 'media.url must be an http(s) URL string' };
    }
    out.push({ type, url });
  }
  return { ok: true, media: out };
}

// ── POST: enqueue ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // content
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return NextResponse.json({ error: 'content (non-empty string) is required' }, { status: 400 });
  }
  if (content.length > MAX_CONTENT_LEN) {
    return NextResponse.json(
      { error: `content exceeds ${MAX_CONTENT_LEN} chars (got ${content.length})` },
      { status: 400 },
    );
  }

  // brand
  const brand = typeof body.brand === 'string' ? body.brand.trim() : '';
  if (!brand) {
    return NextResponse.json({ error: 'brand (string) is required' }, { status: 400 });
  }
  if (!VALID_BRANDS.has(brand)) {
    return NextResponse.json(
      { error: `Unknown brand "${brand}". Valid: ${[...VALID_BRANDS].join(', ')}` },
      { status: 400 },
    );
  }

  // platforms
  let platforms: LatePlatform[] | undefined;
  if (body.platforms !== undefined) {
    if (!Array.isArray(body.platforms)) {
      return NextResponse.json({ error: 'platforms must be an array' }, { status: 400 });
    }
    const invalid = body.platforms.filter((p) => !isValidPlatform(p));
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid platforms: ${invalid.join(', ')}. Valid: ${[...VALID_PLATFORMS].join(', ')}`,
        },
        { status: 400 },
      );
    }
    platforms = body.platforms as LatePlatform[];
  }

  // media
  const mediaParse = parseMedia(body.media);
  if (!mediaParse.ok) {
    return NextResponse.json({ error: mediaParse.error }, { status: 400 });
  }
  const media = mediaParse.media;

  const source = typeof body.source === 'string' && body.source.trim()
    ? body.source.trim() : 'mc-enqueue';
  const runId = typeof body.run_id === 'string' && body.run_id.trim()
    ? body.run_id.trim() : generateRunId(source);
  const safeMeta = sanitizeMeta(body.meta);

  // ── Publish-now path ───────────────────────────────────────────────────────
  if (body.publishNow === true) {
    if (!isConfigured()) {
      return NextResponse.json({ error: 'LATE_API_KEY not configured' }, { status: 503 });
    }

    // Apply the claim-risk gate even on the fast path. Never bypass safety.
    const risk = classifyClaimRisk(content);
    if (risk.blocked) {
      return NextResponse.json(
        {
          ok: false,
          error: `Blocked by claim-risk classifier (HIGH: score ${risk.score})`,
          claim_risk_score: risk.score,
          claim_risk_level: risk.level,
          claim_risk_flags: risk.flags,
          run_id: runId,
        },
        { status: 422 },
      );
    }
    // MED risk: require explicit force=1 query flag to acknowledge human-review bypass.
    const force = request.nextUrl.searchParams.get('force') === '1';
    if (risk.needs_review && !force) {
      return NextResponse.json(
        {
          ok: false,
          error: `Claim-risk ${risk.level} (score ${risk.score}) requires review. Re-send with ?force=1 to override.`,
          claim_risk_score: risk.score,
          claim_risk_level: risk.level,
          claim_risk_flags: risk.flags,
          run_id: runId,
        },
        { status: 409 },
      );
    }

    const targets: PlatformTarget[] = await resolveTargets(brand, platforms);
    if (targets.length === 0) {
      return NextResponse.json(
        { error: `No targets resolved for brand="${brand}"` },
        { status: 400 },
      );
    }

    const result = await createPost({
      content,
      mediaItems: media.length > 0 ? media : undefined,
      platforms: targets,
      publishNow: true,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, run_id: runId },
        { status: 502 },
      );
    }

    // Record the publish for auditability even though it bypassed the queue.
    try {
      await supabaseAdmin.from('marketing_posts').insert({
        content,
        media_items: media,
        platforms: targets,
        status: 'published',
        source,
        late_post_id: result.postId,
        claim_risk_score: risk.score,
        claim_risk_flags: risk.flags,
        created_by: source,
        meta: {
          ...safeMeta,
          run_id: runId,
          brand,
          via: 'api/marketing/enqueue:publishNow',
          force_override: force || undefined,
        },
      });
    } catch (err) {
      // Audit insert is best-effort; don't fail the request on it.
      console.warn('[marketing/enqueue] publish_now audit insert failed:', err);
    }

    return NextResponse.json({
      ok: true,
      mode: 'publish_now',
      late_post_id: result.postId,
      claim_risk_score: risk.score,
      claim_risk_level: risk.level,
      run_id: runId,
      targets: targets.map((t) => t.platform),
    });
  }

  // ── Queued path ────────────────────────────────────────────────────────────
  const result = await enqueue({
    content,
    brand,
    source,
    run_id: runId,
    platforms,
    media_items: media.length > 0 ? media : undefined,
    meta: { ...safeMeta, via: 'api/marketing/enqueue' },
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, run_id: runId },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    mode: 'queued',
    post_id: result.post_id,
    claim_risk_score: result.claim_risk_score,
    run_id: runId,
  });
}

// ── GET: list recent posts ───────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status');
  const brand = searchParams.get('brand');
  const limitRaw = parseInt(searchParams.get('limit') || '10', 10);
  const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 10, 50));

  let query = supabaseAdmin
    .from('marketing_posts')
    .select(
      'id, content, status, source, platforms, claim_risk_score, claim_risk_flags, late_post_id, error, meta, created_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  // Match the existing /api/marketing/queue route's JSON filter shape so both
  // endpoints behave identically against the same rows.
  if (brand) query = query.filter('meta->brand', 'eq', JSON.stringify(brand));

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    posts: data || [],
    total: count || 0,
    limit,
  });
}
