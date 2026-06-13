/**
 * /api/avatars/render/multi
 *
 * Multi-avatar (multi-character) HeyGen render entry point.
 *
 * HeyGen's /v2/video/generate accepts a `video_inputs` ARRAY where each
 * element has its own character + voice + text. This route exposes that
 * capability — a HUGE differentiator since most AI avatar tools are
 * single-character only.
 *
 *   POST body:
 *     {
 *       avatars: [
 *         { avatar_id: <brand_profile uuid>, voice_id?: string, text: string },
 *         ...
 *       ],
 *       aspect_ratio?: '9:16' | '16:9' | '1:1',
 *       dimension?:   { width, height },   // explicit override
 *       title?:       string,              // optional content_items.title
 *     }
 *
 * Flow:
 *   1. Auth (same pattern as /render/test + /render/publish-ready).
 *   2. Validate: 2-6 avatar segments, each text ≤1500 chars (HeyGen per-input cap).
 *   3. Look up every brand_profile in one query; must belong to this user and
 *      have `heygen_custom_avatar_id` set.
 *   4. Build the `video_inputs` array — each segment gets the avatar's
 *      heygen_custom_avatar_id and (voice_id override || voice_clone_id || default).
 *   5. POST to HeyGen — returns immediately with { video_id }.
 *   6. Insert a content_items row with status='processing', source_type='avatar_multi',
 *      brand_profile_id = primary speaker, avatar_ids = full list.
 *   7. Return { ok, content_item_id, heygen_video_id }.
 *
 * NOTE: we don't poll here — multi-avatar renders are notably slower than
 * single-character ones (HeyGen does each character separately then composites).
 * The cron poller / status endpoint will flip the row to ready_to_post once HeyGen
 * is done. This keeps the API response snappy.
 *
 * Credit gating: same shape as the rest of the avatar render surface. We use
 * requireCredits as a gate; we don't deduct here because publish-ready also
 * doesn't deduct (the centralized engine handles that elsewhere) — keeping
 * parity. Multi-avatar burns N× credits at the provider level; we charge the
 * user 1 credit per avatar via the explicit useCredit loop below.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  generateCorrelationId,
  createApiErrorResponse,
} from '@/lib/api-errors';
import { captureRouteException } from '@/lib/errorTracking';
import { requireCredits, useCredit } from '@/lib/credits';
import { resolveHeyGenBackground } from '@/lib/avatar-environments';
import type { EnvironmentSelection } from '@/lib/avatar-environments';

export const runtime = 'nodejs';
// We don't poll — submission only. 60s is plenty for the HeyGen POST.
export const maxDuration = 60;

const ROUTE = '/api/avatars/render/multi';

// HeyGen default voice fallback — matches /render/test + /render/publish-ready
const HEYGEN_DEFAULT_VOICE_ID = 'd7bbcdd6964c47bdaae26decade4a933';

// HeyGen per-character input_text cap.
const HEYGEN_TEXT_MAX = 1500;

// Multi-avatar guardrails — HeyGen technically allows more but rendering time
// explodes past ~6 characters and so does credit burn. Keep MVP tight.
const MIN_AVATARS = 2;
const MAX_AVATARS = 6;

interface IncomingSegment {
  avatar_id?: string;
  voice_id?: string;
  text?: string;
}

interface ResolvedSegment {
  avatar_id: string;          // brand_profile uuid
  heygen_avatar_id: string;   // HeyGen talking_photo / avatar_id
  voice_id: string;           // resolved (override || clone || default)
  text: string;               // trimmed + length-capped
  display_name: string;
}

interface AvatarRow {
  id: string;
  user_id: string;
  avatar_display_name: string | null;
  name: string | null;
  heygen_custom_avatar_id: string | null;
  voice_clone_id: string | null;
  avatar_environment_json?: EnvironmentSelection | null;
}

/** Map a friendly aspect_ratio to HeyGen dimensions (vertical/horizontal/square). */
function dimensionFor(aspect: string | undefined): { width: number; height: number } {
  switch (aspect) {
    case '16:9': return { width: 1280, height: 720 };
    case '1:1':  return { width: 1080, height: 1080 };
    case '9:16':
    default:     return { width: 720,  height: 1280 }; // TikTok/Reels/Shorts default
  }
}

export async function POST(req: NextRequest) {
  const correlationId = generateCorrelationId();

  // ─── auth ─────────────────────────────────────────────────────────
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) {
    return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);
  }
  const userId = auth.user.id;

  // ─── env ──────────────────────────────────────────────────────────
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    return createApiErrorResponse(
      'CONFIG_ERROR',
      'Render unavailable — HEYGEN_API_KEY not configured.',
      503,
      correlationId,
    );
  }

  // ─── body ─────────────────────────────────────────────────────────
  let body: {
    avatars?: IncomingSegment[];
    aspect_ratio?: string;
    dimension?: { width?: number; height?: number };
    title?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  const segmentsIn = Array.isArray(body.avatars) ? body.avatars : [];
  if (segmentsIn.length < MIN_AVATARS) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      `Need at least ${MIN_AVATARS} avatar segments for a multi-avatar render. Use the single-avatar flow for one speaker.`,
      400,
      correlationId,
    );
  }
  if (segmentsIn.length > MAX_AVATARS) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      `Too many avatar segments (max ${MAX_AVATARS}). Split into multiple videos.`,
      400,
      correlationId,
    );
  }

  // Per-segment validation
  for (let i = 0; i < segmentsIn.length; i++) {
    const seg = segmentsIn[i];
    if (!seg || typeof seg !== 'object') {
      return createApiErrorResponse('VALIDATION_ERROR', `Segment ${i} is not an object`, 400, correlationId);
    }
    if (!seg.avatar_id || typeof seg.avatar_id !== 'string') {
      return createApiErrorResponse('VALIDATION_ERROR', `Segment ${i} missing avatar_id`, 400, correlationId);
    }
    if (!seg.text || typeof seg.text !== 'string' || !seg.text.trim()) {
      return createApiErrorResponse('VALIDATION_ERROR', `Segment ${i} has empty text`, 400, correlationId);
    }
  }

  // ─── credit gate ──────────────────────────────────────────────────
  // Multi-avatar burns 1 credit per character (HeyGen renders each separately).
  // Gate the user once first — if they're out, no point hitting HeyGen.
  const gate = await requireCredits(userId, auth.isAdmin === true);
  if (gate) {
    return createApiErrorResponse(
      'INSUFFICIENT_CREDITS',
      `${gate.error} (multi-avatar render costs ${segmentsIn.length} credits).`,
      gate.status,
      correlationId,
    );
  }

  // ─── avatar lookup (single query, IN list) ────────────────────────
  const avatarIds = [...new Set(segmentsIn.map((s) => s.avatar_id!))];
  const { data: avatarRows, error: avatarErr } = await supabaseAdmin
    .from('brand_profiles')
    .select('id, user_id, avatar_display_name, name, heygen_custom_avatar_id, voice_clone_id, avatar_environment_json')
    .in('id', avatarIds)
    .eq('user_id', userId);

  if (avatarErr) {
    return createApiErrorResponse('DB_ERROR', avatarErr.message, 500, correlationId);
  }

  const avatarsById = new Map<string, AvatarRow>(
    (avatarRows as AvatarRow[] | null || []).map((a) => [a.id, a]),
  );

  // Confirm every requested avatar exists and has a HeyGen ID.
  for (const id of avatarIds) {
    const a = avatarsById.get(id);
    if (!a) {
      return createApiErrorResponse('NOT_FOUND', `Avatar ${id} not found (or not yours).`, 404, correlationId);
    }
    if (!a.heygen_custom_avatar_id) {
      return createApiErrorResponse(
        'PRECONDITION_FAILED',
        `Avatar "${a.avatar_display_name || a.name || id}" has no HeyGen ID. Upload a real reference photo and register it first.`,
        400,
        correlationId,
      );
    }
  }

  // ─── build resolved segments (preserves order) ────────────────────
  const segments: ResolvedSegment[] = segmentsIn.map((s) => {
    const a = avatarsById.get(s.avatar_id!)!;
    return {
      avatar_id: a.id,
      heygen_avatar_id: a.heygen_custom_avatar_id!,
      voice_id: (s.voice_id || a.voice_clone_id || HEYGEN_DEFAULT_VOICE_ID).trim(),
      text: s.text!.trim().slice(0, HEYGEN_TEXT_MAX),
      display_name: a.avatar_display_name || a.name || 'Avatar',
    };
  });

  // ─── build HeyGen request ─────────────────────────────────────────
  const dim = body.dimension?.width && body.dimension?.height
    ? { width: body.dimension.width, height: body.dimension.height }
    : dimensionFor(body.aspect_ratio);

  const heygenBody = {
    video_inputs: segments.map((seg) => ({
      character: {
        type: 'talking_photo' as const,
        talking_photo_id: seg.heygen_avatar_id,
      },
      voice: {
        type: 'text' as const,
        input_text: seg.text,
        voice_id: seg.voice_id,
      },
      background: resolveHeyGenBackground(
        avatarsById.get(seg.avatar_id)?.avatar_environment_json,
      ),
    })),
    dimension: dim,
  };

  // ─── POST to HeyGen ───────────────────────────────────────────────
  let heygenVideoId: string;
  try {
    const r = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(heygenBody),
    });

    if (!r.ok) {
      const upstream = await r.text().catch(() => '');
      captureRouteException(new Error(`HeyGen multi generate ${r.status}: ${upstream.slice(0, 500)}`), {
        route: ROUTE,
        workspaceId: userId,
        phase: 'heygen_submit',
        correlationId,
      });
      // Common: free/starter plans don't allow multi-character renders.
      const planHint = r.status === 403 || r.status === 402
        ? ' (multi-avatar may require a higher HeyGen plan tier)'
        : '';
      return createApiErrorResponse(
        'AI_ERROR',
        `HeyGen multi-avatar render failed (${r.status})${planHint}.`,
        502,
        correlationId,
      );
    }

    const j = (await r.json()) as { data?: { video_id?: string } };
    if (!j.data?.video_id) {
      captureRouteException(new Error('HeyGen returned no video_id (multi)'), {
        route: ROUTE,
        workspaceId: userId,
        phase: 'heygen_submit',
        correlationId,
      });
      return createApiErrorResponse(
        'AI_ERROR',
        'HeyGen returned no video_id. Try again.',
        502,
        correlationId,
      );
    }
    heygenVideoId = j.data.video_id;
  } catch (err) {
    captureRouteException(err instanceof Error ? err : new Error(String(err)), {
      route: ROUTE,
      workspaceId: userId,
      phase: 'heygen_submit_throw',
      correlationId,
    });
    return createApiErrorResponse(
      'AI_ERROR',
      `HeyGen submit threw: ${err instanceof Error ? err.message : String(err)}`,
      502,
      correlationId,
    );
  }

  // ─── deduct credits (1 per avatar — HeyGen charges per character) ─
  if (auth.isAdmin !== true) {
    for (let i = 0; i < segments.length; i++) {
      const deduct = await useCredit(
        userId,
        false,
        1,
        `Multi-avatar render (${segments.length} characters)`,
      );
      if (!deduct.success) {
        // We've already committed to HeyGen — log but don't fail the response.
        // The render is happening; the user's wallet is just slightly off.
        captureRouteException(new Error(`Multi-avatar credit deduct failed on segment ${i}: ${deduct.error}`), {
          route: ROUTE,
          workspaceId: userId,
          phase: 'credit_deduct',
          correlationId,
        });
        break;
      }
    }
  }

  // ─── insert content_items row (status=processing) ─────────────────
  const primary = segments[0];
  const title = (body.title || '').toString().trim().slice(0, 200)
    || `Multi-avatar: ${segments.map((s) => s.display_name).join(' + ').slice(0, 160)}`;

  // Concatenated transcript for caption/script_text — handy for review + search.
  const transcript = segments
    .map((s) => `${s.display_name}: ${s.text}`)
    .join('\n\n')
    .slice(0, 2200);

  const placeholderShortId = `FF-multi-${Date.now().toString(36)}`;

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('content_items')
    .insert({
      workspace_id: userId,
      brand_profile_id: primary.avatar_id,  // primary speaker for grouping
      title,
      status: 'processing',
      short_id: placeholderShortId,
      caption: transcript,
      script_text: transcript,
      primary_hook: segments[0].text.slice(0, 200),
      source_type: 'avatar_multi',
      source_ref_id: heygenVideoId,
      avatar_ids: segments.map((s) => s.avatar_id),
      created_by: userId,
    })
    .select('id, short_id, status')
    .single();

  if (insertErr || !inserted) {
    // HeyGen render is in-flight; we just couldn't write the row. Surface
    // the HeyGen video_id so the caller can recover.
    captureRouteException(
      new Error(`content_items insert failed (multi): ${insertErr?.message || 'unknown'}`),
      {
        route: ROUTE,
        workspaceId: userId,
        heygenVideoId,
        phase: 'content_items_insert',
        correlationId,
      },
    );
    return NextResponse.json({
      ok: true,
      // No content_item_id, but render is happening — caller can poll HeyGen directly.
      heygen_video_id: heygenVideoId,
      warning: `Render kicked off but DB write failed: ${insertErr?.message || 'unknown'}`,
      correlation_id: correlationId,
    }, { status: 207 }); // Multi-Status — partial success
  }

  return NextResponse.json({
    ok: true,
    content_item_id: inserted.id,
    short_id: inserted.short_id,
    status: inserted.status,
    heygen_video_id: heygenVideoId,
    avatar_count: segments.length,
    primary_avatar_id: primary.avatar_id,
    avatar_ids: segments.map((s) => s.avatar_id),
    dimension: dim,
    correlation_id: correlationId,
  });
}
