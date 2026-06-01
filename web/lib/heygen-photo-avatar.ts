/**
 * HeyGen Photo Avatar integration — register an uploaded photo as a usable
 * "custom photo avatar" inside HeyGen, then poll until it's ready.
 *
 * 2026-05-31: this was the missing piece. The existing
 * `web/lib/hook-providers/heygen.ts` only implements text-to-video against
 * a STOCK avatar id. When a user uploaded their photo on /avatars/new, the
 * file landed in Supabase storage and the URL was saved on the brand_profile,
 * but nothing ever asked HeyGen to register it. `heygen_custom_avatar_id`
 * stayed NULL forever → every render fell back to the stock "Daisy" avatar
 * → users saw "Photo needed" badges that never cleared even after upload.
 *
 * This module fixes that. Flow:
 *   1. /avatars/new uploads the file to Supabase, saves URL on brand_profile
 *   2. POST /api/avatars/[id]/heygen/register-photo
 *   3. → createPhotoAvatarFromUrl(url) → HeyGen returns photo_avatar_id
 *   4. → wait + pollPhotoAvatarStatus(photo_avatar_id) until status=completed
 *   5. → UPDATE brand_profiles SET heygen_custom_avatar_id=<photo_avatar_id>
 *   6. The "Photo needed" badge clears; subsequent renders use this avatar id.
 *
 * HeyGen Photo Avatar docs (v2):
 *   POST /v2/photo_avatar/photo/generate  { image_url, name }
 *     → { data: { generation_id } }
 *   GET  /v2/photo_avatar/generation/{id} → { data: { status, image_id } }
 *   POST /v2/photo_avatar/avatar_group/create { name, image_id }
 *     → { data: { id /* this is the photo_avatar_id we use later */ } }
 *
 * We surface a single helper that does generate → poll → group → returns the
 * final usable photo_avatar_id. Callers pass an AbortSignal for early-cancel.
 */
const HEYGEN_BASE = 'https://api.heygen.com';

interface GenerationResponse {
  data?: { generation_id?: string };
  error?: { message?: string; code?: string } | string;
}

interface GenerationStatusResponse {
  data?: {
    status?: 'pending' | 'processing' | 'success' | 'failed';
    image_url_list?: string[];
    image_key_list?: string[];  // newer API surface
    msg?: string;
  };
  error?: { message?: string } | string;
}

interface AvatarGroupCreateResponse {
  data?: { id?: string; group_id?: string };
  error?: { message?: string } | string;
}

export interface RegisterPhotoResult {
  photoAvatarId: string;
  imageKey?: string;
  source: 'heygen.photo_avatar';
}

function apiKey(): string {
  const k = process.env.HEYGEN_API_KEY;
  if (!k) throw new Error('HEYGEN_API_KEY not set — photo avatar registration disabled');
  return k;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${HEYGEN_BASE}${path}`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey(), 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HeyGen ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${HEYGEN_BASE}${path}`, {
    method: 'GET',
    headers: { 'X-Api-Key': apiKey(), 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HeyGen ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Kick off the photo→avatar generation. Returns a `generation_id` that you
 * poll via `pollGeneration()` until status is 'success'.
 */
export async function generatePhotoAvatar(opts: {
  imageUrl: string;
  name: string;
}): Promise<string> {
  const json = await postJson<GenerationResponse>('/v2/photo_avatar/photo/generate', {
    image_url: opts.imageUrl,
    name: opts.name,
  });
  const generationId = json.data?.generation_id;
  if (!generationId) {
    const errMsg = typeof json.error === 'string' ? json.error : json.error?.message || 'no generation_id returned';
    throw new Error(`HeyGen photo avatar generate failed: ${errMsg}`);
  }
  return generationId;
}

/**
 * Poll a generation_id until success/failure. Resolves with the image_key once
 * the photo avatar is processed.
 */
export async function pollGeneration(
  generationId: string,
  opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ imageKey: string }> {
  const interval = opts.intervalMs ?? 4000;
  const timeout = opts.timeoutMs ?? 120000;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (opts.signal?.aborted) throw new Error('aborted');
    const res = await getJson<GenerationStatusResponse>(`/v2/photo_avatar/generation/${generationId}`);
    const status = res.data?.status;
    if (status === 'success') {
      const keys = res.data?.image_key_list || res.data?.image_url_list || [];
      const imageKey = keys[0];
      if (!imageKey) throw new Error('HeyGen reported success but no image_key returned');
      return { imageKey };
    }
    if (status === 'failed') {
      throw new Error(`HeyGen photo avatar generation failed: ${res.data?.msg || 'no msg'}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`HeyGen photo avatar generation timed out after ${timeout / 1000}s`);
}

/**
 * Wrap the generated image_key into an "avatar group" — that's what gives us
 * the photo_avatar_id we pass into /v2/video/generate later.
 */
export async function createAvatarGroup(opts: { imageKey: string; name: string }): Promise<string> {
  const json = await postJson<AvatarGroupCreateResponse>('/v2/photo_avatar/avatar_group/create', {
    name: opts.name,
    image_key: opts.imageKey,
  });
  const id = json.data?.id || json.data?.group_id;
  if (!id) {
    const errMsg = typeof json.error === 'string' ? json.error : json.error?.message || 'no group id returned';
    throw new Error(`HeyGen avatar group create failed: ${errMsg}`);
  }
  return id;
}

/**
 * High-level helper: photo URL → ready-to-render photo_avatar_id.
 * Combines generate → poll → group.
 */
export async function registerPhotoAvatar(opts: {
  imageUrl: string;
  name: string;
  signal?: AbortSignal;
}): Promise<RegisterPhotoResult> {
  const generationId = await generatePhotoAvatar({ imageUrl: opts.imageUrl, name: opts.name });
  const { imageKey } = await pollGeneration(generationId, { signal: opts.signal });
  const photoAvatarId = await createAvatarGroup({ imageKey, name: opts.name });
  return { photoAvatarId, imageKey, source: 'heygen.photo_avatar' };
}
