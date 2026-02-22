/**
 * Product linking step.
 *
 * Opens the "Add product" panel, searches by product_id,
 * selects the FIRST result only, and confirms.
 */

import type { Page, Locator } from 'playwright';
import { TIMEOUTS } from './types.js';
import {
  ADD_PRODUCT_BTN,
  PRODUCT_SEARCH_INPUT,
  PRODUCT_RESULT_ROW,
  PRODUCT_CONFIRM_BTN,
} from './selectors.js';

export interface ProductLinkResult {
  linked: boolean;
  errors: string[];
}

/**
 * Try multiple selectors in order, return the first visible match.
 */
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
 * Attach a TikTok Shop product by searching for its product_id.
 * Selects the first search result ONLY.
 */
export async function attachProductByID(
  page: Page,
  productId: string,
): Promise<ProductLinkResult> {
  const errors: string[] = [];

  // 1. Click "Add product" button
  const addBtn = await findFirst(page, ADD_PRODUCT_BTN);
  if (!addBtn) {
    errors.push('"Add product" button not found');
    return { linked: false, errors };
  }

  await addBtn.click();
  await page.waitForTimeout(1_500); // wait for product panel/modal

  // 2. Find and fill search input
  const searchInput = await findFirst(page, PRODUCT_SEARCH_INPUT);
  if (!searchInput) {
    errors.push('Product search input not found in product panel');
    return { linked: false, errors };
  }

  await searchInput.click();
  await searchInput.fill(productId);
  await page.waitForTimeout(2_000); // wait for search results

  // 3. Select first result ONLY
  const resultRow = await findFirst(page, PRODUCT_RESULT_ROW, TIMEOUTS.searchResults);
  if (!resultRow) {
    errors.push(`No product found for ID: ${productId}`);
    return { linked: false, errors };
  }

  await resultRow.click();
  await page.waitForTimeout(500);

  // 4. Confirm selection
  const confirmBtn = await findFirst(page, PRODUCT_CONFIRM_BTN);
  if (confirmBtn) {
    await confirmBtn.click();
    await page.waitForTimeout(1_000);
  } else {
    // Product may still be selected even without a confirm button
    errors.push('Product confirm button not found — selection may still apply');
  }

  return { linked: true, errors };
}
