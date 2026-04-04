/**
 * Centralized media storage helpers for FlashFlow.
 *
 * All media uploads and URL generation should go through this module.
 * Canonical source of truth: storage_path fields in DB.
 * URL fields (raw_video_url, rendered_video_url) are convenience caches.
 *
 * Bucket inventory:
 *   video-files  — raw video uploads (public for now, workspace-scoped paths)
 *   renders      — rendered videos, TTS audio, b-roll, SFX (public for now)
 *
 * Path conventions:
 *   raw video:     {workspace_id}/raw/{content_item_id}_{timestamp}_{filename}.{ext}
 *   rendered:      editing/{workspace_id}/{content_item_id}_{timestamp}.mp4
 *   b-roll:        broll/{source}/{identifier}_{timestamp}.mp4
 *   packs:         ephemeral (generated in-memory, not persisted)
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

// ── Bucket Registry ─────────────────────────────────────────────

export const BUCKETS = {
  /** Raw video uploads from users */
  RAW_VIDEOS: 'video-files',
  /** Rendered videos, TTS, b-roll, SFX */
  RENDERS: 'renders',
  /** Product images */
  PRODUCT_IMAGES: 'product-images',
  /** User feedback screenshots */
  FEEDBACK: 'feedback-screenshots',
  /** Command center idea artifacts */
  IDEA_ARTIFACTS: 'cc-idea-artifacts',
  /** B-roll source images for image-to-image */
  BROLL_UPLOADS: 'b-roll-uploads',
  /** AI-generated b-roll */
  BROLL_GENERATED: 'broll-generated',
  /** Stock b-roll */
  BROLL_STOCK: 'broll-stock',
  /** Marketplace raw footage (private) */
  RAW_FOOTAGE: 'raw-footage',
  /** Trending/virals media */
  FLASHFLOW_MEDIA: 'flashflow-media',
} as const;

export type BucketName = typeof BUCKETS[keyof typeof BUCKETS];

/** Buckets that use signed URLs (private access) */
const PRIVATE_BUCKETS = new Set<string>([BUCKETS.RAW_FOOTAGE]);

/** Default signed URL expiry in seconds (1 hour) */
const DEFAULT_SIGNED_URL_EXPIRY = 3600;

// ── Path Builders ───────────────────────────────────────────────

function sanitizeFilename(raw: string, maxLen = 80): string {
  return raw
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, maxLen);
}

/** Build storage path for a raw video upload */
export function buildRawVideoPath(
  workspaceId: string,
  contentItemId: string,
  filename: string,
  ext: string,
): string {
  const sanitized = sanitizeFilename(filename);
  return `${workspaceId}/raw/${contentItemId}_${Date.now()}_${sanitized}.${ext}`;
}

/** Build storage path for a clip asset */
export function buildClipAssetPath(
  workspaceId: string,
  contentItemId: string,
  filename: string,
  ext: string,
): string {
  const sanitized = sanitizeFilename(filename);
  return `${workspaceId}/clips/${contentItemId}_${Date.now()}_${sanitized}.${ext}`;
}

/** Build storage path for a rendered video */
export function buildRenderedVideoPath(
  workspaceId: string,
  contentItemId: string,
): string {
  return `editing/${workspaceId}/${contentItemId}_${Date.now()}.mp4`;
}

/** Build storage path for a TTS audio render */
export function buildTTSAudioPath(correlationId: string): string {
  return `tts/${Date.now()}_${correlationId}.mp3`;
}

/** Build storage path for a b-roll video */
export function buildBrollPath(source: string, identifier: string): string {
  return `broll/${source}/${identifier}_${Date.now()}.mp4`;
}

/** Normalize a storage path — strip leading slashes, collapse doubles */
export function normalizeStoragePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/\/+/g, '/');
}

// ── URL Generation ──────────────────────────────────────────────

/**
 * Get a public URL for a storage object.
 * Only use for buckets that are configured as public.
 */
export function getPublicMediaUrl(bucket: BucketName, storagePath: string): string {
  const { data } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(normalizeStoragePath(storagePath));
  return data.publicUrl;
}

/**
 * Get a signed (time-limited) URL for a storage object.
 * Works for both public and private buckets.
 * Returns null if the object doesn't exist or signing fails.
 */
export async function getSignedMediaUrl(
  bucket: BucketName,
  storagePath: string,
  expirySec = DEFAULT_SIGNED_URL_EXPIRY,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(normalizeStoragePath(storagePath), expirySec);

  if (error) {
    console.error(`[media-storage] Signed URL failed for ${bucket}/${storagePath}:`, error.message);
    return null;
  }

  return data.signedUrl;
}

/**
 * Resolve a playback URL from a storage path.
 * Uses public URL for public buckets, signed URL for private buckets.
 */
export async function resolveMediaUrl(
  bucket: BucketName,
  storagePath: string,
): Promise<string | null> {
  if (!storagePath) return null;

  if (PRIVATE_BUCKETS.has(bucket)) {
    return getSignedMediaUrl(bucket, storagePath);
  }

  return getPublicMediaUrl(bucket, storagePath);
}

/**
 * Resolve a playback URL for a content item's raw video.
 * Prefers storage_path (canonical), falls back to URL field.
 */
export async function resolveRawVideoUrl(
  rawVideoUrl: string | null,
  rawVideoStoragePath: string | null,
): Promise<string | null> {
  if (rawVideoStoragePath) {
    return resolveMediaUrl(BUCKETS.RAW_VIDEOS, rawVideoStoragePath);
  }
  // Fallback: direct URL (e.g., external sources, Google Drive intake)
  return rawVideoUrl || null;
}

/**
 * Resolve a playback URL for a content item's rendered video.
 * Prefers storage_path (canonical), falls back to URL field.
 */
export async function resolveRenderedVideoUrl(
  renderedVideoUrl: string | null,
  renderedVideoStoragePath: string | null,
): Promise<string | null> {
  if (renderedVideoStoragePath) {
    return resolveMediaUrl(BUCKETS.RENDERS, renderedVideoStoragePath);
  }
  return renderedVideoUrl || null;
}

// ── Upload Helpers ──────────────────────────────────────────────

export interface MediaUploadResult {
  /** Public or signed URL for the uploaded file */
  url: string;
  /** Canonical storage path (store this in DB) */
  storagePath: string;
  /** File size in bytes */
  sizeBytes: number;
}

/**
 * Upload a raw video file for a content item.
 */
export async function uploadRawVideo(
  workspaceId: string,
  contentItemId: string,
  file: Buffer | Blob,
  filename: string,
  ext: string,
  contentType = 'video/mp4',
): Promise<MediaUploadResult> {
  const storagePath = buildRawVideoPath(workspaceId, contentItemId, filename, ext);

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKETS.RAW_VIDEOS)
    .upload(storagePath, file, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Raw video upload failed: ${error.message}`);
  }

  const url = getPublicMediaUrl(BUCKETS.RAW_VIDEOS, data.path);
  const sizeBytes = Buffer.isBuffer(file) ? file.length : file.size;

  return { url, storagePath: data.path, sizeBytes };
}

/**
 * Upload a rendered video from the FFmpeg pipeline.
 */
export async function uploadRenderedVideo(
  workspaceId: string,
  contentItemId: string,
  file: Buffer | Blob,
): Promise<MediaUploadResult> {
  const storagePath = buildRenderedVideoPath(workspaceId, contentItemId);

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKETS.RENDERS)
    .upload(storagePath, file, {
      contentType: 'video/mp4',
      upsert: true, // allow re-renders to overwrite
    });

  if (error) {
    throw new Error(`Rendered video upload failed: ${error.message}`);
  }

  const url = getPublicMediaUrl(BUCKETS.RENDERS, data.path);
  const sizeBytes = Buffer.isBuffer(file) ? file.length : file.size;

  return { url, storagePath: data.path, sizeBytes };
}

/**
 * Upload a clip asset for multi-clip editing.
 */
export async function uploadClipAsset(
  workspaceId: string,
  contentItemId: string,
  file: Buffer | Blob,
  filename: string,
  ext: string,
  contentType = 'video/mp4',
): Promise<MediaUploadResult> {
  const storagePath = buildClipAssetPath(workspaceId, contentItemId, filename, ext);

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKETS.RAW_VIDEOS)
    .upload(storagePath, file, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Clip upload failed: ${error.message}`);
  }

  const url = getPublicMediaUrl(BUCKETS.RAW_VIDEOS, data.path);
  const sizeBytes = Buffer.isBuffer(file) ? file.length : file.size;

  return { url, storagePath: data.path, sizeBytes };
}

/**
 * Delete a media object from storage. Best-effort — logs but doesn't throw.
 */
export async function deleteMediaObject(
  bucket: BucketName,
  storagePath: string,
): Promise<boolean> {
  if (!storagePath) return false;

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .remove([normalizeStoragePath(storagePath)]);

  if (error) {
    console.warn(`[media-storage] Delete failed for ${bucket}/${storagePath}:`, error.message);
    return false;
  }

  return true;
}

/**
 * Check if a storage object exists.
 */
export async function mediaObjectExists(
  bucket: BucketName,
  storagePath: string,
): Promise<boolean> {
  // List with exact path prefix — if we get 1 result matching, it exists
  const normalized = normalizeStoragePath(storagePath);
  const dir = normalized.substring(0, normalized.lastIndexOf('/'));
  const file = normalized.substring(normalized.lastIndexOf('/') + 1);

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .list(dir, { limit: 1, search: file });

  if (error) return false;
  return (data?.length ?? 0) > 0;
}
