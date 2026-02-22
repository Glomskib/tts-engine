/**
 * Product linking step.
 *
 * TikTok Studio two-step flow:
 *   1. Click "+ Add" → "Add link" modal appears with "Link type: Products" + "Next"
 *   2. Click "Next" → floating product search panel opens
 *   3. Search by product ID → select first result → click "Next" to confirm
 *
 * All clicks inside the floating portal use force:true because TikTok's
 * product-table-container div intercepts pointer events on buttons.
 *
 * Also dismisses Joyride tutorial overlays that can block clicks.
 */

import type { Page, Locator } from 'playwright';
import { TIMEOUTS } from './types.js';
import {
  ADD_PRODUCT_BTN,
  LINK_TYPE_MODAL_NEXT,
  PRODUCT_SEARCH_INPUT,
  PRODUCT_RESULT_ROW,
  PRODUCT_CONFIRM_BTN,
  JOYRIDE_DISMISS,
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
 * Dismiss Joyride tutorial overlay if present.
 */
async function dismissJoyride(page: Page): Promise<void> {
  for (const sel of JOYRIDE_DISMISS) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1_000 })) {
        await btn.click({ force: true });
        await page.waitForTimeout(500);
        console.log('[tiktok-uploader] Dismissed Joyride tutorial overlay.');
        return;
      }
    } catch {
      // not present
    }
  }
  // Also try Escape to dismiss any overlay
  try {
    const overlay = page.locator('[class*="joyride"], [class*="react-joyride"]').first();
    if (await overlay.isVisible({ timeout: 500 })) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      console.log('[tiktok-uploader] Dismissed overlay via Escape.');
    }
  } catch {
    // no overlay
  }
}

/**
 * Attach a TikTok Shop product by searching for its product_id.
 *
 * Handles the two-step modal flow:
 *   Step 1: "Add link" modal → ensure "Products" selected → click "Next"
 *   Step 2: Product search panel → search → select → confirm
 */
export async function attachProductByID(
  page: Page,
  productId: string,
): Promise<ProductLinkResult> {
  const errors: string[] = [];

  // Dismiss any Joyride tutorial overlay before starting
  await dismissJoyride(page);

  // 1. Click "Add product" / "Add link" button
  const addBtn = await findFirst(page, ADD_PRODUCT_BTN);
  if (!addBtn) {
    errors.push('"Add product" button not found');
    return { linked: false, errors };
  }

  await addBtn.click({ force: true });
  await page.waitForTimeout(2_000);

  // 2. Handle "Add link" modal (step 1) — has "Link type" dropdown + "Next"
  //    The modal may or may not appear depending on TikTok Studio UI version.
  const modalNext = await findFirst(page, LINK_TYPE_MODAL_NEXT, 3_000);
  if (modalNext) {
    console.log('[tiktok-uploader] "Add link" modal detected — clicking Next...');
    // force:true because modal overlay can intercept
    await modalNext.click({ force: true });
    await page.waitForTimeout(2_000);
    console.log('[tiktok-uploader] Product search panel should be open.');
  } else {
    console.log('[tiktok-uploader] No "Add link" modal — trying direct product search...');
  }

  // 3. Find and fill the product search input (inside floating portal)
  const searchInput = await findFirst(page, PRODUCT_SEARCH_INPUT, 5_000);
  if (!searchInput) {
    errors.push('Product search input not found in product panel');
    try {
      const screenshotPath = `data/tiktok-errors/product-search-miss-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`[tiktok-uploader] Debug screenshot: ${screenshotPath}`);
    } catch { /* ignore */ }
    return { linked: false, errors };
  }

  console.log('[tiktok-uploader] Found product search input, searching...');
  await searchInput.click({ force: true });
  await searchInput.fill('');
  await page.waitForTimeout(300);
  await searchInput.fill(productId);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3_000);

  // 4. Select first result
  const resultRow = await findFirst(page, PRODUCT_RESULT_ROW, TIMEOUTS.searchResults);
  if (!resultRow) {
    errors.push(`No product found for ID: ${productId}`);
    try {
      const screenshotPath = `data/tiktok-errors/product-result-miss-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`[tiktok-uploader] Debug screenshot: ${screenshotPath}`);
    } catch { /* ignore */ }
    return { linked: false, errors };
  }

  console.log('[tiktok-uploader] Found product result, selecting...');
  // Try checkbox first, then row click — always force:true to bypass table overlay
  try {
    const checkbox = resultRow.locator('input[type="checkbox"], input[type="radio"]').first();
    if (await checkbox.isVisible({ timeout: 1_000 })) {
      await checkbox.click({ force: true });
    } else {
      await resultRow.click({ force: true });
    }
  } catch {
    try {
      await resultRow.click({ force: true });
    } catch (e: any) {
      errors.push(`Failed to select product row: ${e.message}`);
      return { linked: false, errors };
    }
  }
  await page.waitForTimeout(1_000);

  // 5. Confirm selection — click "Next" / "Confirm" in the product panel
  //    force:true is critical here — product-table-container intercepts pointer events
  const confirmBtn = await findFirst(page, PRODUCT_CONFIRM_BTN, 5_000);
  if (confirmBtn) {
    console.log('[tiktok-uploader] Clicking confirm button (force)...');
    try {
      await confirmBtn.click({ force: true });
      await page.waitForTimeout(2_000);
      console.log('[tiktok-uploader] Product selection confirmed.');
    } catch (e: any) {
      // If force:true still fails, try JS click as last resort
      console.log('[tiktok-uploader] Force click failed, trying JS click...');
      try {
        await confirmBtn.evaluate((el: HTMLElement) => el.click());
        await page.waitForTimeout(2_000);
        console.log('[tiktok-uploader] Product confirmed via JS click.');
      } catch (e2: any) {
        errors.push(`Confirm button click failed: ${e2.message}`);
      }
    }
  } else {
    errors.push('Product confirm button not found — selection may still apply');
  }

  // 6. Dismiss any remaining modals/overlays that could block later steps (e.g. Save draft)
  //    The product panel or TUXModal can linger after confirmation.
  await dismissModals(page);
  // Extra wait for animations to complete
  await page.waitForTimeout(500);

  return { linked: true, errors };
}

/**
 * Dismiss any open modals, overlays, or floating portals after product linking.
 * TikTok's modals are stubborn — tries multiple strategies.
 */
async function dismissModals(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const hasModal = await page.locator(
      '.TUXModal-overlay[data-transition-status="open"], [data-floating-ui-portal] .common-modal-footer'
    ).first().isVisible({ timeout: 500 }).catch(() => false);

    if (!hasModal) return;

    if (attempt === 0) {
      console.log('[tiktok-uploader] Dismissing lingering modal...');
    }

    // Strategy 1: Click the modal overlay background (most reliable)
    try {
      const overlay = page.locator('.TUXModal-overlay[data-transition-status="open"]').first();
      if (await overlay.isVisible({ timeout: 300 })) {
        await overlay.click({ position: { x: 10, y: 10 }, force: true });
        await page.waitForTimeout(800);
        continue;
      }
    } catch { /* try next */ }

    // Strategy 2: Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
}
