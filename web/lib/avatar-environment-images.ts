/**
 * Avatar environment image generation + caching.
 *
 * Generates environment-ONLY background images (no people) using Gemini
 * text→image, uploads them to R2 for durable public URLs, and caches them
 * in `avatar_environment_assets` so every "office" background is generated
 * once and reused across all avatars.
 *
 * The `plain` preset never generates an image — it resolves to a solid color
 * directly in resolveHeyGenBackground.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { presignR2Url, isR2Configured } from '@/lib/storage/r2';
import { environmentImagePrompt, getEnvironmentPreset } from '@/lib/avatar-environments';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// Text→image model — no reference image needed (environment-only prompt).
const GEMINI_MODEL = 'gemini-2.5-flash-image';

function geminiApiKey(): string {
  const k = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GOOGLE_AI_API_KEY (or GEMINI_API_KEY) not set');
  return k;
}

/** Gemini text→image: returns base64 image data + mime type. */
async function generateEnvironmentImage(
  presetId: string,
): Promise<{ data: string; mime: string }> {
  const prompt = environmentImagePrompt(presetId);
  if (!prompt) {
    throw new Error(`Preset "${presetId}" has no image prompt (plain preset generates no image).`);
  }

  const key = geminiApiKey();
  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini image API ${res.status}: ${text.slice(0, 300)}`);
  }

  let json: {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
    error?: { message?: string };
  };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
  }

  if (json.error) throw new Error(`Gemini error: ${json.error.message || 'unknown'}`);
  if (json.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request (${json.promptFeedback.blockReason})`);
  }

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData && p.inlineData.mimeType.startsWith('image/'));
  if (!imagePart?.inlineData) {
    const textPart = parts.find((p) => p.text)?.text;
    throw new Error(
      `Gemini did not return an image${textPart ? `: ${textPart.slice(0, 240)}` : '.'}`,
    );
  }

  return { data: imagePart.inlineData.data, mime: imagePart.inlineData.mimeType };
}

/**
 * Upload an environment image (base64) to R2 and return the public URL.
 * Falls back to Supabase Storage if R2 is not configured.
 */
async function uploadEnvironmentImage(
  presetId: string,
  imageBase64: string,
  mime: string,
): Promise<string> {
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const filename = `environments/${presetId}-${Date.now()}.${ext}`;
  const buf = Buffer.from(imageBase64, 'base64');

  if (isR2Configured()) {
    // Upload via presigned PUT to R2
    const putUrl = presignR2Url({
      method: 'PUT',
      key: filename,
      expiresInSec: 300,
      contentType: mime,
    });
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mime },
      body: buf,
    });
    if (!putRes.ok) {
      throw new Error(`R2 upload failed: ${putRes.status} ${await putRes.text().catch(() => '')}`);
    }
    // R2 public URL: strip query string from presigned URL (they share the same path)
    const endpoint = process.env.R2_ENDPOINT!.replace(/\/$/, '');
    const bucket = process.env.R2_BUCKET!;
    // Use the R2 public domain if set, else fall back to endpoint path
    const publicBase = process.env.R2_PUBLIC_URL
      ? process.env.R2_PUBLIC_URL.replace(/\/$/, '')
      : `${endpoint}/${bucket}`;
    return `${publicBase}/${filename}`;
  }

  // Supabase Storage fallback (same pattern as /api/avatars/[id]/scenes)
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === 'avatar-assets')) {
    await supabaseAdmin.storage
      .createBucket('avatar-assets', { public: true })
      .catch(() => {});
  }
  await supabaseAdmin.storage
    .from('avatar-assets')
    .upload(filename, buf, { contentType: mime, upsert: true });
  const { data: pub } = supabaseAdmin.storage.from('avatar-assets').getPublicUrl(filename);
  if (!pub?.publicUrl) throw new Error('Supabase storage upload returned no publicUrl');
  return pub.publicUrl;
}

/**
 * Check the cache table for an existing environment image.
 * Returns the cached URL, or null if not found.
 */
async function getCachedEnvironmentUrl(presetId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('avatar_environment_assets')
    .select('image_url')
    .eq('preset_id', presetId)
    .maybeSingle();
  return data?.image_url ?? null;
}

/**
 * Persist a generated environment image URL to the cache table.
 */
async function cacheEnvironmentUrl(presetId: string, imageUrl: string): Promise<void> {
  await supabaseAdmin
    .from('avatar_environment_assets')
    .upsert({ preset_id: presetId, image_url: imageUrl }, { onConflict: 'preset_id' });
}

/**
 * Get-or-create an environment background image for a preset.
 *
 * - Checks the `avatar_environment_assets` cache first.
 * - If not found: generates via Gemini, uploads to R2/Supabase, caches, returns URL.
 * - The `plain` preset has no image — throws if called for it.
 * - Images are global/reusable: "office" is shared across all avatars.
 */
export async function getOrCreateEnvironmentImage(presetId: string): Promise<string> {
  const preset = getEnvironmentPreset(presetId);
  if (!preset.prompt) {
    throw new Error(`The "${preset.label}" preset does not use a background image.`);
  }

  // Check cache first
  const cached = await getCachedEnvironmentUrl(presetId);
  if (cached) return cached;

  // Generate, upload, cache
  const { data, mime } = await generateEnvironmentImage(presetId);
  const imageUrl = await uploadEnvironmentImage(presetId, data, mime);
  await cacheEnvironmentUrl(presetId, imageUrl);
  return imageUrl;
}
