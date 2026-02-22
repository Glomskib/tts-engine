/**
 * FlashFlow pipeline status callback.
 *
 * Reports upload results back to the FlashFlow API:
 * - 'posted': calls /api/videos/[id]/mark-posted to transition status + record URL
 * - 'drafted': logs locally and writes a video_event via /api/videos/[id]/execution
 *
 * Failures here are non-blocking — the upload is still considered successful
 * even if the callback fails.
 */

import { CONFIG } from './types.js';
import type { StudioUploadResult } from './types.js';

interface CallbackPayload {
  video_id: string;
  result: StudioUploadResult;
}

/**
 * Report the upload result back to the FlashFlow API.
 * Non-blocking — catches and logs all errors.
 */
export async function reportStatus(payload: CallbackPayload): Promise<void> {
  const { video_id, result } = payload;

  if (!CONFIG.flashflowApiToken) {
    console.log('[status-callback] No FF_API_TOKEN set — skipping API callback.');
    logResult(video_id, result);
    return;
  }

  if (!video_id) {
    console.log('[status-callback] No video_id — skipping API callback.');
    logResult(video_id, result);
    return;
  }

  try {
    if (result.status === 'posted' && result.url) {
      await markPosted(video_id, result.url);
    } else if (result.status === 'drafted') {
      await reportDrafted(video_id, result);
    } else {
      console.log(`[status-callback] Status "${result.status}" — no API action taken.`);
    }
  } catch (err: any) {
    console.error(`[status-callback] Callback failed (non-blocking): ${err.message}`);
  }

  logResult(video_id, result);
}

/**
 * Call /api/videos/[id]/mark-posted to transition the video to "posted" status.
 */
async function markPosted(videoId: string, postedUrl: string): Promise<void> {
  const url = `${CONFIG.flashflowApiUrl}/api/videos/${videoId}/mark-posted`;
  console.log(`[status-callback] POST ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CONFIG.flashflowApiToken}`,
    },
    body: JSON.stringify({
      posted_url: postedUrl,
      platform: 'tiktok',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[status-callback] mark-posted failed: ${res.status} — ${body}`);
    return;
  }

  const json = await res.json();
  console.log(`[status-callback] mark-posted OK — video ${videoId} → posted`);
  if (json.data?.posted_at) {
    console.log(`[status-callback] posted_at: ${json.data.posted_at}`);
  }
}

/**
 * Report a "drafted" result. Since TikTok drafts are device-local,
 * we record this as a video event so the pipeline knows the upload happened.
 */
async function reportDrafted(
  videoId: string,
  result: StudioUploadResult,
): Promise<void> {
  // Write a video event to track that the draft was created
  const url = `${CONFIG.flashflowApiUrl}/api/videos/${videoId}/execution`;
  console.log(`[status-callback] PATCH ${url} (draft event)`);

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CONFIG.flashflowApiToken}`,
    },
    body: JSON.stringify({
      execution_step: 'tiktok_draft_saved',
      details: {
        tiktok_draft_id: result.tiktok_draft_id || null,
        tiktok_url: result.url || null,
        product_id: result.product_id,
        video_file: result.video_file,
        errors: result.errors,
        drafted_at: new Date().toISOString(),
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[status-callback] draft event failed: ${res.status} — ${body}`);
    return;
  }

  console.log(`[status-callback] Draft event recorded for video ${videoId}`);
}

/**
 * Print a local summary of the result.
 */
function logResult(videoId: string, result: StudioUploadResult): void {
  console.log('\n[status-callback] Upload result summary:');
  console.log(`  video_id:        ${videoId || '(none)'}`);
  console.log(`  status:          ${result.status}`);
  console.log(`  product_id:      ${result.product_id}`);
  console.log(`  video_file:      ${result.video_file}`);
  if (result.tiktok_draft_id) {
    console.log(`  tiktok_draft_id: ${result.tiktok_draft_id}`);
  }
  if (result.url) {
    console.log(`  url:             ${result.url}`);
  }
  if (result.errors.length > 0) {
    console.log(`  errors:          ${result.errors.join('; ')}`);
  }
}
