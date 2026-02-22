/**
 * Description / caption fill step.
 *
 * TikTok Studio uses a contenteditable div for the description field.
 * We clear it and type the full description (caption + hashtags).
 */

import type { Page } from 'playwright';
import { TIMEOUTS } from './types.js';
import { CAPTION_EDITOR, JOYRIDE_DISMISS } from './selectors.js';

/**
 * Dismiss any react-joyride / tutorial overlay that may block interactions.
 * TikTok Studio sometimes shows an onboarding tour after video upload.
 */
async function dismissJoyrideOverlay(page: Page): Promise<void> {
  // Try to dismiss overlay by clicking "Got it" / "Skip" / close buttons
  for (const sel of JOYRIDE_DISMISS) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1_000 })) {
        await btn.click({ timeout: 3_000 });
        console.log(`[tiktok-uploader] Dismissed joyride overlay via: ${sel}`);
        await page.waitForTimeout(500);
        return;
      }
    } catch {
      // selector not found, try next
    }
  }

  // Fallback: remove the overlay via JS if it's still blocking
  try {
    const removed = await page.evaluate(() => {
      const portal = document.getElementById('react-joyride-portal');
      if (portal) {
        portal.remove();
        return true;
      }
      const overlays = document.querySelectorAll('[class*="react-joyride"]');
      overlays.forEach(el => el.remove());
      return overlays.length > 0;
    });
    if (removed) {
      console.log('[tiktok-uploader] Removed joyride overlay via DOM removal.');
      await page.waitForTimeout(300);
    }
  } catch {
    // ignore
  }
}

/**
 * Fill the TikTok Studio description field with the provided text.
 * Clears any existing content first.
 */
export async function fillDescription(page: Page, description: string): Promise<void> {
  // Dismiss any tutorial/joyride overlay that may block the editor
  await dismissJoyrideOverlay(page);

  // Find the caption/description editor
  let editor = page.locator(CAPTION_EDITOR[0]).first();
  let found = false;

  for (const sel of CAPTION_EDITOR) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: 'visible', timeout: TIMEOUTS.selector });
      editor = loc;
      found = true;
      break;
    } catch {
      // try next selector
    }
  }

  if (!found) {
    throw new Error('Caption/description editor not found');
  }

  // Clear existing content
  await editor.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);

  // Type description line by line to handle newlines in contenteditable
  const lines = description.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.type(lines[i], { delay: 10 });
  }
}
