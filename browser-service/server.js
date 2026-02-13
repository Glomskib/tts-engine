const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());

const FLASHFLOW_EMAIL = process.env.FLASHFLOW_EMAIL;
const FLASHFLOW_PASSWORD = process.env.FLASHFLOW_PASSWORD;
const SERVICE_KEY = process.env.BROWSER_SERVICE_KEY || 'bsk_changeme';

let browser, context;

// Auth middleware — skip for health check
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (req.headers['x-service-key'] !== SERVICE_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

// Initialize browser
async function initBrowser() {
  browser = await chromium.launch({ headless: false });
  context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  console.log('Browser ready');
}

// Login to FlashFlow
async function loginIfNeeded(page) {
  if (page.url().includes('login') || page.url().includes('auth')) {
    await page.fill('input[type="email"]', FLASHFLOW_EMAIL);
    await page.fill('input[type="password"]', FLASHFLOW_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ timeout: 10000 });
    console.log('Logged in');
  }
}

// Screenshot any page
app.post('/browser/screenshot', async (req, res) => {
  let page;
  try {
    const { url } = req.body;
    page = await context.newPage();
    await page.goto(url || 'https://flashflowai.com/admin/pipeline', { waitUntil: 'networkidle', timeout: 15000 });
    await loginIfNeeded(page);
    await page.waitForTimeout(2000);
    const buffer = await page.screenshot({ fullPage: true });
    const filename = `/tmp/screenshots/shot-${Date.now()}.png`;
    fs.writeFileSync(filename, buffer);
    res.json({ ok: true, path: filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (page) await page.close();
  }
});

// Review a video URL — screenshot the video player
function isYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
}

app.post('/browser/review-video', async (req, res) => {
  let page;
  try {
    const { videoUrl } = req.body;
    page = await context.newPage();

    if (isYouTubeUrl(videoUrl)) {
      // Navigate to YouTube and let the player load
      await page.goto(videoUrl, { waitUntil: 'networkidle', timeout: 20000 });
      // Dismiss consent dialog if it appears
      const consentBtn = page.locator('button:has-text("Accept all"), button:has-text("Reject all")');
      if (await consentBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await consentBtn.first().click();
        await page.waitForTimeout(1000);
      }
      // Click the video to start playback if paused
      const player = page.locator('#movie_player video, video');
      if (await player.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await player.first().click().catch(() => {});
      }
      await page.waitForTimeout(4000);
    } else {
      // Direct video file — use embedded player
      await page.setContent(`
        <video src="${videoUrl}" autoplay muted style="width:100%;height:100vh;object-fit:contain;background:black"></video>
      `);
      await page.waitForTimeout(3000);
    }

    const buffer = await page.screenshot();
    const filename = `/tmp/screenshots/video-review-${Date.now()}.png`;
    fs.writeFileSync(filename, buffer);
    res.json({ ok: true, path: filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (page) await page.close();
  }
});

// Check pipeline status
app.post('/browser/pipeline-status', async (req, res) => {
  let page;
  try {
    page = await context.newPage();
    await page.goto('https://flashflowai.com/admin/pipeline', { waitUntil: 'networkidle', timeout: 15000 });
    await loginIfNeeded(page);
    await page.waitForTimeout(3000);
    const buffer = await page.screenshot({ fullPage: true });
    const filename = `/tmp/screenshots/pipeline-${Date.now()}.png`;
    fs.writeFileSync(filename, buffer);
    res.json({ ok: true, path: filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (page) await page.close();
  }
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true, status: 'browser service running' }));

const PORT = 8100;
initBrowser().then(() => {
  app.listen(PORT, () => console.log(`Browser service on http://localhost:${PORT}`));
});
