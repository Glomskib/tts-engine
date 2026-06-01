/**
 * /api/avatars/[id]/render/publish-ready
 *
 * Bridge 2 — Avatar render → content_items insertion.
 *
 * The "real" render path (vs /render/test which is preview-only).
 *
 *   POST body: { script_id: string }
 *
 * Flow:
 *   1. Look up avatar (brand_profile) + the avatar_script row
 *   2. Submit HeyGen render (talking_photo + voice_clone_id + script body)
 *   3. Poll until completion (reuses pollUntilComplete from @/lib/heygen)
 *   4. Insert content_items row with:
 *        - brand_profile_id (avatar)
 *        - status='ready_to_post'
 *        - source_type='avatar_script'
 *        - source_ref_id=script_id
 *        - final_video_url, caption, hashtags, etc.
 *   5. Stamp the script with render_video_url so the studio UI reflects it
 *   6. Return { ok, content_item_id, final_video_url, heygen_video_id }
 *
 * Errors are surfaced via captureRouteException so the daily cron picks
 * them up in logs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  generateCorrelationId,
  createApiErrorResponse,
} from '@/lib/api-errors';
import { pollUntilComplete } from '@/lib/heygen';
import { captureRouteException } from '@/lib/errorTracking';

export const runtime = 'nodejs';
// HeyGen renders can take a couple of minutes; give the route headroom.
export const maxDuration = 300;

const ROUTE = '/api/avatars/[id]/render/publish-ready';

// HeyGen default voice fallback — matches /render/test
const HEYGEN_DEFAULT_VOICE_ID = 'd7bbcdd6964c47bdaae26decade4a933';

interface AvatarRow {
  id: string;
  user_id: string;
  avatar_display_name: string | null;
  name: string | null;
  heygen_custom_avatar_id: string | null;
  voice_clone_id: string | null;
  voice_provider: string | null;
}

interface ScriptRow {
  id: string;
  user_id: string;
  brand_profile_id: string;
  hook: string | null;
  body: string;
  cta: string | null;
  captions: string | null;
  hashtags: string | null;
  script_type: string | null;
}

/** Parse the freeform hashtags column into a TEXT[] for content_items. */
function parseHashtags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .slice(0, 30);
}

/** Build a caption from hook + body + cta. */
function buildCaption(script: ScriptRow): string {
  const parts: string[] = [];
  if (script.hook) parts.push(script.hook.trim());
  if (script.body) parts.push(script.body.trim());
  if (script.cta) parts.push(script.cta.trim());
  return parts.join('\n\n').slice(0, 2200); // TikTok cap
}

/** Build a short title for the content_items row. */
function buildTitle(avatar: AvatarRow, script: ScriptRow): string {
  const speaker = avatar.avatar_display_name || avatar.name || 'Avatar';
  const hook = (script.hook || script.body || '').slice(0, 80).trim();
  const kind = script.script_type || 'script';
  return `${speaker} — ${kind}: ${hook}`.slice(0, 200);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: avatarId } = await params;
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
  let body: { script_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }
  const scriptId = (body.script_id || '').trim();
  if (!scriptId) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      'script_id required',
      400,
      correlationId,
    );
  }

  // ─── avatar lookup ────────────────────────────────────────────────
  const { data: avatarRaw, error: avatarErr } = await supabaseAdmin
    .from('brand_profiles')
    .select(
      'id, user_id, avatar_display_name, name, heygen_custom_avatar_id, voice_clone_id, voice_provider',
    )
    .eq('id', avatarId)
    .eq('user_id', userId)
    .maybeSingle();
  if (avatarErr) {
    return createApiErrorResponse('DB_ERROR', avatarErr.message, 500, correlationId);
  }
  if (!avatarRaw) {
    return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);
  }
  const avatar = avatarRaw as AvatarRow;

  if (!avatar.heygen_custom_avatar_id) {
    return createApiErrorResponse(
      'PRECONDITION_FAILED',
      'Avatar has no HeyGen talking-photo ID. Upload a real reference photo and register it first.',
      400,
      correlationId,
    );
  }

  // ─── script lookup ────────────────────────────────────────────────
  const { data: scriptRaw, error: scriptErr } = await supabaseAdmin
    .from('avatar_scripts')
    .select(
      'id, user_id, brand_profile_id, hook, body, cta, captions, hashtags, script_type',
    )
    .eq('id', scriptId)
    .eq('user_id', userId)
    .eq('brand_profile_id', avatarId)
    .maybeSingle();
  if (scriptErr) {
    return createApiErrorResponse('DB_ERROR', scriptErr.message, 500, correlationId);
  }
  if (!scriptRaw) {
    return createApiErrorResponse(
      'NOT_FOUND',
      'script not found for this avatar',
      404,
      correlationId,
    );
  }
  const script = scriptRaw as ScriptRow;
  if (!script.body || !script.body.trim()) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      'script body is empty — cannot render',
      400,
      correlationId,
    );
  }

  // Build the spoken line — hook + body + cta (HeyGen caps text inputs).
  const spokenSegments = [script.hook, script.body, script.cta]
    .map((s) => (s || '').trim())
    .filter(Boolean);
  const spokenText = spokenSegments.join(' ').slice(0, 1500);

  // ─── kick off HeyGen render (same shape as /render/test) ──────────
  let heygenVideoId: string;
  try {
    const r = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        video_inputs: [
          {
            character: {
              type: 'talking_photo',
              talking_photo_id: avatar.heygen_custom_avatar_id,
            },
            voice: {
              type: 'text',
              input_text: spokenText,
              voice_id: avatar.voice_clone_id || HEYGEN_DEFAULT_VOICE_ID,
            },
            background: { type: 'color', value: '#ffffff' },
          },
        ],
        dimension: { width: 720, height: 1280 },
        // NOTE: no `test: true` flag here — this is the publish path.
      }),
    });

    if (!r.ok) {
      const upstream = await r.text().catch(() => '');
      const err = new Error(`HeyGen generate ${r.status}: ${upstream.slice(0, 500)}`);
      captureRouteException(err, {
        route: ROUTE,
        jobId: scriptId,
        workspaceId: userId,
        avatarId,
        phase: 'heygen_submit',
        correlationId,
      });
      return createApiErrorResponse(
        'AI_ERROR',
        `HeyGen render submit failed (${r.status}). Try again in a moment.`,
        502,
        correlationId,
      );
    }

    const j = (await r.json()) as { data?: { video_id?: string } };
    if (!j.data?.video_id) {
      const err = new Error('HeyGen returned no video_id');
      captureRouteException(err, {
        route: ROUTE,
        jobId: scriptId,
        workspaceId: userId,
        avatarId,
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
      jobId: scriptId,
      workspaceId: userId,
      avatarId,
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

  // ─── poll until complete (reuse shared helper) ────────────────────
  let finalVideoUrl: string | null = null;
  let durationSec: number | null = null;
  try {
    // 4-minute total budget at 10s intervals — matches lib/heygen defaults.
    const result = await pollUntilComplete(heygenVideoId, 240_000, 10_000);
    finalVideoUrl = result.video_url;
    durationSec = result.duration;
  } catch (err) {
    captureRouteException(err instanceof Error ? err : new Error(String(err)), {
      route: ROUTE,
      jobId: scriptId,
      workspaceId: userId,
      avatarId,
      heygenVideoId,
      phase: 'heygen_poll',
      correlationId,
    });
    // Mark the script as render-failed so the studio UI can show it.
    await supabaseAdmin
      .from('avatar_scripts')
      .update({
        render_run_id: heygenVideoId,
        performance_json: {
          render_error: err instanceof Error ? err.message : String(err),
          failed_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', scriptId)
      .eq('user_id', userId);
    return createApiErrorResponse(
      'AI_ERROR',
      `HeyGen render did not complete: ${err instanceof Error ? err.message : String(err)}`,
      504,
      correlationId,
    );
  }

  if (!finalVideoUrl) {
    captureRouteException(new Error('HeyGen completed with no video_url'), {
      route: ROUTE,
      jobId: scriptId,
      workspaceId: userId,
      avatarId,
      heygenVideoId,
      phase: 'heygen_complete_no_url',
      correlationId,
    });
    return createApiErrorResponse(
      'AI_ERROR',
      'HeyGen completed but returned no video URL.',
      502,
      correlationId,
    );
  }

  // ─── insert content_items row ─────────────────────────────────────
  const title = buildTitle(avatar, script);
  const caption = buildCaption(script);
  const hashtags = parseHashtags(script.hashtags);

  // short_id has a BEFORE INSERT trigger that derives it from id, but the
  // column is NOT NULL — provide a placeholder; the trigger overwrites it.
  const placeholderShortId = `FF-pending-${Date.now().toString(36)}`;

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('content_items')
    .insert({
      workspace_id: userId,
      brand_profile_id: avatarId,
      title,
      status: 'ready_to_post',
      short_id: placeholderShortId,
      final_video_url: finalVideoUrl,
      caption,
      hashtags,
      source_type: 'avatar_script',
      source_ref_id: scriptId,
      script_text: script.body,
      primary_hook: script.hook,
      created_by: userId,
    })
    .select('id, short_id, status')
    .single();

  if (insertErr || !inserted) {
    captureRouteException(
      new Error(`content_items insert failed: ${insertErr?.message || 'unknown'}`),
      {
        route: ROUTE,
        jobId: scriptId,
        workspaceId: userId,
        avatarId,
        heygenVideoId,
        finalVideoUrl,
        phase: 'content_items_insert',
        correlationId,
      },
    );
    return createApiErrorResponse(
      'DB_ERROR',
      `Failed to insert content_items: ${insertErr?.message || 'unknown'}`,
      500,
      correlationId,
    );
  }

  // ─── stamp the script for studio UI ───────────────────────────────
  await supabaseAdmin
    .from('avatar_scripts')
    .update({
      render_run_id: heygenVideoId,
      render_video_url: finalVideoUrl,
      status: 'rendered',
      updated_at: new Date().toISOString(),
    })
    .eq('id', scriptId)
    .eq('user_id', userId);

  return NextResponse.json({
    ok: true,
    content_item_id: inserted.id,
    short_id: inserted.short_id,
    status: inserted.status,
    final_video_url: finalVideoUrl,
    heygen_video_id: heygenVideoId,
    duration_sec: durationSec,
    correlation_id: correlationId,
  });
}
