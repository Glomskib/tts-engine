#!/usr/bin/env npx tsx
// @ts-nocheck
import { config } from 'dotenv'; config({ path: '.env.local' });
import { chromium } from 'playwright';

const profileDir = '/Users/brandonglomski/.openclaw/browser-profiles/ri-tiktok-holisticlifestyle32';

async function main() {
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
  });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://www.tiktok.com/@holisticlifestyle32', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(8000);

  console.log('URL:', page.url());
  console.log('Title:', await page.title());

  // Check what's on the page
  const info = await page.evaluate(() => {
    return {
      bodyText: document.body.textContent?.slice(0, 500),
      e2eAttrs: Array.from(document.querySelectorAll('[data-e2e]')).slice(0, 20).map(el => el.getAttribute('data-e2e')),
      hasVideoGrid: !!document.querySelector('[data-e2e="user-post-item"]'),
      allDivClasses: Array.from(document.querySelectorAll('div[class*="Video"], div[class*="video"], div[class*="Feed"]')).slice(0, 5).map(el => el.className?.toString().slice(0, 100)),
    };
  });

  console.log('Has video grid:', info.hasVideoGrid);
  console.log('data-e2e attrs:', info.e2eAttrs);
  console.log('Video/Feed divs:', info.allDivClasses);
  console.log('Body text snippet:', info.bodyText?.slice(0, 300));

  await page.screenshot({ path: '/tmp/ri-debug-profile.png', fullPage: false });
  console.log('Screenshot: /tmp/ri-debug-profile.png');

  await ctx.close();
}

main().catch(e => { console.error(e); process.exit(1); });
