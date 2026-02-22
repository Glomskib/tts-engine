/**
 * TikTok Studio Uploader — Phase 3 automation module.
 *
 * Orchestrates the full upload-to-draft flow using composable steps:
 *   openUploadStudio → uploadVideoFile → fillDescription → attachProductByID → saveDraft/post
 *
 * Supports draft-only (default) and post mode (POST_MODE=post or POST_NOW=true).
 * Includes retry logic and human-intervention pause for captcha/2FA.
 */

export { CONFIG, TIMEOUTS, getLaunchOptions, STABLE_USER_AGENT } from './types.js';
export type { StudioUploadInput, StudioUploadResult } from './types.js';

export { openUploadStudio, closeSession, saveSessionBackup, checkLogin } from './browser.js';
export type { StudioSession, OpenStudioOptions } from './browser.js';

export { uploadVideoFile } from './upload.js';
export { fillDescription } from './description.js';
export { attachProductByID } from './product.js';
export type { ProductLinkResult } from './product.js';
export { saveDraft, publishPost } from './draft.js';
export type { DraftResult } from './draft.js';
export { reportStatus } from './status-callback.js';

import type { StudioUploadInput, StudioUploadResult } from './types.js';
import { openUploadStudio, closeSession, saveSessionBackup } from './browser.js';
import { uploadVideoFile } from './upload.js';
import { fillDescription } from './description.js';
import { attachProductByID } from './product.js';
import { saveDraft, publishPost } from './draft.js';
import { CONFIG } from './types.js';
import * as path from 'path';

const MAX_RETRIES = 2;

/**
 * Run the full upload-to-draft (or post) pipeline with retry logic.
 *
 * Opens TikTok Studio, uploads video, fills description,
 * attaches product, saves as draft (or posts if shouldPost=true).
 */
export async function runUploadToDraft(
  input: StudioUploadInput,
  shouldPost = false,
): Promise<StudioUploadResult> {
  let lastResult: StudioUploadResult | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`\n[tiktok-uploader] Retry ${attempt}/${MAX_RETRIES}...`);
      // Brief delay before retry
      await new Promise((r) => setTimeout(r, 3_000));
    }

    lastResult = await attemptUpload(input, shouldPost);

    // Don't retry on login_required or success
    if (lastResult.status === 'login_required' || lastResult.status === 'drafted' || lastResult.status === 'posted') {
      return lastResult;
    }

    // Check if errors are retryable
    const retryable = lastResult.errors.some(
      (e) =>
        e.includes('timeout') ||
        e.includes('navigation') ||
        e.includes('not found') ||
        e.includes('processing'),
    );

    if (!retryable) {
      return lastResult;
    }

    console.log(`[tiktok-uploader] Retryable error: ${lastResult.errors.join('; ')}`);
  }

  return lastResult!;
}

async function attemptUpload(
  input: StudioUploadInput,
  shouldPost: boolean,
): Promise<StudioUploadResult> {
  const errors: string[] = [];

  const result: StudioUploadResult = {
    status: 'error',
    product_id: input.productId,
    video_file: path.basename(input.videoPath),
    errors,
  };

  // 1. Open browser & check login
  const session = await openUploadStudio();
  if (!session) {
    result.status = 'login_required';
    errors.push(
      'Login required. Run in headed mode (TIKTOK_HEADLESS=false), log in manually, then retry.',
    );
    return result;
  }

  try {
    const { page } = session;

    // 2. Upload video
    console.log('[tiktok-uploader] Uploading video file...');
    await uploadVideoFile(page, input.videoPath);
    console.log('[tiktok-uploader] Video accepted.');

    // 3. Fill description
    console.log('[tiktok-uploader] Filling description...');
    await fillDescription(page, input.description);
    console.log('[tiktok-uploader] Description filled.');

    // 4. Attach product
    console.log(`[tiktok-uploader] Attaching product ${input.productId}...`);
    const productResult = await attachProductByID(page, input.productId);
    errors.push(...productResult.errors);
    if (productResult.linked) {
      console.log('[tiktok-uploader] Product linked.');
    } else {
      console.log('[tiktok-uploader] Product linking failed — continuing to save.');
    }

    // 5. Save as draft or post
    if (shouldPost) {
      console.log('[tiktok-uploader] Publishing post...');
      const postResult = await publishPost(page);
      errors.push(...postResult.errors);
      if (postResult.saved) {
        result.status = 'posted';
        result.tiktok_draft_id = postResult.tiktok_draft_id;
        result.url = postResult.url;
      }
    } else {
      console.log('[tiktok-uploader] Saving as draft...');
      const draftResult = await saveDraft(page);
      errors.push(...draftResult.errors);
      if (draftResult.saved) {
        result.status = 'drafted';
        result.tiktok_draft_id = draftResult.tiktok_draft_id;
        result.url = draftResult.url;
      }
    }
  } catch (err: any) {
    errors.push(err.message);
  } finally {
    await closeSession(session, CONFIG.headless ? 0 : 5_000);
  }

  return result;
}
