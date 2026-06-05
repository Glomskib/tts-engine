/**
 * Resumable (TUS) upload to Supabase Storage.
 *
 * Why this exists:
 * Supabase Storage's standard signed-URL PUT is hard-capped at ~50 MB on the
 * `/storage/v1/object/upload/...` path even on Pro plans. Anything larger
 * returns HTTP 413 "Payload too large". The fix is the TUS resumable endpoint
 * (`/storage/v1/upload/resumable`), which accepts files up to the bucket's
 * configured fileSizeLimit (the edit-jobs bucket is 500 MB).
 *
 * This module wraps `tus-js-client` with Supabase's required chunk size
 * (exactly 6 MB) and auth metadata, plus a progress callback for the UI.
 *
 * Reference:
 *   https://supabase.com/docs/guides/storage/uploads/resumable-uploads
 *
 * Pairs with:
 *   - POST /api/editor/jobs/[id]/upload/sign       (server validates + returns storagePath)
 *   - POST /api/editor/jobs/[id]/upload/finalize   (verifies file landed, registers asset)
 */
import * as tus from 'tus-js-client';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

// Supabase TUS endpoint requires exactly 6 MB chunks. Other sizes fail silently
// or with cryptic errors. Don't change this without reading the docs.
const SUPABASE_TUS_CHUNK_SIZE = 6 * 1024 * 1024;

/** Live upload telemetry handed to the UI on every TUS progress tick. */
export interface ResumableProgress {
  /** 0-100, rounded. */
  pct: number;
  bytesUploaded: number;
  bytesTotal: number;
  /** Smoothed transfer rate in bytes/sec (EMA). 0 until the first real sample. */
  bytesPerSecond: number;
  /** Estimated seconds remaining, or null until we have a rate. */
  etaSeconds: number | null;
}

export interface ResumableUploadOptions {
  bucketName: string;
  /** Full object path inside the bucket, e.g. `${userId}/${jobId}/raw/123_clip.mp4` */
  storagePath: string;
  file: File;
  /** Called on every progress tick with pct + live speed/ETA telemetry. */
  onProgress?: (p: ResumableProgress) => void;
  /** AbortSignal — calling .abort() on the underlying upload. */
  signal?: AbortSignal;
}

/**
 * Upload a file to Supabase Storage via TUS resumable protocol.
 * Resolves on success, rejects on terminal error.
 *
 * Auto-retries transient network failures (handled inside tus-js-client).
 * Works for files from a few KB up to the bucket's fileSizeLimit (500 MB
 * for `edit-jobs`).
 */
export async function uploadResumableToSupabase(opts: ResumableUploadOptions): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase env vars missing — cannot start resumable upload.');
  }

  // TUS to Supabase requires the user's session JWT in Authorization,
  // and the anon key as the apikey header. Without these, storage rejects
  // with 401/403 even for public buckets.
  const supabase = createBrowserSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('Not signed in — please refresh the page and try again.');
  }

  // Speed/ETA tracking. tus-js-client fires onProgress frequently; we smooth
  // the instantaneous rate with an exponential moving average so the number
  // the user sees doesn't jitter between chunks.
  let lastTime = performance.now();
  let lastBytes = 0;
  let emaBytesPerSec = 0;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(opts.file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      // 3 retries with exponential-ish backoff. Network drop → resumes from
      // the last completed chunk, not from byte zero.
      retryDelays: [0, 1500, 4000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-upsert': 'true', // overwrite if path collides
        apikey: anonKey,
      },
      // Supabase requires this exact chunk size for TUS uploads.
      chunkSize: SUPABASE_TUS_CHUNK_SIZE,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // Per Supabase docs — disable upload-length-deferred so the server knows
      // total size upfront and can enforce the bucket fileSizeLimit early.
      uploadLengthDeferred: false,
      metadata: {
        bucketName: opts.bucketName,
        objectName: opts.storagePath,
        contentType: opts.file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      // Resume previous upload of the same File (same name/size/mtime).
      // localStorage stores the upload URL so a page reload can pick back up.
      fingerprint: async (file) => {
        return [
          'supabase-edit-jobs',
          opts.storagePath,
          file.name,
          file.size,
          file.lastModified,
        ].join('::');
      },
      onError: (err) => {
        // Surface a friendly message but preserve the underlying for logging.
        const detail = err instanceof Error ? err.message : String(err);
        reject(new Error(`Upload failed — ${detail}`));
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        if (!opts.onProgress) return;
        const now = performance.now();
        const dtSec = (now - lastTime) / 1000;
        const dBytes = bytesUploaded - lastBytes;
        // Only update the rate on forward progress over a real time delta —
        // guards against divide-by-zero and the occasional out-of-order tick.
        if (dtSec > 0 && dBytes > 0) {
          const instant = dBytes / dtSec;
          emaBytesPerSec = emaBytesPerSec === 0 ? instant : emaBytesPerSec * 0.7 + instant * 0.3;
          lastTime = now;
          lastBytes = bytesUploaded;
        }
        const pct = bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
        const remaining = Math.max(0, bytesTotal - bytesUploaded);
        const etaSeconds = emaBytesPerSec > 0 ? Math.round(remaining / emaBytesPerSec) : null;
        opts.onProgress({ pct, bytesUploaded, bytesTotal, bytesPerSecond: emaBytesPerSec, etaSeconds });
      },
      onSuccess: () => {
        resolve();
      },
    });

    // Wire up abort signal so callers can cancel a stuck upload.
    if (opts.signal) {
      const onAbort = () => {
        try { upload.abort(); } catch { /* noop */ }
        reject(new Error('Upload canceled.'));
      };
      if (opts.signal.aborted) {
        onAbort();
        return;
      }
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    // Look for a previous, partially-completed upload of the same file and
    // resume if found. Otherwise start fresh.
    upload.findPreviousUploads().then((previous) => {
      if (previous.length > 0) {
        upload.resumeFromPreviousUpload(previous[0]);
      }
      upload.start();
    }).catch(() => {
      // Listing previous uploads failed (e.g. localStorage disabled) — just start.
      upload.start();
    });
  });
}
