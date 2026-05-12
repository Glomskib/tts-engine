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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE_BUCKET = 'clip-sources';
const RENDERS_BUCKET = 'renders'; // existing engine writes here

interface CreateBody {
  source_url?: string;
  source_link?: string;
  describe?: string;
  vibe?: string;
  brand_profile_id?: string | null;
  caption_style?: string;
  clip_count?: number;
  aspect_ratios?: string[];
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
  const context = {
    ...vibeToContext(vibe),
    describe,
    caption_style: captionStyle,
    aspect_ratios: aspectRatios,
    brand_profile_id: body.brand_profile_id || null,
    source_kind: sourceUrl ? 'upload' : 'link',
    source_link: sourceLink || null,
    created_via: 'create_page_v1',
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
    // sourceUrl is a Supabase signed read URL from /api/create/upload-url
    const { error: assetErr } = await supabaseAdmin.from('ve_assets').insert({
      run_id: run.id,
      user_id: userId,
      storage_bucket: SOURCE_BUCKET,
      storage_path: extractStoragePath(sourceUrl, SOURCE_BUCKET) || 'unknown',
      storage_url: sourceUrl,
      original_filename: null,
      metadata: { source_kind: 'upload' },
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
      storage_bucket: SOURCE_BUCKET,
      storage_path: `link/${run.id}`,
      storage_url: sourceLink,
      original_filename: sourceLink,
      metadata: { source_kind: 'link', original_url: sourceLink },
    });
  }

  // Deduct credits up front (refunded if job fails before transcription)
  if (!isAdmin) {
    try {
      await supabaseAdmin.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount: creditCost,
        p_description: `Clip job ${run.id} — ${clipCount} clips × ${aspectRatios.length} aspects`,
      });
    } catch {
      // Fall back to single-credit RPC in a loop if multi-credit fn doesn't exist
      // (the new deduct_credits RPC is in our pending migration; some envs may
      // not have it yet).
      for (let i = 0; i < creditCost; i++) {
        try {
          await supabaseAdmin.rpc('deduct_credit', { p_user_id: userId, p_description: `Clip job ${run.id}` });
        } catch { /* best-effort */ }
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
    .select('id, status, created_at, completed_at, target_clip_count, context_json')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(30);

  return NextResponse.json({ ok: true, jobs: rows || [] });
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
