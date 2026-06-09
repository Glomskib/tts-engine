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
 * 2026-06-01: errors are now persisted to brand_profiles.heygen_register_*
 * columns instead of silently failing. The /avatars page heal loop used to
 * call this with `.catch(() => {})` which swallowed everything — users saw
 * "Processing photo" forever with no diagnosis. Now we write status to the
 * row so the UI can show "HeyGen rejected" with the actual error text.
 *
 * Also: if the source URL has query params / auth (Gemini Nano Banana,
 * signed S3, etc.) HeyGen can't fetch it. We re-host to our public
 * avatar-assets bucket before calling HeyGen — see rehostToPublicBucket().
 *
 * Idempotent: if heygen_custom_avatar_id is already set, returns 200 with
 * skipped=true unless ?force=true is passed.
 *
 * Cap: after 5 failed attempts we refuse to retry unless ?force=true so the
 * heal loop on /avatars doesn't spam HeyGen forever on permanently bad URLs.
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

const MAX_ATTEMPTS = 5;

/**
 * HeyGen needs to fetch the image_url from its own servers. If our URL is
 * gated by query-string auth (Gemini, signed S3, presigned Supabase), CORS,
 * or otherwise short-lived, HeyGen's fetch will fail. We sniff for that
 * pattern and re-host the image to our public avatar-assets bucket so HeyGen
 * gets a clean, publicly-fetchable, no-query-string URL.
 *
 * Returns the original URL if it already looks safe to send to HeyGen.
 */
async function rehostIfRisky(opts: {
  imageUrl: string;
  userId: string;
  avatarId: string;
}): Promise<{ url: string; rehosted: boolean }> {
  let parsed: URL;
  try { parsed = new URL(opts.imageUrl); } catch {
    // Bad URL — return as-is and let HeyGen reject it. The error path will
    // capture the message.
    return { url: opts.imageUrl, rehosted: false };
  }

  const hasQuery = parsed.search.length > 0;
  const isOurAvatarBucket =
    /\/storage\/v1\/object\/public\/avatar-assets\//.test(parsed.pathname);

  // If it's already our public bucket and has no query string, ship it.
  if (isOurAvatarBucket && !hasQuery) {
    return { url: opts.imageUrl, rehosted: false };
  }

  // Otherwise re-host. Download the bytes, upload to a deterministic path
  // under avatar-assets, return the public URL.
  const resp = await fetch(opts.imageUrl);
  if (!resp.ok) {
    throw new Error(`Could not download source image (${resp.status}) to re-host for HeyGen`);
  }
  const contentType = resp.headers.get('content-type') || 'image/png';
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg'
            : contentType.includes('webp') ? 'webp'
            : 'png';
  const arrayBuf = await resp.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);

  const path = `${opts.userId}/avatars/${opts.avatarId}/heygen-input-${Date.now()}.${ext}`;

  // Make sure the bucket exists (idempotent).
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.some(b => b.name === 'avatar-assets')) {
    await supabaseAdmin.storage.createBucket('avatar-assets', { public: true }).catch(() => {});
  }

  const { error: upErr } = await supabaseAdmin.storage
    .from('avatar-assets')
    .upload(path, bytes, { contentType, upsert: true });
  if (upErr) {
    throw new Error(`Re-host upload failed: ${upErr.message}`);
  }
  const { data: pub } = supabaseAdmin.storage.from('avatar-assets').getPublicUrl(path);
  if (!pub?.publicUrl) {
    throw new Error('Re-host succeeded but no public URL minted');
  }
  return { url: pub.publicUrl, rehosted: true };
}

/**
 * Recognize HeyGen tier-restriction errors so we can tell the user
 * something useful instead of a raw 403 dump.
 */
function classifyHeygenError(rawMsg: string): string {
  const lower = rawMsg.toLowerCase();
  if (lower.includes('403') ||
      lower.includes('tier') ||
      lower.includes('plan') ||
      lower.includes('not allowed') ||
      lower.includes('upgrade') ||
      lower.includes('subscription')) {
    return `HeyGen plan tier does not include photo avatars. Upgrade to Pro+ to use this feature. (Original: ${rawMsg.slice(0, 200)})`;
  }
  if (lower.includes('400') &&
      (lower.includes('image') || lower.includes('url') || lower.includes('fetch'))) {
    return `HeyGen could not fetch or read the source image. Try uploading a fresh JPG/PNG. (Original: ${rawMsg.slice(0, 200)})`;
  }
  return rawMsg;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = generateCorrelationId();
  const { id: avatarId } = await params;

  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) {
    return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);
  }

  // Optional body: { imageUrl?, force? }. Also accept ?force=true on the URL
  // since the UI retry button uses that form.
  let body: { imageUrl?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const urlForce = req.nextUrl.searchParams.get('force') === 'true';
  const force = !!body.force || urlForce;

  // Load the avatar — must belong to the user.
  // 2026-06-09: also read scene_image_url. When set (after Scene Library
  // applied via /api/avatars/[id]/scene/generate), we register the scene-
  // grounded image with HeyGen instead of the bare face — produces avatar
  // speaking IN a context (convention / kitchen / gym) instead of on a
  // plain background. This is the AICreatorLab wedge for AI influencers.
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('brand_profiles')
    .select('id, user_id, avatar_display_name, name, avatar_visual_reference_url, scene_image_url, scene_preset, heygen_custom_avatar_id, heygen_register_status, heygen_register_attempts, is_avatar')
    .eq('id', avatarId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (profileErr || !profile) {
    return createApiErrorResponse('NOT_FOUND', 'Avatar not found', 404, correlationId);
  }

  // Prefer the scene-grounded image when present — that's what gives us the
  // hyperrealistic "speaking on stage / in their kitchen" look. Fall back
  // to the bare face when no scene has been applied yet.
  const imageUrl = body.imageUrl || profile.scene_image_url || profile.avatar_visual_reference_url;
  if (!imageUrl) {
    return createApiErrorResponse('VALIDATION_ERROR', 'No photo URL on this avatar — upload one first', 400, correlationId);
  }

  // Already registered? Skip unless force.
  if (profile.heygen_custom_avatar_id && !force) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Avatar already has heygen_custom_avatar_id; pass force=true to re-register.',
      heygen_custom_avatar_id: profile.heygen_custom_avatar_id,
      correlation_id: correlationId,
    });
  }

  // Early-bail: if we've already tried 5+ times and it's been failing, stop
  // hammering HeyGen on what's almost certainly a permanent error (bad URL,
  // tier issue, banned content). User has to explicitly force-retry.
  const attemptsSoFar = profile.heygen_register_attempts || 0;
  if (!force && attemptsSoFar >= MAX_ATTEMPTS && profile.heygen_register_status === 'failed') {
    return NextResponse.json({
      ok: false,
      error: `HeyGen registration has failed ${attemptsSoFar} times — pass ?force=true to retry`,
      attempts: attemptsSoFar,
      correlation_id: correlationId,
    }, { status: 429 });
  }

  const displayName = (profile.avatar_display_name || profile.name || `avatar-${avatarId.slice(0, 8)}`).slice(0, 80);

  // Mark "processing" + bump attempt counter before we call HeyGen, so the
  // UI sees the most recent attempt timestamp even if we crash mid-flight.
  await supabaseAdmin
    .from('brand_profiles')
    .update({
      heygen_register_status: 'processing',
      heygen_register_attempted_at: new Date().toISOString(),
      heygen_register_attempts: attemptsSoFar + 1,
      heygen_register_error: null,
    })
    .eq('id', avatarId);

  try {
    // Step 0: ensure HeyGen can actually fetch this URL. If it's signed /
    // query-stringed / from a non-public host, re-host to our public bucket
    // first. (This was the most likely failure mode for Gemini-generated
    // photos that landed in /avatars with query-param auth.)
    const { url: safeUrl, rehosted } = await rehostIfRisky({
      imageUrl,
      userId: auth.user.id,
      avatarId,
    });

    const result = await registerPhotoAvatar({ imageUrl: safeUrl, name: displayName });

    // Save the new photo_avatar_id back to the row + update setup_status +
    // clear the error state.
    const { error: updErr } = await supabaseAdmin
      .from('brand_profiles')
      .update({
        heygen_custom_avatar_id: result.photoAvatarId,
        setup_status: 'photo_registered',
        heygen_register_status: 'success',
        heygen_register_error: null,
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
      rehosted,
      correlation_id: correlationId,
    });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const friendlyMsg = classifyHeygenError(rawMsg);
    const truncated = friendlyMsg.slice(0, 500);

    // Persist the error so the UI can show it as a "HeyGen rejected" badge
    // instead of a silent forever-spinner.
    await supabaseAdmin
      .from('brand_profiles')
      .update({
        heygen_register_status: 'failed',
        heygen_register_error: truncated,
      })
      .eq('id', avatarId);

    return createApiErrorResponse('AI_ERROR', truncated, 502, correlationId);
  }
}
