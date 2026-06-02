/**
 * HeyGen Photo Avatar integration — upload a user's existing photo and
 * register it as a usable HeyGen avatar id for later video generation.
 *
 * 2026-06-02: REWRITTEN. The original code called /v2/photo_avatar/photo/generate
 * which is HeyGen's AI-PORTRAIT GENERATION endpoint (you pass age/gender/
 * ethnicity/appearance describing a person you want HeyGen to invent — it
 * has no concept of an `image_url`). Every avatar uploaded by every user
 * has been failing with `invalid_parameter: age is invalid: Field required`
 * since launch. /avatars showed "Processing photo" forever.
 *
 * Correct empirically-verified flow (probed live against Brandon's account
 * with Kate's actual Supabase image):
 *
 *   1. POST https://upload.heygen.com/v1/asset
 *      Headers: X-Api-Key, Content-Type (image/png OR image/jpeg)
 *      Body:    raw binary image bytes
 *      → 200 { code: 100, data: { image_key, id, url, ... } }
 *
 *   2. POST https://api.heygen.com/v2/photo_avatar/avatar_group/create
 *      Headers: X-Api-Key, Content-Type: application/json
 *      Body:    { name, image_key }
 *      → 200 { error: null, data: { id, group_id, status, ... } }
 *
 *   3. We store `group_id` (== `id`) as brand_profiles.heygen_custom_avatar_id
 *      and use it later as the avatar id in /v2/video/generate.
 *
 * The avatar group can be `status: 'pending'` initially but is usable for
 * video generation without an explicit train step for the simple
 * "say-this-text" use case we have.
 *
 * Photo cap: HeyGen plans limit talking_photos to 3. avatar_group/create
 * appears uncapped on Pro+ but may still 4xx in some tier configurations.
 * We surface the friendly error message verbatim so the UI can show
 * "Upgrade HeyGen" when applicable.
 */

const HEYGEN_API_BASE    = 'https://api.heygen.com';
const HEYGEN_UPLOAD_BASE = 'https://upload.heygen.com';

interface AssetUploadResponse {
  code?: number;
  data?: {
    id?: string;
    image_key?: string;
    url?: string;
    file_type?: string;
  };
  message?: string | null;
  msg?: string | null;
}

interface AvatarGroupCreateResponse {
  error?: { message?: string; code?: string } | string | null;
  data?: {
    id?: string;
    group_id?: string;
    status?: string;
    image_url?: string;
  };
}

export interface RegisterPhotoResult {
  /** The avatar id we pass into /v2/video/generate as character.avatar_id later. */
  photoAvatarId: string;
  /** Path-style key returned by /v1/asset — useful for debugging. */
  imageKey?: string;
  source: 'heygen.photo_avatar';
}

function apiKey(): string {
  const k = process.env.HEYGEN_API_KEY;
  if (!k) throw new Error('HEYGEN_API_KEY not set — photo avatar registration disabled');
  return k;
}

/**
 * Detect content type from URL extension or fall back to image/png.
 * HeyGen rejects mismatched content types (error code 400543).
 */
function contentTypeFor(url: string, fallback = 'image/png'): string {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return fallback;
}

/**
 * Download the image bytes from a public URL and upload them as a HeyGen
 * asset. Returns the asset's `image_key` (the path-style identifier HeyGen
 * uses to reference the uploaded image).
 */
export async function uploadImageAsset(opts: { imageUrl: string }): Promise<{ imageKey: string }> {
  // 1. Fetch the bytes.
  const fetchRes = await fetch(opts.imageUrl);
  if (!fetchRes.ok) {
    throw new Error(`Could not fetch source image (HTTP ${fetchRes.status}) — is the URL public?`);
  }
  const sourceContentType = fetchRes.headers.get('content-type') || '';
  const ct = sourceContentType.startsWith('image/')
    ? sourceContentType
    : contentTypeFor(opts.imageUrl);
  const buf = Buffer.from(await fetchRes.arrayBuffer());
  if (buf.length === 0) {
    throw new Error('Source image is empty (0 bytes)');
  }

  // 2. POST binary to HeyGen asset upload.
  const res = await fetch(`${HEYGEN_UPLOAD_BASE}/v1/asset`, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey(),
      'Content-Type': ct,
    },
    body: buf,
  });

  // HeyGen returns 200 with code=100 on success. Non-200 = HTTP-level error.
  // 200 with code != 100 means HeyGen-level error.
  const text = await res.text();
  let json: AssetUploadResponse | null = null;
  try { json = JSON.parse(text) as AssetUploadResponse; } catch { /* not json */ }

  if (!res.ok || !json || (json.code !== undefined && json.code !== 100)) {
    const errMsg = (json?.message || json?.msg || text.slice(0, 240)) ?? `HTTP ${res.status}`;
    throw new Error(`HeyGen asset upload failed: ${errMsg}`);
  }

  const imageKey = json.data?.image_key;
  if (!imageKey) {
    throw new Error('HeyGen asset upload succeeded but no image_key returned');
  }
  return { imageKey };
}

/**
 * Wrap a previously-uploaded image_key into an avatar group, which is what
 * gives us the usable avatar id for video generation.
 */
export async function createAvatarGroup(opts: {
  imageKey: string;
  name: string;
}): Promise<string> {
  const res = await fetch(`${HEYGEN_API_BASE}/v2/photo_avatar/avatar_group/create`, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ name: opts.name, image_key: opts.imageKey }),
  });

  const text = await res.text();
  let json: AvatarGroupCreateResponse | null = null;
  try { json = JSON.parse(text) as AvatarGroupCreateResponse; } catch { /* not json */ }

  if (!res.ok || !json) {
    throw new Error(`HeyGen avatar_group/create HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  // HeyGen returns error as object or string in failure cases.
  const errObj = json.error;
  if (errObj && typeof errObj === 'object' && errObj.message) {
    throw new Error(`HeyGen avatar_group/create rejected: ${errObj.message}`);
  }
  if (typeof errObj === 'string' && errObj.length > 0) {
    throw new Error(`HeyGen avatar_group/create rejected: ${errObj}`);
  }
  const id = json.data?.id || json.data?.group_id;
  if (!id) {
    throw new Error(`HeyGen avatar_group/create returned no id: ${text.slice(0, 240)}`);
  }
  return id;
}

/**
 * High-level helper. Takes a public image URL + display name and returns
 * the photo_avatar_id that subsequent renders should use as the avatar.
 * Two API calls total. No polling required — avatar groups are immediately
 * usable for video generation even when their status is 'pending' (HeyGen
 * trains lazily as part of the render request).
 */
export async function registerPhotoAvatar(opts: {
  imageUrl: string;
  name: string;
  signal?: AbortSignal;   // Reserved for future cancellation. The two HTTP calls
                          // are short (sub-30s each) so we don't currently honor it.
}): Promise<RegisterPhotoResult> {
  const { imageKey } = await uploadImageAsset({ imageUrl: opts.imageUrl });
  const photoAvatarId = await createAvatarGroup({ imageKey, name: opts.name.slice(0, 80) });
  return { photoAvatarId, imageKey, source: 'heygen.photo_avatar' };
}
