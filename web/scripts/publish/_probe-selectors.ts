#!/usr/bin/env npx tsx
// @ts-nocheck
/**
 * Probe TikTok Studio upload page for product-related selectors.
 * Uploads a video, dismisses modals, then dumps all buttons and
 * product-related elements to stdout.
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const STATE_FILE = path.join(os.homedir(), '.flashflow', 'tiktok-studio.storageState.json');
const UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload';
const VIDEO = '/Users/brandonglomski/FlashFlowUploads/2026-02-21/general/big-boy-bundle/video.mp4';

async function main() {
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      storageState: STATE_FILE,
    });
    const page = await context.newPage();

    console.log('Navigating to TikTok Studio...');
    await page.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(4_000);

    console.log('Uploading video...');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.waitFor({ state: 'attached', timeout: 10_000 });
    await fileInput.setInputFiles(VIDEO);

    console.log('Waiting for editor to load...');
    await page.locator('[contenteditable="true"]').first().waitFor({ state: 'visible', timeout: 120_000 });
    await page.waitForTimeout(3_000);

    // Dismiss modal
    try {
      if (await page.locator('div.TUXModal-overlay').first().isVisible({ timeout: 2_000 })) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1_500);
      }
    } catch {}

    // Scroll down to see all controls
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1_000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // === Dump all visible buttons ===
    console.log('\n=== ALL VISIBLE BUTTONS ===');
    const buttons = await page.locator('button:visible').all();
    for (const btn of buttons) {
      try {
        const text = ((await btn.textContent()) || '').trim().replace(/\s+/g, ' ');
        const ariaLabel = (await btn.getAttribute('aria-label')) || '';
        const cls = ((await btn.getAttribute('class')) || '').slice(0, 50);
        if (text || ariaLabel) {
          console.log(`  BTN: text="${text.slice(0, 60)}" aria="${ariaLabel}" class="${cls}"`);
        }
      } catch {}
    }

    // === Product-related elements ===
    console.log('\n=== ELEMENTS WITH "product" or "shop" TEXT ===');
    const allText = await page.locator('*:visible').all();
    for (const el of allText) {
      try {
        const ownText = await el.evaluate(e => {
          const clone = e.cloneNode(true) as HTMLElement;
          for (const child of Array.from(clone.children)) clone.removeChild(child);
          return clone.textContent?.trim() || '';
        });
        if (ownText && (ownText.toLowerCase().includes('product') || ownText.toLowerCase().includes('shop'))) {
          const tag = await el.evaluate(e => e.tagName.toLowerCase());
          const cls = ((await el.getAttribute('class')) || '').slice(0, 50);
          console.log(`  <${tag}> text="${ownText.slice(0, 60)}" class="${cls}"`);
        }
      } catch {}
    }

    // === Specific data-e2e attributes (TikTok uses these) ===
    console.log('\n=== data-e2e ATTRIBUTES ===');
    const e2eEls = await page.locator('[data-e2e]').all();
    for (const el of e2eEls.slice(0, 30)) {
      try {
        const e2e = await el.getAttribute('data-e2e');
        const tag = await el.evaluate(e => e.tagName.toLowerCase());
        const text = ((await el.textContent()) || '').trim().replace(/\s+/g, ' ').slice(0, 50);
        console.log(`  <${tag}> data-e2e="${e2e}" text="${text}"`);
      } catch {}
    }

    // === Checkboxes and toggles ===
    console.log('\n=== TOGGLES/CHECKBOXES ===');
    const toggles = await page.locator('[role="switch"]:visible, [role="checkbox"]:visible, input[type="checkbox"]:visible').all();
    for (const t of toggles) {
      try {
        const ariaLabel = (await t.getAttribute('aria-label')) || '';
        const checked = (await t.getAttribute('aria-checked')) || '';
        const parentText = await t.evaluate(e => e.closest('label, div, span')?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60) || '');
        console.log(`  TOGGLE: aria="${ariaLabel}" checked="${checked}" context="${parentText}"`);
      } catch {}
    }

  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
