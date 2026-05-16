/**
 * /api/avatars/[id]/scenes
 *   GET — list scenes for this avatar
 *   POST — generate scenes for given tags via Nano Banana
 *
 * POST body: { tags: string[] }
 * Each tag spawns one Gemini call that emphasizes consistency with the
 * avatar's prior visual references.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TAG_RECIPES: Record<string, string> = {
  kitchen: 'in a sunlit modern kitchen, soft warm light, holding a coffee mug, casual',
  outdoors: 'outside in natural daylight, soft golden hour, casual outdoor setting',
  desk: 'seated at a clean modern desk, laptop visible, soft office light',
  gym: 'in a clean gym setting, water bottle, athletic wear, soft side light',
  cafe: 'in a cozy cafe, warm ambient light, casual coffee shop background',
  car: 'in a clean car, daylight, casual seated position',
  studio: 'in a soft-lit photo studio, neutral background, professional',
  walking: 'walking outdoors, dynamic but natural pose, soft daylight',
  product: 'holding a small product in hand, neutral background, soft front light',
  selfie: 'taking a selfie close to camera, soft natural light, casual',
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const { data, error } = await supabaseAdmin
    .from('avatar_scenes')
    .select('id, scene_tag, description, image_url, motion_video_url, is_default, created_at')
    .eq('user_id', auth.user.id)
    .eq('brand_profile_id', id)
    .order('created_at', { ascending: false });
  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  return NextResponse.json({ ok: true, scenes: data || [], correlation_id: correlationId });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return createApiErrorResponse('CONFIG', 'GEMINI_API_KEY missing', 503, correlationId);

  const { data: avatar } = await supabaseAdmin
    .from('brand_profiles')
    .select('id, avatar_display_name, name, avatar_visual_recipe, avatar_visual_reference_url, avatar_visual_refs_json')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!avatar) return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);

  let body: { tags?: string[] };
  try { body = await req.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  const tags = (body.tags || []).map(t => t.toLowerCase().trim()).filter(Boolean).slice(0, 10);
  if (tags.length === 0) return createApiErrorResponse('VALIDATION_ERROR', 'tags required', 400, correlationId);

  const baseDescription = avatar.avatar_visual_recipe || avatar.avatar_display_name || avatar.name || 'a person';
  const priorRefs = Array.isArray(avatar.avatar_visual_refs_json) ? avatar.avatar_visual_refs_json : [];
  const consistencyHint = priorRefs.length > 0
    ? `IMPORTANT: maintain the EXACT same person/face/style as the previously generated character refs. Same hair, same eyes, same skin tone, same age, same features.`
    : '';

  const generated: { id: string; scene_tag: string; image_url: string }[] = [];

  for (const tag of tags) {
    const recipe = TAG_RECIPES[tag] || tag;
    const prompt = `Generate a photorealistic vertical 9:16 portrait of ${baseDescription}, ${recipe}. ${consistencyHint} Style: natural lighting, candid, modern UGC content style, slightly imperfect for realism.`;

    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      });
      if (!r.ok) continue;
      const json = await r.json() as { candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] }[] } };
      const part = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;
      if (!part) continue;
      const buf = Buffer.from(part.data, 'base64');
      const ext = part.mimeType.includes('png') ? 'png' : 'jpg';
      const path = `${auth.user.id}/avatars/${id}/scene-${tag}-${Date.now()}.${ext}`;

      // Ensure bucket
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      if (!buckets?.some(b => b.name === 'avatar-assets')) {
        await supabaseAdmin.storage.createBucket('avatar-assets', { public: true }).catch(() => {});
      }
      await supabaseAdmin.storage.from('avatar-assets').upload(path, buf, { contentType: part.mimeType, upsert: false });
      const { data: pub } = supabaseAdmin.storage.from('avatar-assets').getPublicUrl(path);
      const imageUrl = pub?.publicUrl;
      if (!imageUrl) continue;

      const { data: row } = await supabaseAdmin
        .from('avatar_scenes')
        .insert({
          user_id: auth.user.id,
          brand_profile_id: id,
          scene_tag: tag,
          description: recipe,
          image_url: imageUrl,
          storage_path: path,
          generator: 'gemini-nano-banana',
          generation_params: { tag, recipe, prior_ref_count: priorRefs.length },
        })
        .select('id, scene_tag, image_url')
        .single();
      if (row) generated.push(row);
    } catch { /* skip this tag, continue */ }
  }

  return NextResponse.json({ ok: true, scenes: generated, correlation_id: correlationId });
}
