/**
 * Gemini 2.5 Flash Image — "Nano Banana Pro" wrapper for hyperrealistic
 * image-conditioned generation.
 *
 * Why this matters: HeyGen photo_avatars on a plain background read as
 * "AI demo." Scene-grounded avatars (the same face in a kitchen / on a
 * conference stage / in a retail aisle) read as a real person — and that
 * is what gets followers + brand deals.
 *
 * Auth: GOOGLE_AI_API_KEY (free tier covers initial testing; production
 * needs a paid Google AI Studio key with image generation enabled).
 *
 * Pricing as of 2026-06-09:
 *   ~$0.04 per generated image (output is up to 2048×2048).
 *   Combined with the ~$0.30 HeyGen render, full Quick Video flow costs
 *   ~$0.35 — well within the $29/mo plan margin.
 *
 * Reference:
 *   https://ai.google.dev/gemini-api/docs/image-generation
 *   Model: gemini-2.5-flash-image-preview (the "Nano Banana" branded surface)
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// 2026-06-09: verified against live model list. The marketed "Nano Banana Pro"
// is gemini-3-pro-image (image-conditioned generation, highest quality of the
// image-supporting family). gemini-2.5-flash-image is the cheaper Nano Banana
// (no Pro) — fall back to it if the Pro model 404s on a particular API key
// (some keys only have the older Flash image model enabled).
const GEMINI_MODEL_PRO = 'gemini-3-pro-image';
const GEMINI_MODEL_FLASH = 'gemini-2.5-flash-image';

interface GeminiPart {
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

function apiKey(): string {
  const k = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!k) {
    throw new Error('GOOGLE_AI_API_KEY (or GEMINI_API_KEY) not set — scene generation disabled');
  }
  return k;
}

/**
 * Detect MIME type from a URL extension so Gemini knows what we're sending.
 * Defaults to image/jpeg if we can't tell — Gemini accepts both jpg and png.
 */
function mimeFromUrl(url: string): string {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/**
 * Download an image URL and base64-encode for inline Gemini input.
 * Returns null if the fetch fails so callers can fall back gracefully.
 */
async function fetchAsBase64(imageUrl: string): Promise<{ data: string; mime: string } | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const b64 = Buffer.from(arrayBuf).toString('base64');
    // Prefer the response's reported content-type over the URL extension.
    const ct = res.headers.get('content-type') || '';
    const mime = ct.startsWith('image/') ? ct : mimeFromUrl(imageUrl);
    return { data: b64, mime };
  } catch {
    return null;
  }
}

export interface GenerateScenedImageOpts {
  /** Public URL of the subject's reference face photo. */
  facePhotoUrl: string;
  /** The full scene description prompt — see lib/avatar-scenes.ts buildScenePrompt(). */
  scenePrompt: string;
}

export interface GenerateScenedImageResult {
  /** Base64-encoded PNG. Caller is responsible for uploading to durable storage. */
  imageBase64: string;
  /** Mime type ("image/png"). Stable for the current Gemini surface. */
  mimeType: string;
}

/**
 * Generate a scene-grounded image using Gemini 2.5 Flash Image.
 *
 * The model receives the reference face as an inline image part and the
 * scene description as a text part. It returns a single composited image
 * preserving the subject's identity while placing them in the new scene.
 *
 * Throws on:
 *   - Missing API key
 *   - Fetch of the reference face URL fails (can't read source)
 *   - Gemini API returns non-200
 *   - Response contains no image (safety block, quota exhausted, model error)
 *
 * Caller (the /api/avatars/[id]/scene/generate route) catches and writes
 * a friendly error to scene_register_error on the brand_profile row.
 */
export async function generateScenedAvatarImage(
  opts: GenerateScenedImageOpts,
): Promise<GenerateScenedImageResult> {
  const key = apiKey();

  // 1. Fetch the reference face photo as base64.
  const face = await fetchAsBase64(opts.facePhotoUrl);
  if (!face) {
    throw new Error('Could not fetch the avatar reference photo to send to Gemini');
  }

  // 2. POST to Gemini image generation.
  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: face.mime, data: face.data } },
          { text: opts.scenePrompt },
        ],
      },
    ],
    // generationConfig: Gemini 2.5 Flash Image returns IMAGE by default;
    // no responseModalities tweak needed in current preview.
  };

  // Try the Pro model first (best quality), fall back to Flash if 404.
  // 404 on Pro = key doesn't have access to the Pro model (some Free tier
  // keys only get the cheaper Flash image model).
  const modelsToTry = [GEMINI_MODEL_PRO, GEMINI_MODEL_FLASH];
  let res: Response | null = null;
  let text = '';
  let json: GeminiResponse | null = null;
  let lastModelTried = '';
  for (const model of modelsToTry) {
    lastModelTried = model;
    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    text = await res.text();
    try { json = JSON.parse(text) as GeminiResponse; } catch { json = null; }
    // 404 → try next model. Other errors → bubble up immediately.
    if (res.status !== 404) break;
  }

  if (!res || !res.ok || !json) {
    throw new Error(`Gemini image API ${res?.status} on ${lastModelTried}: ${text.slice(0, 300)}`);
  }
  if (json.error) {
    throw new Error(`Gemini error: ${json.error.message || 'unknown error'}`);
  }
  if (json.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request (${json.promptFeedback.blockReason}). Try a less suggestive scene prompt.`);
  }

  // 3. Pull the image part out of the first candidate.
  const candidate = json.candidates?.[0];
  if (!candidate) {
    throw new Error('Gemini returned no candidates. Try again or pick a different scene.');
  }
  const parts = candidate.content?.parts ?? [];
  const imagePart = parts.find(p => p.inlineData && p.inlineData.mimeType.startsWith('image/'));
  if (!imagePart || !imagePart.inlineData) {
    // Sometimes Gemini falls back to a text-only response (refusal). Surface
    // the text so the caller can tell the user what happened.
    const textPart = parts.find(p => p.text)?.text;
    throw new Error(
      `Gemini did not return an image${textPart ? `: ${textPart.slice(0, 240)}` : '. The scene may have been refused — try a different one.'}`,
    );
  }

  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
  };
}
