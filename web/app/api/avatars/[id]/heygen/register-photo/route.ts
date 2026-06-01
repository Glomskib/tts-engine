/**
 * POST /api/avatars/[id]/heygen/register-photo
 *
 * Takes the avatar's existing avatar_visual_reference_url (or one passed in
 * the body), calls HeyGen's photo_avatar API to register it as a usable
 * custom avatar, and saves the resulting photo_avatar_id into
 * brand_profiles.heygen_custom_avatar_id. After this completes successfully,
 * subsequent renders for this avatar will use the user's actual face instead
 * of HeyGen's stock "Daisy" avatar.
 *
 * 2026-05-31: this was the missing piece in the /avatars/new flow. See
 * web/lib/heygen-photo-avatar.ts for the full backstory.
 *
 * Idempotent: if heygen_custom_avatar_id is already set, returns 200 with
 * skipped=true unless ?force=true is passed.
 *
 * Synchronous: the HeyGen generation can take 30–90s. We block the response
 * until it's done so the UI can update the badge in one shot. Callers SHOULD
 * fire this in the background and poll the avatar row, or kick it from a
 * worker, rather than making the user stare at a 90s spinner.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { registerPhotoAvatar } from '@/lib/heygen-photo-avatar';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = generateCorrelationId();
  const { id: avatarId } = await params;

  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) {
    return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);
  }

  // Optional body: { imageUrl?, force? }
  let body: { imageUrl?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  // Load the avatar — must belong to the user.
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('brand_profiles')
    .select('id, user_id, avatar_display_name, name, avatar_visual_reference_url, heygen_custom_avatar_id, is_avatar')
    .eq('id', avatarId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (profileErr || !profile) {
    return createApiErrorResponse('NOT_FOUND', 'Avatar not found', 404, correlationId);
  }

  const imageUrl = body.imageUrl || profile.avatar_visual_reference_url;
  if (!imageUrl) {
    return createApiErrorResponse('VALIDATION_ERROR', 'No photo URL on this avatar — upload one first', 400, correlationId);
  }

  // Already registered? Skip unless force.
  if (profile.heygen_custom_avatar_id && !body.force) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Avatar already has heygen_custom_avatar_id; pass force=true to re-register.',
      heygen_custom_avatar_id: profile.heygen_custom_avatar_id,
      correlation_id: correlationId,
    });
  }

  const displayName = (profile.avatar_display_name || profile.name || `avatar-${avatarId.slice(0, 8)}`).slice(0, 80);

  try {
    const result = await registerPhotoAvatar({ imageUrl, name: displayName });

    // Save the new photo_avatar_id back to the row + update setup_status.
    // We only update known columns — `heygen_image_key` would be useful for
    // re-use but isn't part of the current brand_profiles schema, so we leave
    // it off the update payload to avoid 42703 column-not-found errors.
    const { error: updErr } = await supabaseAdmin
      .from('brand_profiles')
      .update({
        heygen_custom_avatar_id: result.photoAvatarId,
        setup_status: 'photo_registered',
      })
      .eq('id', avatarId);

    if (updErr) {
      // HeyGen succeeded but DB write failed — surface the id so the client
      // can retry the DB update separately rather than re-burn HeyGen credits.
      return NextResponse.json({
        ok: false,
        error: `HeyGen registration succeeded but DB update failed: ${updErr.message}`,
        heygen_custom_avatar_id: result.photoAvatarId,
        correlation_id: correlationId,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      heygen_custom_avatar_id: result.photoAvatarId,
      image_key: result.imageKey ?? null,
      source: result.source,
      correlation_id: correlationId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return createApiErrorResponse('HEYGEN_ERROR', msg, 502, correlationId);
  }
}
