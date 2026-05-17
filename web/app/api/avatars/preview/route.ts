// /api/avatars/preview
// AI-stylized preview of an uploaded reference photo BEFORE saving the avatar.
// Mirrors web/app/api/avatars/[id]/visual/generate/route.ts exactly.

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 4MB cap to keep memory safe

export async function POST(req: NextRequest) {
  const cid = 'pv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  try {
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
      console.error('[preview]', cid, 'no api key');
      return NextResponse.json({ error: 'image generation not configured', cid }, { status: 503 });
    }

    // Step 1: fetch reference image
    let buf: Buffer;
    let mimeType = 'image/jpeg';
    try {
      const imgRes = await fetch(referenceImageUrl);
      if (!imgRes.ok) {
        console.error('[preview]', cid, 'fetch reference status', imgRes.status);
        return NextResponse.json({ error: 'could not fetch reference image', status: imgRes.status, cid }, { status: 400 });
      }
      buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.byteLength > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: 'reference image too large', size: buf.byteLength, max: MAX_IMAGE_BYTES, cid }, { status: 413 });
      }
      mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
    } catch (e: any) {
      console.error('[preview]', cid, 'fetch reference threw', e?.message);
      return NextResponse.json({ error: 'fetch reference threw', detail: String(e?.message || e), cid }, { status: 400 });
    }

    const dataB64 = buf.toString('base64');

    // Step 2: call Gemini 2.5 Flash Image Preview with camelCase keys (the
    // shape /api/avatars/[id]/visual/generate uses and is known to work).
    const apiUrl =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=' +
      apiKey;

    let gemRes: Response;
    try {
      gemRes = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inlineData: { mimeType, data: dataB64 } },
                { text: stylePrompt },
              ],
            },
          ],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      });
    } catch (e: any) {
      console.error('[preview]', cid, 'gemini fetch threw', e?.message);
      return NextResponse.json({ error: 'gemini network error', detail: String(e?.message || e), cid }, { status: 502 });
    }

    if (!gemRes.ok) {
      const errText = await gemRes.text().catch(() => '');
      console.error('[preview]', cid, 'gemini http', gemRes.status, errText.slice(0, 500));
      return NextResponse.json(
        { error: 'preview generation failed', status: gemRes.status, detail: errText.slice(0, 300), cid },
        { status: 502 },
      );
    }

    const gemJson: any = await gemRes.json().catch(() => null);
    if (!gemJson) {
      console.error('[preview]', cid, 'gemini returned non-JSON');
      return NextResponse.json({ error: 'gemini non-JSON response', cid }, { status: 502 });
    }

    const parts: any[] = gemJson?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p?.inlineData?.data);
    const previewB64: string | undefined = imgPart?.inlineData?.data;

    if (!previewB64) {
      console.error('[preview]', cid, 'no image in parts', JSON.stringify(parts).slice(0, 200));
      return NextResponse.json({ error: 'gemini returned no image', cid }, { status: 502 });
    }

    return NextResponse.json({ ok: true, preview_url: 'data:image/png;base64,' + previewB64, cid });
  } catch (e: any) {
    console.error('[preview]', cid, 'unhandled', e?.message || e);
    return NextResponse.json({ error: 'preview failed', detail: String(e?.message || e), cid }, { status: 500 });
  }
}
