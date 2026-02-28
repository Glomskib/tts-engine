#!/usr/bin/env npx tsx
// @ts-nocheck
/**
 * Debug: figure out how to trigger comment loading on TikTok video pages.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { chromium } from 'playwright';

const TAG = '[ri:debug]';
const profileDir = '/Users/brandonglomski/.openclaw/browser-profiles/ri-tiktok-holisticlifestyle32';
const videoUrl = process.argv[2] || 'https://www.tiktok.com/@holisticlifestyle32/video/7594848521929493791';

async function main() {
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = ctx.pages()[0] || await ctx.newPage();

  console.log(`${TAG} Navigating to: ${videoUrl}`);
  await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Dismiss keyboard shortcuts overlay
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // Click the comment icon to open/activate comment panel
  console.log(`${TAG} Clicking comment icon...`);
  try {
    const commentBtn = await page.$('[data-e2e="comment-icon"]');
    if (commentBtn) {
      await commentBtn.click();
      console.log(`${TAG} Clicked comment icon`);
    } else {
      // Try the button that contains the comment icon
      const btn = await page.$('button[aria-label*="comment" i]');
      if (btn) {
        await btn.click();
        console.log(`${TAG} Clicked comment button via aria-label`);
      }
    }
  } catch (e) {
    console.log(`${TAG} Comment click failed: ${e}`);
  }
  await page.waitForTimeout(4000);

  // Screenshot after clicking comment
  await page.screenshot({ path: '/tmp/ri-debug-3.png', fullPage: false });

  // Now scan for comment elements
  const commentScan = await page.evaluate(() => {
    const results: any[] = [];

    // Broad search for anything that could be a comment item
    const allDivs = document.querySelectorAll('div[class]');
    const commentDivs: Element[] = [];
    for (const div of allDivs) {
      const cls = div.className?.toString() || '';
      if (cls.includes('CommentItem') || cls.includes('comment-item') || cls.includes('DivCommentObject')) {
        commentDivs.push(div);
      }
    }

    if (commentDivs.length > 0) {
      results.push({ type: 'comment-divs', count: commentDivs.length, sample: commentDivs[0].className?.toString().slice(0, 100) });
    }

    // Search all data-e2e for anything new after click
    const e2es = document.querySelectorAll('[data-e2e]');
    const e2eMap: Record<string, number> = {};
    for (const el of e2es) {
      const val = el.getAttribute('data-e2e') || '';
      if (val.includes('comment')) {
        e2eMap[val] = (e2eMap[val] || 0) + 1;
      }
    }
    results.push({ type: 'comment-e2e', attrs: e2eMap });

    // Look for user links inside comment area (comments contain @username links)
    const commentContainer = document.querySelector('[class*="DivCommentListContainer"], [class*="CommentList"], [class*="DivCommentContainer"]');
    if (commentContainer) {
      const links = commentContainer.querySelectorAll('a[href*="/@"]');
      results.push({
        type: 'comment-user-links',
        count: links.length,
        samples: Array.from(links).slice(0, 5).map(a => ({
          href: a.getAttribute('href'),
          text: a.textContent?.trim().slice(0, 50),
        })),
      });

      // Get all text nodes inside comment container
      const spans = commentContainer.querySelectorAll('p, span');
      const texts: string[] = [];
      for (const s of Array.from(spans).slice(0, 30)) {
        const t = s.textContent?.trim();
        if (t && t.length > 3 && t.length < 200) texts.push(t);
      }
      results.push({ type: 'comment-texts', count: texts.length, samples: texts.slice(0, 15) });
    } else {
      results.push({ type: 'no-comment-container' });

      // Try broader search
      const allText = document.querySelectorAll('[class*="DivComment"] p, [class*="DivComment"] span');
      results.push({
        type: 'broad-comment-text',
        count: allText.length,
        samples: Array.from(allText).slice(0, 10).map(el => el.textContent?.trim().slice(0, 100)),
      });
    }

    return results;
  });

  console.log(`\n${TAG} Comment scan results:`);
  console.log(JSON.stringify(commentScan, null, 2));

  // Also try scrolling the right panel
  console.log(`\n${TAG} Scrolling right panel...`);
  await page.evaluate(() => {
    const containers = document.querySelectorAll('[class*="DivCommentListContainer"], [class*="DivContentContainer"], [class*="DivInfoContainer"]');
    for (const c of containers) {
      c.scrollTop = c.scrollHeight;
    }
  });
  await page.waitForTimeout(3000);

  // Re-scan
  const afterScroll = await page.evaluate(() => {
    const all = document.querySelectorAll('[data-e2e*="comment"]');
    return Array.from(all).map(el => ({
      e2e: el.getAttribute('data-e2e'),
      tag: el.tagName,
      cls: el.className?.toString().slice(0, 80),
      text: el.textContent?.trim().slice(0, 100),
      kids: el.children.length,
    }));
  });

  console.log(`\n${TAG} After scroll - comment e2e elements: ${afterScroll.length}`);
  for (const el of afterScroll) {
    console.log(`  <${el.tag}> e2e="${el.e2e}" kids=${el.kids} text="${el.text}"`);
  }

  await page.screenshot({ path: '/tmp/ri-debug-4.png', fullPage: false });
  console.log(`\n${TAG} Screenshots: /tmp/ri-debug-3.png, /tmp/ri-debug-4.png`);

  await ctx.close();
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
