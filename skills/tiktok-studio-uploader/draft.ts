/**
 * Save-as-draft step.
 *
 * Draft-only mode: never auto-publishes. Clicks "Save as draft",
 * waits for confirmation, and attempts to extract a draft ID from
 * the resulting URL or page content.
 */

import type { Page, Locator } from 'playwright';
import { CONFIG, TIMEOUTS } from './types.js';
import { DRAFT_BTN, SUCCESS_INDICATORS } from './selectors.js';

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

  await draftBtn.click();
  await page.waitForTimeout(3_000);

  // Check for success indicators
  const success = await findFirst(page, SUCCESS_INDICATORS, TIMEOUTS.postConfirm);
  const currentUrl = page.url();
  const urlChanged = currentUrl !== CONFIG.uploadUrl;

  // Try to extract a draft ID from the URL
  // TikTok Studio URLs often contain the video/draft ID as a path segment or query param
  let tiktok_draft_id: string | undefined;
  const idMatch = currentUrl.match(/\/video\/(\d+)/) ||
                  currentUrl.match(/[?&]id=(\d+)/) ||
                  currentUrl.match(/\/(\d{15,})/) ;
  if (idMatch) {
    tiktok_draft_id = idMatch[1];
  }

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
