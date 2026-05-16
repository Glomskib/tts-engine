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
    .select('id, avatar_visual_recipe, avatar_visual_refs_json')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!avatar) return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);

  let body: { recipe?: string } = {};
  try { body = await req.json(); } catch {}
  const recipe = (body.recipe || avatar.avatar_visual_recipe || '').slice(0, 1500);
  if (!recipe) return createApiErrorResponse('VALIDATION_ERROR', 'recipe required', 400, correlationId);

  const priorRefs = Array.isArray(avatar.avatar_visual_refs_json) ? avatar.avatar_visual_refs_json : [];
  const consistency = priorRefs.length > 0
    ? 'Maintain the EXACT same person/face/style as previously generated. Same hair, same eyes, same skin tone, same features.'
    : '';
  const prompt = `Generate a photorealistic vertical 9:16 portrait. ${recipe}. ${consistency} Style: natural lighting, head and shoulders, neutral background, friendly expression.`;

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } }),
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

    const urls: string[] = [];
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.some(b => b.name === 'avatar-assets')) {
      await supabaseAdmin.storage.createBucket('avatar-assets', { public: true }).catch(() => {});
    }
    for (let i = 0; i < imageParts.length; i++) {
      const part = imageParts[i];
      const buf = Buffer.from(part.data, 'base64');
      const ext = part.mimeType.includes('png') ? 'png' : 'jpg';
      const path = `${auth.user.id}/avatars/${id}/visual-${Date.now()}-${i}.${ext}`;
      await supabaseAdmin.storage.from('avatar-assets').upload(path, buf, { contentType: part.mimeType, upsert: false });
      const { data: pub } = supabaseAdmin.storage.from('avatar-assets').getPublicUrl(path);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
    }

    const newRefs = [...priorRefs, ...urls];
    await supabaseAdmin
      .from('brand_profiles')
      .update({
        avatar_visual_refs_json: newRefs,
        avatar_visual_reference_url: urls[0] || null,
        setup_status: 'face',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({ ok: true, image_urls: urls, correlation_id: correlationId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Gemini call failed';
    return createApiErrorResponse('UPSTREAM', msg, 502, correlationId);
  }
}
