/**
 * Description / caption fill step.
 *
 * TikTok Studio uses a contenteditable div for the description field.
 * We clear it and type the full description (caption + hashtags).
 */

import type { Page } from 'playwright';
import { TIMEOUTS } from './types.js';
import { CAPTION_EDITOR } from './selectors.js';

/**
 * Fill the TikTok Studio description field with the provided text.
 * Clears any existing content first.
 */
export async function fillDescription(page: Page, description: string): Promise<void> {
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
