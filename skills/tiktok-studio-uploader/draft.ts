/**
 * Save-as-draft / publish step.
 *
 * Default: draft-only. When shouldPost is true, clicks "Post" instead.
 * Waits for confirmation and attempts to extract a post/draft ID.
 */

import type { Page, Locator } from 'playwright';
import { CONFIG, TIMEOUTS } from './types.js';
import { DRAFT_BTN, POST_BTN, SUCCESS_INDICATORS } from './selectors.js';

export interface DraftResult {
  saved: boolean;
  tiktok_draft_id?: string;
  url?: string;
  errors: string[];
}

async function findFirst(
  page: Page,
  selectors: readonly string[],
  timeout: number = TIMEOUTS.selector,
): Promise<Locator | null> {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: 'visible', timeout });
      return loc;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Extract a TikTok post/draft ID from the current URL.
 */
function extractTiktokId(url: string): string | undefined {
  const idMatch =
    url.match(/\/video\/(\d+)/) ||
    url.match(/[?&]id=(\d+)/) ||
    url.match(/\/(\d{15,})/);
  return idMatch?.[1];
}

/**
 * Click "Save as draft" and wait for confirmation.
 * Attempts to extract a tiktok_draft_id from the post-save URL.
 */
export async function saveDraft(page: Page): Promise<DraftResult> {
  const errors: string[] = [];

  // Find the draft button
  const draftBtn = await findFirst(page, DRAFT_BTN, TIMEOUTS.action);
  if (!draftBtn) {
    errors.push('"Save as draft" button not found');
    return { saved: false, errors };
  }

  // Try normal click first; if blocked by lingering overlay, escalate to force/JS click
  try {
    await draftBtn.click({ timeout: 2_000 });
  } catch {
    try {
      await draftBtn.click({ force: true });
    } catch {
      await draftBtn.evaluate((el: HTMLElement) => el.click());
    }
  }
  await page.waitForTimeout(3_000);

  // Check for success
  const success = await findFirst(page, SUCCESS_INDICATORS, TIMEOUTS.postConfirm);
  const currentUrl = page.url();
  const urlChanged = currentUrl !== CONFIG.uploadUrl;
  const tiktok_draft_id = extractTiktokId(currentUrl);

  if (success || urlChanged) {
    return {
      saved: true,
      tiktok_draft_id,
      url: urlChanged ? currentUrl : undefined,
      errors,
    };
  }

  // No success indicator and URL didn't change — ambiguous
  errors.push('No success confirmation detected — verify draft in TikTok Studio');
  return {
    saved: true, // action was taken, likely succeeded
    tiktok_draft_id,
    errors,
  };
}

/**
 * Click "Post" to publish immediately. Only called when POST_MODE=post or POST_NOW=true.
 * Returns same shape as saveDraft for consistent handling.
 */
export async function publishPost(page: Page): Promise<DraftResult> {
  const errors: string[] = [];

  // Find the post button
  const postBtn = await findFirst(page, POST_BTN, TIMEOUTS.action);
  if (!postBtn) {
    // Fallback: try saving as draft instead
    errors.push('"Post" button not found — falling back to draft');
    return saveDraft(page);
  }

  // Try normal click first; if blocked by lingering overlay, escalate to force/JS click
  try {
    await postBtn.click({ timeout: 2_000 });
  } catch {
    try {
      await postBtn.click({ force: true });
    } catch {
      await postBtn.evaluate((el: HTMLElement) => el.click());
    }
  }
  await page.waitForTimeout(3_000);

  // Check for success
  const success = await findFirst(page, SUCCESS_INDICATORS, TIMEOUTS.postConfirm);
  const currentUrl = page.url();
  const urlChanged = currentUrl !== CONFIG.uploadUrl;
  const tiktok_draft_id = extractTiktokId(currentUrl);

  if (success || urlChanged) {
    return {
      saved: true,
      tiktok_draft_id,
      url: urlChanged ? currentUrl : undefined,
      errors,
    };
  }

  errors.push('No success confirmation detected after posting — verify in TikTok Studio');
  return {
    saved: true,
    tiktok_draft_id,
    errors,
  };
}
