/**
 * Playwright browser module for creator-style content extraction.
 *
 * - Persistent browser profile for TikTok login persistence
 * - Anti-detection measures
 * - DOM-based caption/transcript scraping with multiple fallback selectors
 * - Screenshot capture at opening/mid/end timestamps
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import * as path from 'path';
import * as os from 'os';
import type { Screenshot } from './types';

const TAG = '[creator-style:browser]';

const PROFILE_DIR = path.join(
  os.homedir(),
  '.openclaw',
  'browser-profiles',
  'creator-style',
);

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const NAV_TIMEOUT = 30_000;

// ── Browser lifecycle ──

export async function launchBrowser(
  headless: boolean = true,
): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: { width: 1280, height: 900 },
    userAgent: USER_AGENT,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  // Remove webdriver flag
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  console.log(`${TAG} Browser launched (headless=${headless})`);
  return context;
}

export async function closeBrowser(context: BrowserContext): Promise<void> {
  await context.close();
  console.log(`${TAG} Browser closed`);
}

// ── Content extraction ──

export interface ExtractedContent {
  transcript: string | null;
  ocr_text: string | null;
  screenshots: Screenshot[];
  duration_seconds: number | null;
}

// TikTok caption selectors (multiple fallbacks)
const TIKTOK_CAPTION_SELECTORS = [
  '[data-e2e="browse-video-desc"]',
  '[data-e2e="video-desc"]',
  '.tiktok-1ejylhp-DivContainer span',
  'div[class*="DivVideoInfoContainer"] span',
  'h1[data-e2e="video-desc"]',
  '[class*="SpanText"]',
];

// YouTube description selectors
const YOUTUBE_CAPTION_SELECTORS = [
  '#description-inline-expander yt-attributed-string',
  '#description yt-attributed-string',
  'ytd-text-inline-expander span',
  '#description-text',
  '#description .content',
];

export async function extractFromPage(
  context: BrowserContext,
  url: string,
  platform: 'tiktok' | 'youtube',
): Promise<ExtractedContent> {
  const page = await context.newPage();

  try {
    // Navigate with anti-detection delay
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(2000 + Math.random() * 1000);

    // Check for TikTok login redirect
    if (platform === 'tiktok' && page.url().includes('/login')) {
      console.warn(
        `${TAG} TikTok requires login. Please run once with --no-headless ` +
        `to authenticate manually in the persistent profile at:\n  ${PROFILE_DIR}`,
      );
      return { transcript: null, ocr_text: null, screenshots: [], duration_seconds: null };
    }

    // Wait for content to render
    await page.waitForTimeout(2000);

    // Extract captions/description from DOM
    const selectors = platform === 'tiktok'
      ? TIKTOK_CAPTION_SELECTORS
      : YOUTUBE_CAPTION_SELECTORS;

    const transcript = await tryTextFromSelectors(page, selectors);

    // Extract on-screen text (OCR-like: grab all visible text nodes)
    const ocr_text = await extractVisibleText(page, platform);

    // Take 3 screenshots: opening, mid, end
    const screenshots = await captureScreenshots(page, platform);

    // Try to get duration
    const duration_seconds = await extractDuration(page, platform);

    return { transcript, ocr_text, screenshots, duration_seconds };
  } finally {
    await page.close();
  }
}

// ── Helpers ──

async function tryTextFromSelectors(
  page: Page,
  selectors: string[],
): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ state: 'visible', timeout: 3000 });
      const text = await el.textContent();
      if (text && text.trim().length > 10) {
        return text.trim();
      }
    } catch {
      // try next selector
    }
  }
  return null;
}

async function extractVisibleText(
  page: Page,
  platform: string,
): Promise<string | null> {
  try {
    const text = await page.evaluate((plat) => {
      const container = plat === 'tiktok'
        ? document.querySelector('[class*="DivVideoInfoContainer"], [data-e2e="browse-video-desc"]')
        : document.querySelector('#above-the-fold, #below-the-fold');
      if (!container) return null;
      return container.textContent?.trim() || null;
    }, platform);
    return text;
  } catch {
    return null;
  }
}

async function captureScreenshots(
  page: Page,
  platform: string,
): Promise<Screenshot[]> {
  const screenshots: Screenshot[] = [];
  const labels: Array<{ label: string; action: () => Promise<void> }> = [];

  if (platform === 'tiktok') {
    // TikTok: just capture the video area at current state
    labels.push(
      { label: 'opening', action: async () => {} },
      { label: 'mid', action: async () => { await page.waitForTimeout(1500); } },
      { label: 'end', action: async () => { await page.waitForTimeout(1500); } },
    );
  } else {
    // YouTube: capture at different scroll positions
    labels.push(
      { label: 'opening', action: async () => {} },
      { label: 'mid', action: async () => { await page.evaluate(() => window.scrollBy(0, 400)); await page.waitForTimeout(500); } },
      { label: 'end', action: async () => { await page.evaluate(() => window.scrollBy(0, 400)); await page.waitForTimeout(500); } },
    );
  }

  for (const { label, action } of labels) {
    try {
      await action();
      const buffer = await page.screenshot({ type: 'jpeg', quality: 70 });
      screenshots.push({
        timestamp_label: label,
        base64_jpeg: buffer.toString('base64'),
      });
    } catch (err) {
      console.warn(`${TAG} Screenshot (${label}) failed:`, err);
    }
  }

  return screenshots;
}

async function extractDuration(
  page: Page,
  platform: string,
): Promise<number | null> {
  try {
    if (platform === 'youtube') {
      const duration = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.duration || null;
      });
      return duration ? Math.round(duration) : null;
    }

    // TikTok: try to get from video element
    const duration = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video?.duration || null;
    });
    return duration ? Math.round(duration) : null;
  } catch {
    return null;
  }
}
