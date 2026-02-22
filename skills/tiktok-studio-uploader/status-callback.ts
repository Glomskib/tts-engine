/**
 * FlashFlow pipeline status callback.
 *
 * Reports upload results back to the FlashFlow API:
 * - 'posted': calls POST /api/videos/[id]/mark-posted to transition status + record URL
 * - 'drafted': logs locally only (no API endpoint for drafts — video stays "ready_to_post")
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

/** Resolve API URL at runtime to avoid stale CONFIG from import hoisting. */
function getApiUrl(): string {
  return process.env.FF_API_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || CONFIG.flashflowApiUrl
    || 'http://localhost:3000';
}

/** Resolve API token at runtime. */
function getApiToken(): string {
  return process.env.FF_API_TOKEN || CONFIG.flashflowApiToken || '';
}

/**
 * Report the upload result back to the FlashFlow API.
 * Non-blocking — catches and logs all errors.
 */
export async function reportStatus(payload: CallbackPayload): Promise<void> {
  const { video_id, result } = payload;
  const apiToken = getApiToken();

  if (!video_id) {
    console.log('[status-callback] No video_id — skipping API callback.');
    logResult(video_id, result);
    return;
  }

  try {
    if (result.status === 'posted' && result.url && apiToken) {
      await markPosted(video_id, result.url);
    } else if (result.status === 'drafted') {
      // Drafts are device-local — no API transition needed.
      // Video stays "ready_to_post" until actually published.
      console.log(`[status-callback] Draft saved locally for video ${video_id}.`);
    } else if (!apiToken && result.status === 'posted') {
      console.log('[status-callback] No FF_API_TOKEN — cannot call mark-posted API.');
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
  const apiUrl = getApiUrl();
  const apiToken = getApiToken();
  const url = `${apiUrl}/api/videos/${videoId}/mark-posted`;
  console.log(`[status-callback] POST ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
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
