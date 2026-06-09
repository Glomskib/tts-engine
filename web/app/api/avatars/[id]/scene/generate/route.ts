/**
 * POST /api/avatars/[id]/scene/generate
 *
 * Generate a hyperrealistic scene-grounded image of this avatar's face placed
 * into a pre-defined scene (see lib/avatar-scenes.ts). Uses Gemini 2.5 Flash
 * Image (Nano Banana Pro) for image-conditioned composition.
 *
 * Body:
 *   { scene_key: string }       — one of AVATAR_SCENES[*].key
 *   OR { custom_prompt: string } — power-user override (skips library)
 *
 * Returns:
 *   { ok: true, scene_image_url, scene_preset }
 *
 * After this completes successfully, the caller should re-register the
 * avatar with HeyGen via POST /api/avatars/[id]/heygen/register-photo?force=true
 * so HeyGen animates the new scene-grounded image.
 *
 * The new image is uploaded to the avatar-assets bucket so HeyGen can fetch
 * it without query-string signed-URL contention (this was a real prior bug
 * — see lib/heygen-photo-avatar.ts comments).
 *
 * Synchronous: Gemini generation is fast (~3-8s). The endpoint blocks and
 * returns the new URL. Cap-protected at MAX_ATTEMPTS=5 so a permanently
 * failing scene doesn't drain credits.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { generateScenedAvatarImage } from '@/lib/gemini-image';
import { getSceneByKey, buildScenePrompt } from '@/lib/avatar-scenes';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = generateCorrelationId();
  const { id: avatarId } = await params;

  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) {
    return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);
  }

  let body: { scene_key?: string; custom_prompt?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is allowed */ }
  const force = !!body.force || req.nextUrl.searchParams.get('force') === 'true';

  // Load the avatar — must belong to the user.
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('brand_profiles')
    .select('id, user_id, avatar_display_name, name, avatar_visual_reference_url, scene_image_url, scene_preset, scene_register_attempts, scene_register_status')
    .eq('id', avatarId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (profileErr || !profile) {
    return createApiErrorResponse('NOT_FOUND', 'Avatar not found', 404, correlationId);
  }

  if (!profile.avatar_visual_reference_url) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Upload a face photo for this avatar first', 400, correlationId);
  }

  // Resolve the prompt — either from the library or a custom override.
  let scenePrompt: string;
  let scenePresetKey: string | null = null;
  if (body.scene_key) {
    const scene = getSceneByKey(body.scene_key);
    if (!scene) {
      return createApiErrorResponse('VALIDATION_ERROR', `Unknown scene: ${body.scene_key}`, 400, correlationId);
    }
    scenePresetKey = scene.key;
    scenePrompt = buildScenePrompt(scene);
  } else if (body.custom_prompt && body.custom_prompt.trim().length > 0) {
    scenePresetKey = 'custom';
    scenePrompt = body.custom_prompt.trim();
  } else {
    return createApiErrorResponse('VALIDATION_ERROR', 'Provide scene_key or custom_prompt', 400, correlationId);
  }

  // Cap retries on the same avatar so a failing scene doesn't burn Gemini
  // credits indefinitely. Force flag bypasses.
  const attemptsSoFar = profile.scene_register_attempts || 0;
  if (!force && attemptsSoFar >= MAX_ATTEMPTS && profile.scene_register_status === 'failed') {
    return NextResponse.json({
      ok: false,
      error: `Scene generation has failed ${attemptsSoFar} times — pass force=true to retry`,
      attempts: attemptsSoFar,
      correlation_id: correlationId,
    }, { status: 429 });
  }

  // Mark "processing" + bump attempts so the UI can show a friendly state.
  await supabaseAdmin
    .from('brand_profiles')
    .update({
      scene_register_status: 'processing',
      scene_register_attempted_at: new Date().toISOString(),
      scene_register_attempts: attemptsSoFar + 1,
      scene_register_error: null,
      scene_preset: scenePresetKey,
    })
    .eq('id', avatarId);

  try {
    // 1. Generate the composed image via Gemini.
    const { imageBase64, mimeType } = await generateScenedAvatarImage({
      facePhotoUrl: profile.avatar_visual_reference_url,
      scenePrompt,
    });
    const ext = mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
    const bytes = Buffer.from(imageBase64, 'base64');

    // 2. Upload to the public avatar-assets bucket so HeyGen can fetch
    //    without signed-URL headaches. Bucket lazy-creation is idempotent.
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.some(b => b.name === 'avatar-assets')) {
      await supabaseAdmin.storage.createBucket('avatar-assets', { public: true }).catch(() => {});
    }
    const path = `${auth.user.id}/avatars/${avatarId}/scene-${scenePresetKey}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from('avatar-assets')
      .upload(path, bytes, { contentType: mimeType, upsert: true });
    if (upErr) {
      throw new Error(`Could not upload scene image: ${upErr.message}`);
    }
    const { data: pub } = supabaseAdmin.storage.from('avatar-assets').getPublicUrl(path);
    const sceneImageUrl = pub?.publicUrl;
    if (!sceneImageUrl) {
      throw new Error('Storage upload succeeded but no public URL was minted');
    }

    // 3. Persist to brand_profiles.
    await supabaseAdmin
      .from('brand_profiles')
      .update({
        scene_image_url: sceneImageUrl,
        scene_preset: scenePresetKey,
        scene_register_status: 'success',
        scene_register_error: null,
        // Once the scene image is set, clear the existing heygen_custom_avatar_id
        // so the next register-photo call uses the new scene-grounded image.
        heygen_custom_avatar_id: null,
        heygen_register_status: null,
        heygen_register_attempts: 0,
      })
      .eq('id', avatarId);

    return NextResponse.json({
      ok: true,
      scene_image_url: sceneImageUrl,
      scene_preset: scenePresetKey,
      attempts: attemptsSoFar + 1,
      correlation_id: correlationId,
    });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const truncated = rawMsg.slice(0, 500);
    await supabaseAdmin
      .from('brand_profiles')
      .update({
        scene_register_status: 'failed',
        scene_register_error: truncated,
      })
      .eq('id', avatarId);
    return createApiErrorResponse('SCENE_GENERATION_ERROR', truncated, 502, correlationId);
  }
}
