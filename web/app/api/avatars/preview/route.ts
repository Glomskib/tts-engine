// Generate an AI-stylized preview of an uploaded reference photo BEFORE saving.
// Customer flow on /avatars/new:
//   1. user uploads photo → POST here with { reference_image_url }
//   2. returns { preview_url } showing what the avatar will look like as an
//      AI version (professional brand-spokesperson framing, neutral background)
//   3. user sees side-by-side: their original ↔ AI preview, picks one
//   4. only THEN does the avatar record get created/saved
//
// We use Gemini 2.5 Flash Image (multimodal — same model the visual/generate
// endpoint uses). Cheap, fast, gives a controllable headshot.

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const referenceImageUrl: string | undefined = body?.reference_image_url;
    const stylePrompt: string =
      body?.style_prompt ||
      'Professional brand spokesperson headshot, well-lit clean studio background, looking directly at camera, natural skin tones, neutral expression, photoreal, suitable for marketing videos. Keep the same face identity from the reference.';

    if (!referenceImageUrl) {
      return NextResponse.json({ error: 'reference_image_url required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'image generation not configured' }, { status: 503 });
    }

    // Fetch reference image and base64-encode
    const imgRes = await fetch(referenceImageUrl);
    if (!imgRes.ok) {
      return NextResponse.json({ error: 'could not fetch reference image' }, { status: 400 });
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const b64 = buf.toString('base64');
    const mime = imgRes.headers.get('content-type') || 'image/jpeg';

    // Call Gemini 2.5 Flash Image with the reference photo
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;
    const gemRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mime, data: b64 } },
              { text: stylePrompt },
            ],
          },
        ],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    });

    if (!gemRes.ok) {
      const err = await gemRes.text();
      console.error('[avatar-preview] gemini error', gemRes.status, err.slice(0, 500));
      return NextResponse.json({ error: 'preview generation failed', detail: err.slice(0, 200) }, { status: 502 });
    }

    const gemJson: any = await gemRes.json();
    const partWithImage = gemJson?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inline_data?.data);
    const previewB64: string | undefined = partWithImage?.inline_data?.data;

    if (!previewB64) {
      return NextResponse.json({ error: 'preview model returned no image' }, { status: 502 });
    }

    // Return as data URI; the client decides whether to use it inline or upload to R2.
    const dataUri = `data:image/png;base64,${previewB64}`;
    return NextResponse.json({ ok: true, preview_url: dataUri });
  } catch (e: any) {
    console.error('[avatar-preview] failed', e);
    return NextResponse.json({ error: 'preview failed', detail: String(e?.message || e) }, { status: 500 });
  }
}
