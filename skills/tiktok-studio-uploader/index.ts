/**
 * TikTok Studio Uploader — Phase 3 automation module.
 *
 * Orchestrates the full upload-to-draft flow using composable steps:
 *   openUploadStudio → uploadVideoFile → fillDescription → attachProductByID → saveDraft
 *
 * Draft-only mode. Never auto-publishes.
 */

export { CONFIG, TIMEOUTS } from './types.js';
export type { StudioUploadInput, StudioUploadResult } from './types.js';

export { openUploadStudio, closeSession } from './browser.js';
export type { StudioSession } from './browser.js';

export { uploadVideoFile } from './upload.js';
export { fillDescription } from './description.js';
export { attachProductByID } from './product.js';
export type { ProductLinkResult } from './product.js';
export { saveDraft } from './draft.js';
export type { DraftResult } from './draft.js';

import type { StudioUploadInput, StudioUploadResult } from './types.js';
import { openUploadStudio, closeSession } from './browser.js';
import { uploadVideoFile } from './upload.js';
import { fillDescription } from './description.js';
import { attachProductByID } from './product.js';
import { saveDraft } from './draft.js';
import { CONFIG } from './types.js';
import * as path from 'path';

/**
 * Run the full upload-to-draft pipeline.
 *
 * Opens TikTok Studio, uploads video, fills description,
 * attaches product, saves as draft.
 */
export async function runUploadToDraft(
  input: StudioUploadInput,
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
    await uploadVideoFile(page, input.videoPath);

    // 3. Fill description
    await fillDescription(page, input.description);

    // 4. Attach product
    const productResult = await attachProductByID(page, input.productId);
    errors.push(...productResult.errors);

    // 5. Save as draft (never auto-publish)
    const draftResult = await saveDraft(page);
    errors.push(...draftResult.errors);

    if (draftResult.saved) {
      result.status = 'drafted';
      result.tiktok_draft_id = draftResult.tiktok_draft_id;
      result.url = draftResult.url;
    }
  } catch (err: any) {
    errors.push(err.message);
  } finally {
    await closeSession(session, CONFIG.headless ? 0 : 5_000);
  }

  return result;
}
