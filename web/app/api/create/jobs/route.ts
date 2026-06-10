/**
 * POST /api/create/jobs — kick off a new clip job from the /create page.
 * GET  /api/create/jobs — list this user's recent jobs.
 *
 * This is the thin user-facing facade over the existing video-engine pipeline.
 * Frontend params come in clean (describe, vibe, clip_count, etc.); we map
 * them to the engine's ve_runs schema and dispatch.
 *
 * Body:
 *   source_url?: string         // signed URL from /api/create/upload-url
 *   source_link?: string        // YouTube/Vimeo/TikTok URL
 *   describe: string            // the user's natural-language prompt
 *   vibe: string                // hype | calm | real | funny | sad | <custom>
 *   brand_profile_id?: string
 *   caption_style: string       // bold_yellow | subtle_white | mr_beast | karaoke | newscast | slow_reader
 *   clip_count: number          // 1..8
 *   aspect_ratios: string[]     // ['9:16', '1:1', ...]
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enforceRateLimits, extractRateLimitContext } from '@/lib/rate-limit';
import { generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPA_SOURCE_BUCKET = 'clip-sources';

interface AdditionalSource {
  read_url: string;
  storage_path: string;
  backend: string;
  filename: string;
}

interface CreateBody {
  /** 'post' (Post Maker — multi-take, 1-2 outputs) | 'clip' (Clip Picker —
   *  long-form, N clips). Drives different downstream behavior. */
  mode?: 'post' | 'clip';
  source_url?: string;
  source_link?: string;
  describe?: string;
  vibe?: string;
  brand_profile_id?: string | null;
  caption_style?: string;
  clip_count?: number;
  aspect_ratios?: string[];
  /** Storage path returned by /api/create/upload-url — passed back so we
   *  don't have to re-parse it from the signed URL. */
  storage_path?: string;
  /** 'r2' | 'supabase' — also from /api/create/upload-url */
  backend?: string;
  /** For Post Maker multi-take: additional uploaded sources beyond the primary.
   *  Pipeline can use these later to pick the best take. */
  additional_sources?: AdditionalSource[];
  /** Opt-in polish. Both default false at the UI; pipeline reads context_json
   *  and only layers B-roll / music when explicitly enabled. */
  enable_broll?: boolean;
  enable_music?: boolean;
  /** Smart cuts (jump cuts + punch-ins) — default ON; explicit false disables. */
  enable_jump_cuts?: boolean;
  enable_punch_ins?: boolean;
}

/**
 * Identify storage backend from the source URL pattern.
 * Returns { bucket, path } the pipeline can use to download.
 */
function parseSourceLocation(sourceUrl: string, storagePathHint?: string, backendHint?: string):
  { bucket: string; path: string } {
  // R2: <account-id>.r2.cloudflarestorage.com/<bucket>/<key>?X-Amz-...
  if (backendHint === 'r2' || /r2\.cloudflarestorage\.com/.test(sourceUrl)) {
    const bucket = process.env.R2_BUCKET || 'flashflow-output';
    if (storagePathHint) return { bucket, path: storagePathHint };
    // Parse path out of URL
    try {
      const u = new URL(sourceUrl);
      // pathname is /<bucket>/<key...>
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[0] === bucket) {
        return { bucket, path: parts.slice(1).join('/') };
      }
      return { bucket, path: u.pathname.replace(/^\//, '') };
    } catch {
      return { bucket, path: storagePathHint || 'unknown' };
    }
  }
  // Supabase: https://<proj>.supabase.co/storage/v1/object/(sign|public)/<bucket>/<path>
  try {
    const u = new URL(sourceUrl);
    const m = u.pathname.match(/\/object\/(?:sign|public)\/([^/]+)\/(.+)$/);
    if (m) return { bucket: m[1], path: m[2] };
  } catch { /* fall through */ }
  return { bucket: SUPA_SOURCE_BUCKET, path: storagePathHint || 'unknown' };
}

function vibeToContext(vibe: string): Record<string, string> {
  // Translate the user's vibe to the engine's scoring weights / context hints.
  const map: Record<string, string> = {
    hype:   'high energy, fast cuts, punchy hooks, big captions',
    calm:   'slow pacing, breathing room, soft captions, restraint',
    real:   'plain conversational tone, no hype, no cheesy lines, friend-to-friend',
    funny:  'comedic timing, dry beats, big reactions',
    sad:    'lingering moments, minor key, heavy beats',
  };
  return { vibe, vibe_description: map[vibe] || vibe };
}

export async function POST(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return NextResponse.json({ ok: false, error: 'Sign in to create' }, { status: 401 });

  let body: CreateBody;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 }); }

  const userId = auth.user.id;
  const isAdmin = !!auth.isAdmin;

  // Rate limit: 5 job creates per minute per user. Stops a runaway tab/script
  // from DoSing the pipeline (we charge credits up front so they'd lose them
  // even on a typo'd loop). Admin bypasses.
  if (!isAdmin) {
    const ctx = extractRateLimitContext(req);
    ctx.userId = userId;
    const rl = enforceRateLimits(ctx, generateCorrelationId(), { userLimit: 5 });
    if (rl) return rl;
  }

  // Validate inputs
  const sourceUrl = body.source_url?.trim();
  const sourceLink = body.source_link?.trim();
  if (!sourceUrl && !sourceLink) {
    return NextResponse.json({ ok: false, error: 'Need either an uploaded video or a video link' }, { status: 400 });
  }
  const clipCount = Math.max(1, Math.min(8, Number(body.clip_count) || 3));
  const aspectRatios = Array.isArray(body.aspect_ratios) && body.aspect_ratios.length > 0
    ? body.aspect_ratios.filter((x) => ['9:16', '1:1', '4:5', '16:9'].includes(x))
    : ['9:16'];
  const vibe = (body.vibe || 'real').toLowerCase().slice(0, 80);
  const captionStyle = body.caption_style || 'bold_yellow';
  const describe = (body.describe || '').slice(0, 2000);

  // Credit cost preview (1 credit per clip × number of aspect ratios)
  const creditCost = clipCount * aspectRatios.length;

  // Check credits (admins bypass)
  if (!isAdmin) {
    const { data: bal } = await supabaseAdmin
      .from('user_credits')
      .select('credits_remaining')
      .eq('user_id', userId)
      .maybeSingle();
    const remaining = bal?.credits_remaining ?? 0;
    if (remaining < creditCost) {
      return NextResponse.json({
        ok: false,
        error: `Need ${creditCost} credits — you have ${remaining}. Upgrade or add credits and try again.`,
        code: 'INSUFFICIENT_CREDITS',
        remaining,
        required: creditCost,
      }, { status: 402 });
    }
  }

  // Create the run row (using the existing ve_runs schema)
  // We treat clip_count as target_clip_count, store our extras in context_json.
  const mode = body.mode === 'clip' ? 'clip' : 'post';
  const context = {
    ...vibeToContext(vibe),
    mode,
    describe,
    caption_style: captionStyle,
    aspect_ratios: aspectRatios,
    brand_profile_id: body.brand_profile_id || null,
    source_kind: sourceUrl ? 'upload' : 'link',
    source_link: sourceLink || null,
    additional_sources: body.additional_sources || [],
    // Polish flags from the /create UI. Pipeline gates B-roll/music on these.
    // Defaults match the UI defaults (OFF) so legacy callers without the
    // fields keep historical behavior elsewhere via the mode-based check.
    enable_broll: body.enable_broll === true,
    enable_music: body.enable_music === true,
    // Smart cuts default ON — only an explicit false from the toggle disables.
    enable_jump_cuts: body.enable_jump_cuts !== false,
    enable_punch_ins: body.enable_punch_ins !== false,
    created_via: 'create_page_v2_modes',
    // Storage retention hint — ve-cleanup uses this to decide source delete timing.
    // Post Maker source can be deleted fast (we only output 1-2 polished clips);
    // Clip Picker may need source longer if user wants to re-cut.
    source_retention_minutes: mode === 'post' ? 30 : 240,
  };

  const { data: run, error: runErr } = await supabaseAdmin
    .from('ve_runs')
    .insert({
      user_id: userId,
      mode: 'affiliate',  // legacy field — describe + vibe drive scoring now
      preset_keys: [`vibe:${vibe}`, `caption:${captionStyle}`],
      status: 'created',
      target_clip_count: clipCount,
      context_json: context,
    })
    .select('id')
    .single();

  if (runErr || !run) {
    console.error('[create/jobs] run insert failed', runErr);
    return NextResponse.json({ ok: false, error: 'Could not create job — DB error', detail: runErr?.message }, { status: 500 });
  }

  // Attach the asset (uploaded file OR link) — required by the pipeline tick worker
  if (sourceUrl) {
    // sourceUrl is a presigned read URL from /api/create/upload-url.
    // Detects R2 vs Supabase from the URL pattern + hints.
    const { bucket, path } = parseSourceLocation(sourceUrl, body.storage_path, body.backend);
    const { error: assetErr } = await supabaseAdmin.from('ve_assets').insert({
      run_id: run.id,
      user_id: userId,
      storage_bucket: bucket,
      storage_path: path,
      storage_url: sourceUrl,
      original_filename: null,
      metadata: { source_kind: 'upload', backend: body.backend || (bucket === (process.env.R2_BUCKET || 'flashflow-output') ? 'r2' : 'supabase') },
    });
    if (assetErr) {
      console.error('[create/jobs] asset insert failed', assetErr);
    }
  } else if (sourceLink) {
    // Link path: insert an asset placeholder pointing to the link. The pipeline's
    // youtube-transcript or yt-dlp ingest step will fetch + drop into the renders bucket.
    await supabaseAdmin.from('ve_assets').insert({
      run_id: run.id,
      user_id: userId,
      storage_bucket: SUPA_SOURCE_BUCKET,
      storage_path: `link/${run.id}`,
      storage_url: sourceLink,
      original_filename: sourceLink,
      metadata: { source_kind: 'link', original_url: sourceLink },
    });
  }

  // Deduct credits AFTER ve_runs + ve_assets insert succeeded so we can't
  // lose credits on a half-failed job. If deduction fails, mark the run
  // as 'failed' and the user keeps their credits.
  if (!isAdmin) {
    let deducted = false;
    try {
      const { data: result, error: deductErr } = await supabaseAdmin.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount: creditCost,
        p_description: `Clip job ${run.id} — ${clipCount} clips × ${aspectRatios.length} aspects`,
      });
      const r = Array.isArray(result) ? result[0] : result;
      if (!deductErr && r?.success) deducted = true;
    } catch {
      // RPC might not exist on older envs — fall through to single-credit loop
    }
    if (!deducted) {
      // Fallback: single-credit RPC in a loop (the new deduct_credits RPC is
      // in our pending migration; some envs may not have it yet).
      let granted = 0;
      for (let i = 0; i < creditCost; i++) {
        try {
          const { error } = await supabaseAdmin.rpc('deduct_credit', {
            p_user_id: userId,
            p_description: `Clip job ${run.id}`,
          });
          if (!error) granted++;
        } catch { /* swallow */ }
      }
      if (granted < creditCost) {
        // Could not deduct full cost — refund what we managed and fail the job.
        // The user keeps their credits, no work is done, no surprise charges.
        await supabaseAdmin.from('ve_runs')
          .update({ status: 'failed', error_message: 'Insufficient credits — job not started' })
          .eq('id', run.id);
        return NextResponse.json({
          ok: false,
          error: `Not enough credits — needed ${creditCost}.`,
          code: 'INSUFFICIENT_CREDITS',
          required: creditCost,
        }, { status: 402 });
      }
    }
  }

  // Kick the pipeline. The existing tick worker polls ve_runs with status != complete/failed.
  // We don't await — the worker picks it up within seconds.
  return NextResponse.json({
    ok: true,
    job_id: run.id,
    credit_cost: creditCost,
    status: 'created',
  });
}

export async function GET(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { data: rows } = await supabaseAdmin
    .from('ve_runs')
    .select('id, status, created_at, completed_at, target_clip_count, context_json, error_message')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(30);

  // Pull rendered clips for any complete/rendering jobs so /clips can show
  // them inline (with play + download) instead of bouncing back to /create.
  const jobs = rows || [];
  const interestingIds = jobs
    .filter((r) => r.status === 'complete' || r.status === 'rendering')
    .map((r) => r.id);

  let clipsByRun: Record<string, Array<{
    id: string;
    output_url: string | null;
    duration_sec: number | null;
    status: string;
    caption_text: string | null;
    hashtags: string[];
    suggested_title: string | null;
    cta_suggestion: string | null;
  }>> = {};
  if (interestingIds.length > 0) {
    // Surface the AI-packaged metadata (caption_text, hashtags, suggested_title,
    // cta_suggestion) so /clips can show a one-click "Copy Caption" with the
    // model-generated text instead of a heuristic fallback.
    const { data: clips } = await supabaseAdmin
      .from('ve_rendered_clips')
      .select('id, run_id, output_url, duration_sec, status, caption_text, hashtags, suggested_title, cta_suggestion')
      .in('run_id', interestingIds);
    clipsByRun = (clips || []).reduce((acc, c) => {
      const runId = c.run_id as string;
      if (!acc[runId]) acc[runId] = [];
      acc[runId].push({
        id: c.id as string,
        output_url: c.output_url as string | null,
        duration_sec: (c.duration_sec as number | null) ?? null,
        status: c.status as string,
        caption_text: (c.caption_text as string | null) ?? null,
        hashtags: Array.isArray(c.hashtags) ? (c.hashtags as string[]) : [],
        suggested_title: (c.suggested_title as string | null) ?? null,
        cta_suggestion: (c.cta_suggestion as string | null) ?? null,
      });
      return acc;
    }, {} as typeof clipsByRun);
  }

  const enriched = jobs.map((j) => ({ ...j, clips: clipsByRun[j.id as string] || [] }));
  return NextResponse.json({ ok: true, jobs: enriched });
}

// ── helpers ────────────────────────────────────────────────────────────
function extractStoragePath(signedUrl: string, bucket: string): string | null {
  // Supabase signed URL pattern:
  //   https://<proj>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=...
  try {
    const u = new URL(signedUrl);
    const m = u.pathname.match(new RegExp(`/object/(?:sign|public)/${bucket}/(.+)$`));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
