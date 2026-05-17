// /api/avatars/preview
//
// Upload-photo → AI-preview flow:
//   1. Client POSTs { reference_image_url } (a Supabase Storage URL of the
//      original upload, OR a temp-uploaded URL).
//   2. We auth the user via the Supabase session.
//   3. Download reference (up to 12MB), base64-encode, send to Gemini 2.5
//      Flash Image Preview with a brand-spokesperson stylization prompt.
//   4. Upload Gemini's output PNG to Supabase Storage:
//        avatar-assets/{userId}/previews/{uuid}.png
//   5. Return { preview_url, reference_url } so the UI can show original ↔ AI
//      side-by-side. The user then picks which one to save as the avatar's
//      avatar_visual_reference_url.
//
// We deliberately return a URL not a data URI — keeps the response tiny so it
// never bumps into Vercel's 4.5MB response body limit. Previews live in storage
// until the user picks one (or a cleanup cron sweeps them after 7 days).

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_REFERENCE_BYTES = 12 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const cid = 'pv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  try {
    // --- auth ---
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (all) => all.forEach((c) => cookieStore.set(c.name, c.value, c.options)),
        },
      },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized', cid }, { status: 401 });

    // --- input ---
    const body = await req.json().catch(() => ({}));
    const referenceImageUrl: string | undefined = body?.reference_image_url;
    const stylePrompt: string =
      body?.style_prompt ||
      'Professional brand spokesperson headshot. Same person, same face identity from the reference photo. Clean studio background, well-lit, looking directly at camera, natural skin tones, neutral expression, photoreal, suitable for marketing videos.';
    if (!referenceImageUrl) {
      return NextResponse.json({ error: 'reference_image_url required', cid }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'image generation not configured', cid }, { status: 503 });
    }

    // --- fetch reference ---
    let refBuf: Buffer;
    let refMime = 'image/jpeg';
    try {
      const r = await fetch(referenceImageUrl);
      if (!r.ok) {
        return NextResponse.json({ error: 'could not fetch reference image', status: r.status, cid }, { status: 400 });
      }
      refBuf = Buffer.from(await r.arrayBuffer());
      if (refBuf.byteLength > MAX_REFERENCE_BYTES) {
        return NextResponse.json({ error: 'reference image too large', size: refBuf.byteLength, max: MAX_REFERENCE_BYTES, cid }, { status: 413 });
      }
      refMime = r.headers.get('content-type') || refMime;
    } catch (e: any) {
      return NextResponse.json({ error: 'fetch reference threw', detail: String(e?.message || e), cid }, { status: 400 });
    }

    // --- call Gemini ---
    let gemRes: Response;
    try {
      gemRes = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=' + apiKey,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inlineData: { mimeType: refMime, data: refBuf.toString('base64') } },
                { text: stylePrompt },
              ],
            }],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
        },
      );
    } catch (e: any) {
      return NextResponse.json({ error: 'gemini network error', detail: String(e?.message || e), cid }, { status: 502 });
    }
    if (!gemRes.ok) {
      const errText = await gemRes.text().catch(() => '');
      return NextResponse.json({ error: 'preview generation failed', status: gemRes.status, detail: errText.slice(0, 300), cid }, { status: 502 });
    }
    const gemJson: any = await gemRes.json().catch(() => null);
    const parts: any[] = gemJson?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p?.inlineData?.data);
    const previewB64: string | undefined = imgPart?.inlineData?.data;
    if (!previewB64) {
      return NextResponse.json({ error: 'gemini returned no image', cid }, { status: 502 });
    }

    // --- upload preview to Supabase Storage ---
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const previewBuf = Buffer.from(previewB64, 'base64');
    const previewId = randomUUID();
    const path = `${user.id}/previews/${previewId}.png`;
    const { error: upErr } = await admin.storage
      .from('avatar-assets')
      .upload(path, previewBuf, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false,
      });
    if (upErr) {
      return NextResponse.json({ error: 'preview upload failed', detail: upErr.message, cid }, { status: 500 });
    }
    const { data: pub } = admin.storage.from('avatar-assets').getPublicUrl(path);
    const previewUrl = pub.publicUrl;

    return NextResponse.json({
      ok: true,
      preview_url: previewUrl,
      reference_url: referenceImageUrl,
      cid,
    });
  } catch (e: any) {
    console.error('[preview]', cid, 'unhandled', e?.message || e);
    return NextResponse.json({ error: 'preview failed', detail: String(e?.message || e), cid }, { status: 500 });
  }
}
