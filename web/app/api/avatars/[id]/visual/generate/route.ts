/**
 * POST /api/avatars/[id]/visual/generate
 *
 * Generate a portrait via Gemini 2.5 Flash Image (Nano Banana).
 *
 * Body:
 *   { recipe?: string, reference_image_url?: string }
 *
 * If reference_image_url is provided, the image is included in the prompt as
 * a multimodal vision input, anchoring the generation to that person's face.
 * The optional recipe text tweaks the output (pose, setting, expression).
 *
 * Behavior:
 *   - No reference, recipe only → generates from text (legacy path)
 *   - Reference + no recipe   → generates "same person, head-and-shoulders portrait"
 *   - Reference + recipe       → generates the same person with the recipe applied
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return createApiErrorResponse('CONFIG', 'GEMINI_API_KEY not configured — add it in Vercel env to use Nano Banana visual generation', 503, correlationId);

  const { data: avatar } = await supabaseAdmin
    .from('brand_profiles')
    .select('id, avatar_visual_recipe, avatar_visual_refs_json, avatar_visual_reference_url')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!avatar) return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);

  let body: { recipe?: string; reference_image_url?: string } = {};
  try { body = await req.json(); } catch {}

  const recipe = (body.recipe || '').slice(0, 1500);
  const refUrl = body.reference_image_url || avatar.avatar_visual_reference_url || null;

  if (!recipe && !refUrl) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Need at least a recipe or reference_image_url', 400, correlationId);
  }

  // Build the prompt
  let textPrompt: string;
  if (refUrl) {
    textPrompt = recipe
      ? `Generate a photorealistic vertical 9:16 portrait of the EXACT same person shown in the reference image — same face, same hair, same eyes, same skin tone, same features. ${recipe}. Style: natural lighting, head and shoulders, modern UGC content style.`
      : `Generate a photorealistic vertical 9:16 portrait of the EXACT same person shown in the reference image — same face, same hair, same eyes, same skin tone, same features. Style: natural lighting, head and shoulders, neutral background, friendly expression.`;
  } else {
    textPrompt = `Generate a photorealistic vertical 9:16 portrait. ${recipe}. Style: natural lighting, head and shoulders, neutral background, friendly expression.`;
  }

  // Build the parts array — optionally include reference image as multimodal input
  const parts: unknown[] = [];
  if (refUrl) {
    try {
      const imgRes = await fetch(refUrl);
      if (imgRes.ok) {
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        const buf = Buffer.from(await imgRes.arrayBuffer());
        if (buf.length < 7 * 1024 * 1024) { // 7MB safety cap
          parts.push({
            inlineData: {
              mimeType: contentType,
              data: buf.toString('base64'),
            },
          });
        }
      }
    } catch { /* fall through to text-only */ }
  }
  parts.push({ text: textPrompt });

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return createApiErrorResponse('UPSTREAM', `Gemini ${r.status}: ${txt.slice(0, 300)}`, 502, correlationId);
    }
    const json = await r.json() as { candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] }[] } };
    const imageParts: { data: string; mimeType: string }[] = [];
    for (const cand of json.candidates || []) {
      for (const p of cand.content?.parts || []) if (p.inlineData) imageParts.push(p.inlineData);
    }
    if (imageParts.length === 0) return createApiErrorResponse('UPSTREAM', 'Gemini returned no image data', 502, correlationId);

    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.some(b => b.name === 'avatar-assets')) {
      await supabaseAdmin.storage.createBucket('avatar-assets', { public: true }).catch(() => {});
    }

    const urls: string[] = [];
    for (let i = 0; i < imageParts.length; i++) {
      const part = imageParts[i];
      const buf = Buffer.from(part.data, 'base64');
      const ext = part.mimeType.includes('png') ? 'png' : 'jpg';
      const path = `${auth.user.id}/avatars/${id}/visual-${Date.now()}-${i}.${ext}`;
      await supabaseAdmin.storage.from('avatar-assets').upload(path, buf, { contentType: part.mimeType, upsert: false });
      const { data: pub } = supabaseAdmin.storage.from('avatar-assets').getPublicUrl(path);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
    }

    const priorRefs = Array.isArray(avatar.avatar_visual_refs_json) ? avatar.avatar_visual_refs_json : [];
    const newRefs = [...priorRefs, ...urls];
    await supabaseAdmin
      .from('brand_profiles')
      .update({
        avatar_visual_refs_json: newRefs,
        avatar_visual_reference_url: urls[0] || avatar.avatar_visual_reference_url || null,
        setup_status: 'face',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({
      ok: true,
      image_urls: urls,
      used_reference: !!refUrl,
      correlation_id: correlationId,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Gemini call failed';
    return createApiErrorResponse('UPSTREAM', msg, 502, correlationId);
  }
}
