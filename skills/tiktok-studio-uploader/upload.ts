/**
 * Video file upload step.
 *
 * Sets the video file on the hidden <input type="file"> and waits
 * for TikTok Studio to accept and process it (signaled by the caption
 * editor becoming visible).
 */

import type { Page } from 'playwright';
import { TIMEOUTS } from './types.js';
import { FILE_INPUT, CAPTION_EDITOR } from './selectors.js';

/**
 * Upload a video file to TikTok Studio.
 * Throws if the file input is not found or the video isn't accepted.
 */
export async function uploadVideoFile(page: Page, videoPath: string): Promise<void> {
  // Find the file input (may be hidden behind the drop zone)
  let fileInput = page.locator(FILE_INPUT[0]).first();
  let found = false;

  for (const sel of FILE_INPUT) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: 'attached', timeout: TIMEOUTS.action });
      fileInput = loc;
      found = true;
      break;
    } catch {
      // try next selector
    }
  }

  if (!found) {
    throw new Error('File input not found on upload page');
  }

  // Set the file
  await fileInput.setInputFiles(videoPath);

  // Wait for the caption editor to appear — signals video was accepted
  let captionReady = false;
  for (const sel of CAPTION_EDITOR) {
    try {
      await page.locator(sel).first().waitFor({
        state: 'visible',
        timeout: TIMEOUTS.upload,
      });
      captionReady = true;
      break;
    } catch {
      // try next selector
    }
  }

  if (!captionReady) {
    throw new Error('Caption editor not found after video upload — video may still be processing');
  }
}
