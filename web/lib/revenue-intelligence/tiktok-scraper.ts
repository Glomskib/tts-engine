/**
 * Revenue Intelligence – TikTok Comment Scraper
 *
 * Playwright-based scraper that:
 * 1. Launches a persistent browser context (reusing saved TikTok session)
 * 2. Navigates to the creator's profile
 * 3. Scrapes the latest N videos
 * 4. For each video, extracts comments (up to configurable limit)
 * 5. Returns structured data for the ingestion service
 *
 * Handles login expiration gracefully by detecting redirect and returning
 * a clear error instead of crashing.
 */

import { chromium, type BrowserContext, type Page, type ElementHandle } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { PROFILE, VIDEO_PAGE, COMMENTS, LOGIN_INDICATORS } from './tiktok-selectors';
import type {
  ScrapedVideo,
  ScrapedComment,
  VideoScrapeResult,
  IngestionConfig,
  DEFAULT_INGESTION_CONFIG,
} from './types';

const TAG = '[ri:scraper]';

// ── Configuration ──────────────────────────────────────────────

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const NAV_TIMEOUT = 30_000;
const COMMENT_LOAD_TIMEOUT = 5_000;
const ANTI_DETECT_DELAY_MIN = 1500;
const ANTI_DETECT_DELAY_MAX = 3000;

function getProfileDir(accountUsername: string, customPath?: string | null): string {
  if (customPath) return customPath;
  return path.join(
    process.env.HOME ?? process.cwd(),
    '.openclaw',
    'browser-profiles',
    `ri-tiktok-${accountUsername}`,
  );
}

// ── Anti-detection delay ───────────────────────────────────────

function randomDelay(): number {
  return ANTI_DETECT_DELAY_MIN + Math.random() * (ANTI_DETECT_DELAY_MAX - ANTI_DETECT_DELAY_MIN);
}

// ── Browser lifecycle ──────────────────────────────────────────

export async function launchBrowser(
  profileDir: string,
  headless: boolean,
): Promise<BrowserContext> {
  fs.mkdirSync(profileDir, { recursive: true });

  // Clean stale lock files
  for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    const lockPath = path.join(profileDir, lock);
    try { fs.unlinkSync(lockPath); } catch { /* doesn't exist */ }
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: { width: 1280, height: 900 },
    userAgent: USER_AGENT,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  console.log(`${TAG} Browser launched (headless=${headless}, profile=${profileDir})`);
  return context;
}

export async function closeBrowser(context: BrowserContext): Promise<void> {
  await context.close();
  console.log(`${TAG} Browser closed`);
}

// ── Login detection ────────────────────────────────────────────

async function isLoginRequired(page: Page): Promise<boolean> {
  const url = page.url();
  for (const pattern of LOGIN_INDICATORS.loginUrlPatterns) {
    if (url.includes(pattern)) return true;
  }

  for (const sel of LOGIN_INDICATORS.loginForm) {
    try {
      const el = await page.$(sel);
      if (el) {
        const visible = await el.isVisible();
        if (visible) return true;
      }
    } catch { /* next */ }
  }

  return false;
}

// ── Try selectors helper ───────────────────────────────────────

async function tryText(page: Page | ElementHandle, selectors: readonly string[]): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = 'locator' in page
        ? await (page as Page).$(sel)
        : await (page as ElementHandle).$(sel);
      if (!el) continue;
      const text = await el.textContent();
      if (text?.trim()) return text.trim();
    } catch { /* next */ }
  }
  return null;
}

async function tryAttribute(
  container: ElementHandle,
  selectors: readonly string[],
  attr: string,
): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = await container.$(sel);
      if (!el) continue;
      const val = await el.getAttribute(attr);
      if (val) return val;
    } catch { /* next */ }
  }
  return null;
}

// ── Scrape video list from profile ─────────────────────────────

export async function scrapeVideoList(
  page: Page,
  username: string,
  maxVideos: number,
): Promise<Array<{ url: string; platformVideoId: string }>> {
  const profileUrl = `https://www.tiktok.com/@${username}`;
  console.log(`${TAG} Navigating to profile: ${profileUrl}`);

  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await page.waitForTimeout(randomDelay());

  if (await isLoginRequired(page)) {
    throw new Error('LOGIN_REQUIRED');
  }

  // Wait for video grid to load, with retry on "Something went wrong"
  let videoCards: ElementHandle[] = [];
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Check for "Something went wrong" error and click Refresh
    try {
      const refreshBtn = await page.$('button:has-text("Refresh")');
      if (refreshBtn && await refreshBtn.isVisible()) {
        console.log(`${TAG} TikTok error page detected — clicking Refresh (attempt ${attempt + 1})`);
        await refreshBtn.click();
        await page.waitForTimeout(3000 + randomDelay());
      }
    } catch { /* no refresh button, that's fine */ }

    for (const sel of PROFILE.videoCards) {
      try {
        await page.waitForSelector(sel, { timeout: 8000 });
        videoCards = await page.$$(sel);
        if (videoCards.length > 0) {
          console.log(`${TAG} Found ${videoCards.length} video cards (selector: ${sel})`);
          break;
        }
      } catch { /* next selector */ }
    }

    if (videoCards.length > 0) break;

    if (attempt < MAX_RETRIES) {
      console.log(`${TAG} No video cards found, retrying in 5s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await page.waitForTimeout(5000);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await page.waitForTimeout(randomDelay());
    }
  }

  if (videoCards.length === 0) {
    console.warn(`${TAG} No video cards found on profile after retries`);
    return [];
  }

  const videos: Array<{ url: string; platformVideoId: string }> = [];
  const limit = Math.min(videoCards.length, maxVideos);

  for (let i = 0; i < limit; i++) {
    try {
      const href = await tryAttribute(videoCards[i], PROFILE.videoLink, 'href');
      if (!href) continue;

      // Normalize URL
      const fullUrl = href.startsWith('http') ? href : `https://www.tiktok.com${href}`;

      // Extract video ID from URL: /video/1234567890
      const videoIdMatch = fullUrl.match(/\/video\/(\d+)/);
      if (!videoIdMatch) continue;

      videos.push({
        url: fullUrl,
        platformVideoId: videoIdMatch[1],
      });
    } catch (err) {
      console.warn(`${TAG} Failed to extract video card ${i}:`, err);
    }
  }

  console.log(`${TAG} Extracted ${videos.length} video URLs`);
  return videos;
}

// ── Scrape comments from a single video ────────────────────────

export async function scrapeVideoComments(
  page: Page,
  videoUrl: string,
  platformVideoId: string,
  maxComments: number,
): Promise<VideoScrapeResult> {
  const errors: string[] = [];

  console.log(`${TAG} Scraping comments: ${videoUrl}`);
  await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await page.waitForTimeout(randomDelay());

  if (await isLoginRequired(page)) {
    return {
      video: { platform_video_id: platformVideoId, caption: null, video_url: videoUrl, comment_count: null },
      comments: [],
      errors: ['LOGIN_REQUIRED'],
    };
  }

  // Extract video metadata
  const caption = await tryText(page, VIDEO_PAGE.caption);
  const commentCountText = await tryText(page, VIDEO_PAGE.commentCount);
  const commentCount = commentCountText ? parseCount(commentCountText) : null;

  const video: ScrapedVideo = {
    platform_video_id: platformVideoId,
    caption,
    video_url: videoUrl,
    comment_count: commentCount,
  };

  // Dismiss any overlays (keyboard shortcuts, etc.)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Click the comment icon to activate the comment panel —
  // TikTok lazy-loads comments only after this click
  for (const sel of COMMENTS.commentButton) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) {
        await btn.click();
        console.log(`${TAG} Activated comment panel`);
        break;
      }
    } catch { /* next */ }
  }
  await page.waitForTimeout(3000);

  // Scroll the comment list container to load more comments
  let previousCount = 0;
  let noNewCommentsRounds = 0;
  const MAX_SCROLL_ROUNDS = 10;

  for (let round = 0; round < MAX_SCROLL_ROUNDS; round++) {
    let commentEls: ElementHandle[] = [];
    for (const sel of COMMENTS.commentItem) {
      commentEls = await page.$$(sel);
      if (commentEls.length > 0) break;
    }

    if (commentEls.length >= maxComments) break;

    if (commentEls.length === previousCount) {
      noNewCommentsRounds++;
      if (noNewCommentsRounds >= 2) break;
    } else {
      noNewCommentsRounds = 0;
    }
    previousCount = commentEls.length;

    // Try "View more comments" button
    let clicked = false;
    for (const sel of COMMENTS.loadMore) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(1500);
          clicked = true;
          break;
        }
      } catch { /* next */ }
    }

    if (!clicked) {
      // Scroll the comment list container to trigger lazy loading
      await page.evaluate((containerSelectors: string[]) => {
        for (const sel of containerSelectors) {
          const container = document.querySelector(sel);
          if (container) {
            container.scrollTop += 800;
            return;
          }
        }
        window.scrollBy(0, 400);
      }, [...COMMENTS.commentListContainer]);
      await page.waitForTimeout(1500);
    }
  }

  // Extract comments
  const comments: ScrapedComment[] = [];
  let commentEls: ElementHandle[] = [];
  for (const sel of COMMENTS.commentItem) {
    commentEls = await page.$$(sel);
    if (commentEls.length > 0) break;
  }

  console.log(`${TAG} Found ${commentEls.length} comment elements`);
  const limit = Math.min(commentEls.length, maxComments);

  for (let i = 0; i < limit; i++) {
    try {
      const el = commentEls[i];
      const commentText = await tryText(el, COMMENTS.commentText);
      if (!commentText) continue;

      // Extract username from link href (more reliable than display name text)
      let username: string | null = null;
      let displayName: string | null = null;
      try {
        const userLink = await el.$('a[href*="/@"]');
        if (userLink) {
          const href = await userLink.getAttribute('href');
          if (href) {
            const match = href.match(/\/@([^/?]+)/);
            if (match) username = match[1];
          }
        }
      } catch { /* fallback below */ }

      // Fallback: use the display name text
      if (!username) {
        username = await tryText(el, COMMENTS.username);
      }
      if (!username) continue;

      displayName = await tryText(el, COMMENTS.username);
      const likeText = await tryText(el, COMMENTS.likeCount);
      const replyText = await tryText(el, COMMENTS.replyCount);
      const timestampText = await tryText(el, COMMENTS.timestamp);

      // Try to get comment ID from data attribute
      let commentId = await el.getAttribute(COMMENTS.commentIdAttr);
      if (!commentId) {
        // Fallback: generate deterministic ID from content
        commentId = `${platformVideoId}_${hashString(username + commentText)}`;
      }

      comments.push({
        platform_comment_id: commentId,
        comment_text: commentText,
        commenter_username: cleanUsername(username),
        commenter_display_name: displayName !== username ? displayName : null,
        like_count: likeText ? parseCount(likeText) : 0,
        reply_count: replyText ? parseReplyCount(replyText) : 0,
        is_reply: false,
        parent_comment_id: null,
        posted_at: timestampText ? parseRelativeTimestamp(timestampText) : null,
        raw_json: {
          like_text: likeText,
          reply_text: replyText,
          timestamp_text: timestampText,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Comment ${i}: ${msg}`);
    }
  }

  console.log(`${TAG} Extracted ${comments.length} comments from ${videoUrl}`);
  return { video, comments, errors };
}

// ── Full account scrape ────────────────────────────────────────

export async function scrapeAccount(
  username: string,
  profilePath: string | null,
  config: { maxVideos: number; maxComments: number; headless: boolean },
): Promise<{ results: VideoScrapeResult[]; errors: string[]; loginRequired: boolean }> {
  const profileDir = getProfileDir(username, profilePath);
  const topErrors: string[] = [];
  let loginRequired = false;
  let context: BrowserContext | null = null;

  try {
    context = await launchBrowser(profileDir, config.headless);
    const page = context.pages()[0] || await context.newPage();

    // Get video list
    let videoList: Array<{ url: string; platformVideoId: string }>;
    try {
      videoList = await scrapeVideoList(page, username, config.maxVideos);
    } catch (err) {
      if (err instanceof Error && err.message === 'LOGIN_REQUIRED') {
        loginRequired = true;
        return { results: [], errors: ['Login expired — re-run bootstrap'], loginRequired };
      }
      throw err;
    }

    if (videoList.length === 0) {
      return { results: [], errors: ['No videos found on profile'], loginRequired: false };
    }

    // Scrape comments from each video
    const results: VideoScrapeResult[] = [];

    for (const video of videoList) {
      try {
        const result = await scrapeVideoComments(
          page,
          video.url,
          video.platformVideoId,
          config.maxComments,
        );

        if (result.errors.includes('LOGIN_REQUIRED')) {
          loginRequired = true;
          topErrors.push('Login expired mid-scrape');
          break;
        }

        results.push(result);

        // Anti-detection delay between videos
        await page.waitForTimeout(randomDelay());
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        topErrors.push(`Video ${video.platformVideoId}: ${msg}`);
        console.error(`${TAG} Error scraping video:`, msg);
      }
    }

    return { results, errors: topErrors, loginRequired };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    topErrors.push(msg);
    return { results: [], errors: topErrors, loginRequired };
  } finally {
    if (context) {
      await closeBrowser(context);
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────

function parseCount(text: string): number {
  const cleaned = text.replace(/[,\s]/g, '').toLowerCase();
  const match = cleaned.match(/([\d.]+)([kmb]?)/);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  const suffix = match[2];

  switch (suffix) {
    case 'k': return Math.round(num * 1_000);
    case 'm': return Math.round(num * 1_000_000);
    case 'b': return Math.round(num * 1_000_000_000);
    default: return Math.round(num);
  }
}

function parseReplyCount(text: string): number {
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function cleanUsername(raw: string): string {
  return raw.replace(/^@/, '').trim();
}

/**
 * Parse relative timestamps like "2d", "1w", "3h", "5m"
 * into an ISO string. Falls back to null if unparseable.
 */
function parseRelativeTimestamp(text: string): string | null {
  const cleaned = text.trim().toLowerCase();
  const now = Date.now();

  const match = cleaned.match(/^(\d+)\s*(s|m|h|d|w|mo|y)/);
  if (!match) return null;

  const num = parseInt(match[1], 10);
  const unit = match[2];

  const ms: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
    mo: 2_592_000_000,
    y: 31_536_000_000,
  };

  const offset = ms[unit];
  if (!offset) return null;

  return new Date(now - num * offset).toISOString();
}

/**
 * Simple string hash for generating deterministic comment IDs
 * when the DOM doesn't expose a native comment ID.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
