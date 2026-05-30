/**
 * POST /api/zebby/posting/dispatch
 *
 * Take Zebby-mode rendered clips and dispatch them to Late.dev across all
 * connected Zebby brand accounts (TikTok, IG-via-FB, Facebook, YouTube,
 * LinkedIn, Twitter). Each platform gets a tuned caption built from the
 * clip's content type via lib/zebby/brand-config:composeZebbyCaption.
 *
 * Compliance lint runs on every caption before dispatch. Any block-tier
 * finding aborts dispatch for that clip with a clear error. Warn-tier
 * findings are surfaced in the response but don't block.
 *
 * Body (one of):
 *   { rendered_clip_ids: string[] }   — explicit clip selection
 *   { run_id: string }                — dispatch every complete clip in a run
 *
 * Optional:
 *   { publish_now?: boolean }         — bypass the queue and publish via Late immediately
 *                                       (default false — drops into the marketing_posts queue)
 *   { platforms?: LatePlatform[] }    — override platform list (default: all enabled Zebby accounts)
 *
 * Returns:
 *   {
 *     ok: true,
 *     dispatched: number,
 *     skipped: number,
 *     results: Array<{
 *       rendered_clip_id, posted: boolean, late_post_id?, error?,
 *       compliance: { blocked: boolean, findings_by_platform: {...} }
 *     }>,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { resolveTargets } from '@/lib/marketing/brand-accounts';
import { createPost, isConfigured } from '@/lib/marketing/late-service';
import {
  composeZebbyCaption,
  ctaForContentType,
  type CaptionContext,
} from '@/lib/zebby/brand-config';
import { lintZebbyText, type ComplianceResult } from '@/lib/zebby/compliance-lint';
import type { LatePlatform } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ZEBBY_BRAND = "Zebby's World";

// Map Late platform names to the caption-context platform names. IG isn't a
// Late platform today (publishes via FB Page graph) so we map FB → both
// 'facebook' and 'instagram' caption variants — but only the FB platform
// target actually gets dispatched.
const LATE_TO_CAPTION: Partial<Record<LatePlatform, CaptionContext['platform']>> = {
  tiktok: 'tiktok',
  youtube: 'shorts',
  facebook: 'facebook',
  // linkedin / twitter / pinterest / reddit fall through to facebook-style
  // captions for now (lighter hashtag mix, conversational tone).
};

interface RequestBody {
  rendered_clip_ids?: string[];
  run_id?: string;
  publish_now?: boolean;
  platforms?: LatePlatform[];
}

interface ClipRow {
  id: string;
  run_id: string;
  candidate_id: string;
  mode: string;
  status: string;
  output_url: string | null;
  template_key: string;
  cta_key: string | null;
  user_id: string;
  // joined from candidates
  clip_type: string | null;
  hook_text: string | null;
  candidate_text: string;
}

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Sign in.', 401, correlationId);
  }

  let body: RequestBody;
  try { body = await request.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  if (!body.rendered_clip_ids?.length && !body.run_id) {
    return createApiErrorResponse(
      'BAD_REQUEST',
      'Provide rendered_clip_ids[] or run_id.',
      400,
      correlationId,
    );
  }

  if (!isConfigured()) {
    return NextResponse.json({
      ok: false,
      error: {
        code: 'LATE_NOT_CONFIGURED',
        message: 'Late.dev is not configured (LATE_API_KEY missing). Cannot dispatch posts.',
      },
      correlation_id: correlationId,
    }, { status: 503 });
  }

  // ── Load the rendered clips + their candidate text/hook ───────────────
  let query = supabaseAdmin
    .from('ve_rendered_clips')
    .select(`
      id, run_id, candidate_id, mode, status, output_url, template_key, cta_key, user_id,
      candidate:ve_clip_candidates!candidate_id ( clip_type, hook_text, text )
    `)
    .eq('user_id', auth.user.id)
    .eq('mode', 'zebby')
    .eq('status', 'complete')
    .not('output_url', 'is', null);

  if (body.rendered_clip_ids?.length) {
    query = query.in('id', body.rendered_clip_ids);
  } else if (body.run_id) {
    query = query.eq('run_id', body.run_id);
  }

  const { data: rawRows, error: clipErr } = await query;
  if (clipErr) {
    return createApiErrorResponse('DB_ERROR', clipErr.message, 500, correlationId);
  }

  const clips: ClipRow[] = (rawRows ?? []).map((r) => {
    const cand = r.candidate as { clip_type?: string | null; hook_text?: string | null; text?: string } | null;
    return {
      id: r.id,
      run_id: r.run_id,
      candidate_id: r.candidate_id,
      mode: r.mode,
      status: r.status,
      output_url: r.output_url,
      template_key: r.template_key,
      cta_key: r.cta_key,
      user_id: r.user_id,
      clip_type: cand?.clip_type ?? null,
      hook_text: cand?.hook_text ?? null,
      candidate_text: cand?.text ?? '',
    };
  });

  if (clips.length === 0) {
    return NextResponse.json({
      ok: true,
      dispatched: 0,
      skipped: 0,
      results: [],
      message: 'No matching Zebby rendered clips found (must be mode=zebby, status=complete, with output_url).',
      correlation_id: correlationId,
    });
  }

  // ── Resolve Zebby brand targets ───────────────────────────────────────
  const allTargets = await resolveTargets(ZEBBY_BRAND, body.platforms);
  if (allTargets.length === 0) {
    return NextResponse.json({
      ok: false,
      error: {
        code: 'NO_TARGETS',
        message: `No enabled Late.dev accounts for brand "${ZEBBY_BRAND}". Check lib/marketing/brand-accounts.ts.`,
      },
      correlation_id: correlationId,
    }, { status: 422 });
  }

  // ── Dispatch each clip ────────────────────────────────────────────────
  const results: Array<{
    rendered_clip_id: string;
    posted: boolean;
    late_post_id?: string;
    error?: string;
    compliance: {
      blocked: boolean;
      findings_by_platform: Record<string, ComplianceResult>;
    };
  }> = [];

  let dispatched = 0;
  let skipped = 0;

  for (const clip of clips) {
    if (!clip.output_url) {
      skipped++;
      results.push({
        rendered_clip_id: clip.id,
        posted: false,
        error: 'Clip has no output_url',
        compliance: { blocked: false, findings_by_platform: {} },
      });
      continue;
    }

    // Derive CTA from clip_type if not pinned on the rendered_clip row
    const ctaKey =
      (clip.cta_key as CaptionContext['ctaKey'] | null) ?? ctaForContentType(clip.clip_type);

    // Build platform-tuned captions + lint each
    const findingsByPlatform: Record<string, ComplianceResult> = {};
    const platformCaptions: Map<LatePlatform, string> = new Map();
    let blockedAny = false;

    for (const target of allTargets) {
      const captionPlatform = LATE_TO_CAPTION[target.platform] ?? 'facebook';
      const caption = composeZebbyCaption({
        platform: captionPlatform,
        ctaKey,
        hookText: clip.hook_text,
      });
      const lint = lintZebbyText(caption);
      findingsByPlatform[target.platform] = lint;
      if (lint.blocked) blockedAny = true;
      platformCaptions.set(target.platform, caption);
    }

    if (blockedAny) {
      skipped++;
      results.push({
        rendered_clip_id: clip.id,
        posted: false,
        error: 'Compliance lint blocked one or more platform captions',
        compliance: { blocked: true, findings_by_platform: findingsByPlatform },
      });
      continue;
    }

    // Late.dev's createPost expects ONE content body shared across platforms.
    // Use the longest caption (most platforms accept hashtag-heavy text) so
    // each platform gets the richest version that fits. If we ever need true
    // per-platform captions we'd dispatch separate posts per target.
    const longestCaption = Array.from(platformCaptions.values())
      .sort((a, b) => b.length - a.length)[0] ?? '';

    try {
      const lateResult = await createPost({
        content: longestCaption,
        mediaItems: [{ type: 'video', url: clip.output_url }],
        platforms: allTargets,
        publishNow: Boolean(body.publish_now),
      });

      if (!lateResult.ok) {
        skipped++;
        results.push({
          rendered_clip_id: clip.id,
          posted: false,
          error: lateResult.error ?? 'Unknown Late.dev error',
          compliance: { blocked: false, findings_by_platform: findingsByPlatform },
        });
        continue;
      }

      dispatched++;
      results.push({
        rendered_clip_id: clip.id,
        posted: true,
        late_post_id: lateResult.postId,
        compliance: { blocked: false, findings_by_platform: findingsByPlatform },
      });
    } catch (err) {
      skipped++;
      results.push({
        rendered_clip_id: clip.id,
        posted: false,
        error: err instanceof Error ? err.message : String(err),
        compliance: { blocked: false, findings_by_platform: findingsByPlatform },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dispatched,
    skipped,
    results,
    correlation_id: correlationId,
  });
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only.' } },
    { status: 405 },
  );
}
