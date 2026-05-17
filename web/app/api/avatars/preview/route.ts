// Generate an AI-stylized preview of an uploaded reference photo BEFORE saving.
// Customer flow on /avatars/new:
//   1. user uploads photo -> POST here with { reference_image_url }
//   2. returns { preview_url } showing what the avatar will look like as an
//      AI version (professional brand-spokesperson framing, neutral background)
//   3. user sees side-by-side: original + AI preview, picks one
//   4. only THEN does the avatar record get created/saved

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const cid = 'pv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  try {
    const body = await req.json().catch(() => ({}));
    const referenceImageUrl: string | undefined = body?.reference_image_url;
    const stylePrompt: string =
      body?.style_prompt ||
      'Professional brand spokesperson headshot, well-lit clean studio background, looking directly at camera, natural skin tones, neutral expression, photoreal, suitable for marketing videos. Keep the same face identity from the reference.';

    if (!referenceImageUrl) {
      return NextResponse.json({ error: 'reference_image_url required', cid }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY;
    if (!apiKey) {
      console.error('[preview]', cid, 'no api key in env');
      return NextResponse.json({ error: 'image generation not configured', cid }, { status: 503 });
    }

    // Fetch reference image and base64-encode
    let buf: Buffer;
    let mime = 'image/jpeg';
    try {
      const imgRes = await fetch(referenceImageUrl);
      if (!imgRes.ok) {
        console.error('[preview]', cid, 'fetch reference failed', imgRes.status);
        return NextResponse.json({ error: 'could not fetch reference image', status: imgRes.status, cid }, { status: 400 });
      }
      buf = Buffer.from(await imgRes.arrayBuffer());
      mime = imgRes.headers.get('content-type') || 'image/jpeg';
    } catch (e: any) {
      console.error('[preview]', cid, 'fetch reference threw', e?.message);
      return NextResponse.json({ error: 'fetch reference threw', detail: String(e?.message || e), cid }, { status: 400 });
    }

    const b64 = buf.toString('base64');

    // Call Gemini 2.5 Flash Image
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=' + apiKey;
    let gemRes: Response;
    try {
      gemRes = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: stylePrompt }] },
          ],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      });
    } catch (e: any) {
      console.error('[preview]', cid, 'gemini fetch threw', e?.message);
      return NextResponse.json({ error: 'gemini network error', detail: String(e?.message || e), cid }, { status: 502 });
    }

    if (!gemRes.ok) {
      const errText = await gemRes.text();
      console.error('[preview]', cid, 'gemini http', gemRes.status, errText.slice(0, 500));
      return NextResponse.json({ error: 'preview generation failed', status: gemRes.status, detail: errText.slice(0, 300), cid }, { status: 502 });
    }

    const gemJson: any = await gemRes.json().catch(() => null);
    if (!gemJson) {
      console.error('[preview]', cid, 'gemini returned non-JSON');
      return NextResponse.json({ error: 'gemini returned non-JSON', cid }, { status: 502 });
    }
    const parts = gemJson?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) {
      console.error('[preview]', cid, 'gemini no parts', JSON.stringify(gemJson).slice(0, 300));
      return NextResponse.json({ error: 'gemini malformed response', detail: JSON.stringify(gemJson).slice(0, 300), cid }, { status: 502 });
    }
    const partWithImage = parts.find((p: any) => p?.inline_data?.data || p?.inlineData?.data);
    const previewB64: string | undefined = partWithImage?.inline_data?.data || partWithImage?.inlineData?.data;

    if (!previewB64) {
      console.error('[preview]', cid, 'no image in parts', JSON.stringify(parts).slice(0, 300));
      return NextResponse.json({ error: 'gemini returned no image', cid }, { status: 502 });
    }

    return NextResponse.json({ ok: true, preview_url: 'data:image/png;base64,' + previewB64, cid });
  } catch (e: any) {
    console.error('[preview]', cid, 'unhandled', e);
    return NextResponse.json({ error: 'preview failed', detail: String(e?.message || e), cid }, { status: 500 });
  }
}
