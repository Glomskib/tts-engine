# FlashFlow — Media Storage Architecture

## Overview

All media storage uses **Supabase Storage** as the canonical storage layer.
The centralized storage module is `lib/media-storage.ts`.

---

## Buckets

| Bucket | Purpose | Access | Tenant Isolation |
|--------|---------|--------|------------------|
| `video-files` | Raw video uploads from users | Public | Yes — `{workspace_id}/raw/...` |
| `renders` | Rendered videos, TTS, b-roll, SFX | Public | Yes for renders — `editing/{workspace_id}/...` |
| `product-images` | Product image uploads | Public | Partial |
| `feedback-screenshots` | User feedback screenshots | Public | Yes — `feedback/{user_id}/...` |
| `cc-idea-artifacts` | Command Center idea file artifacts | Public | Partial |
| `b-roll-uploads` | B-roll source images | Public | RLS policies |
| `broll-generated` | AI-generated b-roll videos | Public | No |
| `broll-stock` | Stock b-roll videos | Public | No |
| `raw-footage` | Marketplace raw footage | **Private** | Signed URLs only |
| `flashflow-media` | Trending/virals snapshots | Public | No |

### Bucket Setup

All buckets listed above should be created in your Supabase project's Storage dashboard.
Most are auto-created by their first usage, but for production reliability:

```
Supabase Dashboard → Storage → New Bucket
  Name: video-files       | Public: Yes
  Name: renders           | Public: Yes
  Name: product-images    | Public: Yes
  Name: raw-footage       | Public: No
```

---

## Canonical Path Conventions

### Raw Videos
```
{workspace_id}/raw/{content_item_id}_{timestamp}_{sanitized_filename}.{ext}
```
- Bucket: `video-files`
- Builder: `buildRawVideoPath()`
- DB field (canonical): `content_items.raw_video_storage_path`
- DB field (cache): `content_items.raw_video_url`

### Rendered Videos
```
editing/{workspace_id}/{content_item_id}_{timestamp}.mp4
```
- Bucket: `renders`
- Builder: `buildRenderedVideoPath()`
- DB field (canonical): `content_items.rendered_video_storage_path`
- DB field (cache): `content_items.rendered_video_url`

### TTS Audio
```
tts/{timestamp}_{correlation_id}.mp3
```
- Bucket: `renders`
- Builder: `buildTTSAudioPath()`

### B-roll
```
broll/{source}/{identifier}_{timestamp}.mp4
```
- Bucket: `renders` (or `broll-generated`/`broll-stock` for marketplace)
- Builder: `buildBrollPath()`

### Packs
- **Not persisted** — generated in-memory as ZIP and streamed to client
- Endpoint: `POST /api/packs/export`

---

## Which DB Fields Are Canonical?

| Field | Type | Role |
|-------|------|------|
| `raw_video_storage_path` | **Canonical** | Source of truth for raw video location |
| `raw_video_url` | Cache | Public URL populated at upload time for UI convenience |
| `rendered_video_storage_path` | **Canonical** | Source of truth for rendered video location |
| `rendered_video_url` | Cache | Public URL populated at render time for UI convenience |

**Rule:** Always store the `storage_path`. The `url` field is a convenience cache.
If a URL expires or bucket access changes, regenerate from the storage path.

---

## Access Model

### Current State
- Most buckets are **public** — objects accessible via permanent public URLs
- `raw-footage` is **private** — requires signed URLs (1-hour expiry)
- Tenant isolation is enforced via **path prefixes** (`{workspace_id}/...`)

### Signed URL Generation
- API: `POST /api/storage/signed-url` — generates signed URLs for authorized users
- Helper: `getSignedMediaUrl(bucket, path, expirySec)` in `lib/media-storage.ts`
- Tenant safety: signed URL API verifies path belongs to requesting user's workspace

### Security Notes
- Public URLs are permanent and shareable — acceptable for user's own content
- Storage paths are workspace-scoped, preventing cross-tenant access via path guessing
- The signed URL API enforces workspace-scoping for `video-files` and `renders` buckets

---

## Centralized Helpers

All in `lib/media-storage.ts`:

### Uploads
- `uploadRawVideo(workspaceId, contentItemId, file, filename, ext)` → `MediaUploadResult`
- `uploadRenderedVideo(workspaceId, contentItemId, file)` → `MediaUploadResult`

### URL Resolution
- `resolveRawVideoUrl(url, storagePath)` → playback URL
- `resolveRenderedVideoUrl(url, storagePath)` → playback URL
- `resolveMediaUrl(bucket, storagePath)` → public or signed URL
- `getPublicMediaUrl(bucket, storagePath)` → permanent public URL
- `getSignedMediaUrl(bucket, storagePath, expiry)` → time-limited signed URL

### Deletion
- `deleteMediaObject(bucket, storagePath)` → best-effort delete

### Path Utilities
- `buildRawVideoPath(workspaceId, contentItemId, filename, ext)`
- `buildRenderedVideoPath(workspaceId, contentItemId)`
- `buildTTSAudioPath(correlationId)`
- `buildBrollPath(source, identifier)`
- `normalizeStoragePath(path)`
- `mediaObjectExists(bucket, storagePath)`

---

## Flow: Raw Video Upload

1. User uploads via `RawVideoUpload` component → `POST /api/content-items/[id]/raw-video`
2. Route validates file (type, size, ownership)
3. Previous raw video deleted via `deleteMediaObject()` if exists
4. Upload via `uploadRawVideo()` — workspace-scoped path
5. DB updated: both `raw_video_storage_path` (canonical) and `raw_video_url` (cache)
6. Event logged

## Flow: Render Pipeline

1. User triggers render → `POST /api/content-items/[id]/render`
2. Route validates preconditions, checks for duplicate jobs
3. `edit_status` set to `rendering` optimistically
4. `render_video` job enqueued via job queue
5. Cron picks up job → `renderContentItem()` in `render-plan.ts`
6. Raw video downloaded via `resolveRawVideoUrl()` (prefers storage path)
7. FFmpeg processes edit plan
8. Output uploaded via `uploadRenderedVideo()` — workspace-scoped path
9. DB updated: `rendered_video_storage_path` + `rendered_video_url` + `edit_status = 'rendered'`
10. UI polls for completion, shows result when ready

---

## Future: Migration to S3/R2

When Supabase Storage limits are reached, the migration path is:

1. Keep `lib/media-storage.ts` as the abstraction layer
2. Add S3/R2 client behind the same interface
3. Update `BUCKETS` registry to point to new provider
4. Migrate existing files with a background job
5. Update URL generation to use CloudFront/R2 public URLs or signed URLs
6. No changes needed to API routes or UI — they use the centralized helpers

The key design choice enabling this: **storage paths are canonical**, not URLs.
Any provider that supports the same path convention can be swapped in.
