#!/usr/bin/env npx tsx
// @ts-nocheck
/**
 * Debug: discover TikTok comment sort UI elements.
 * Usage: npx tsx scripts/revenue-intelligence/debug-sort.ts [video_url]
 */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { chromium } from 'playwright';

const TAG = '[ri:debug-sort]';
const profileDir = '/Users/brandonglomski/.openclaw/browser-profiles/ri-tiktok-holisticlifestyle32';
const videoUrl = process.argv[2] || 'https://www.tiktok.com/@holisticlifestyle32/video/7594848521929493791';

async function main() {
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
  });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  const page = ctx.pages()[0] || await ctx.newPage();
  console.log(`${TAG} Navigating to: ${videoUrl}`);
  await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Dismiss overlays
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Click comment icon
  for (const sel of ['[data-e2e="comment-icon"]', 'button[aria-label*="comment" i]']) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) { await btn.click(); break; }
    } catch {}
  }
  await page.waitForTimeout(3000);

  // Scan for sort-related elements
  const sortScan = await page.evaluate(() => {
    const results: Record<string, unknown> = {};

    // Look for anything with "sort", "Relevance", "Newest" text
    const allEls = document.querySelectorAll('*');
    const sortTexts: Array<{tag: string; text: string; cls: string; e2e: string | null; role: string | null}> = [];

    for (const el of allEls) {
      const text = el.textContent?.trim() || '';
      const directText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent?.trim())
        .filter(Boolean)
        .join(' ');

      if (
        (directText && (
          directText.toLowerCase().includes('relevance') ||
          directText.toLowerCase().includes('newest') ||
          directText.toLowerCase().includes('sort') ||
          directText.toLowerCase().includes('all comment')
        ))
      ) {
        sortTexts.push({
          tag: el.tagName,
          text: directText.slice(0, 80),
          cls: (el.className?.toString() || '').slice(0, 120),
          e2e: el.getAttribute('data-e2e'),
          role: el.getAttribute('role'),
        });
      }
    }
    results.sortTexts = sortTexts;

    // Look at the comment list header area
    const commentContainers = document.querySelectorAll(
      '[class*="DivCommentListContainer"], [class*="DivCommentContainer"], [class*="CommentList"]'
    );
    const headers: Array<{cls: string; html: string}> = [];
    for (const c of commentContainers) {
      // First few children
      for (let i = 0; i < Math.min(c.children.length, 3); i++) {
        const child = c.children[i];
        headers.push({
          cls: (child.className?.toString() || '').slice(0, 120),
          html: child.innerHTML?.slice(0, 300) || '',
        });
      }
    }
    results.commentHeaders = headers;

    // data-e2e containing "sort" or "filter"
    const sortE2e = document.querySelectorAll('[data-e2e*="sort"], [data-e2e*="filter"]');
    results.sortE2e = Array.from(sortE2e).map(el => ({
      tag: el.tagName,
      e2e: el.getAttribute('data-e2e'),
      cls: (el.className?.toString() || '').slice(0, 100),
      text: el.textContent?.trim().slice(0, 80),
    }));

    // Any divs with "Sort", "Header" in classname inside comment area
    const sortDivs = document.querySelectorAll('[class*="Sort"], [class*="sort"], [class*="Header"]');
    results.sortDivs = Array.from(sortDivs).slice(0, 10).map(el => ({
      tag: el.tagName,
      cls: (el.className?.toString() || '').slice(0, 120),
      text: el.textContent?.trim().slice(0, 80),
      kids: el.children.length,
    }));

    return results;
  });

  console.log(`\n${TAG} Sort scan results:`);
  console.log(JSON.stringify(sortScan, null, 2));

  await page.screenshot({ path: '/tmp/ri-debug-sort.png', fullPage: false });
  console.log(`\n${TAG} Screenshot: /tmp/ri-debug-sort.png`);

  await ctx.close();
}

main().catch(e => { console.error(e); process.exit(1); });
