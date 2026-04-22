-- Raise the renders bucket cap + broaden MIME allowlist so clipper-lane
-- long-form uploads (podcasts, streams, full YouTube exports) don't get
-- 413'd by Supabase storage.
--
-- Previous:  500 MB, MP4/MOV/WebM only
-- New:      2 GB,   MP4/MOV/WebM/AVI/MPEG/OGG/3GP
--
-- The UploadCard client already caps at 2 GB (MAX_SIZE_BYTES) and the
-- upload-urls route validates at 2 GB; the bucket was the tight link.

UPDATE storage.buckets
SET
  file_size_limit = 2147483648,  -- 2 GiB
  allowed_mime_types = ARRAY[
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-msvideo',
    'video/mpeg',
    'video/ogg',
    'video/3gpp'
  ]::text[]
WHERE id = 'renders';
