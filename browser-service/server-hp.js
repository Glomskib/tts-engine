const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
require('dotenv').config();

const app = express();
app.use(express.json());

const SERVICE_KEY = process.env.BROWSER_SERVICE_KEY || 'bsk_changeme';
const DOWNLOADS_DIR = path.join(process.env.USERPROFILE || 'C:\\Users\\Brandon', 'Downloads');
const USER_DATA_DIR = path.join(process.env.USERPROFILE || 'C:\\Users\\Brandon', 'FlashFlow', 'chrome-data');
const SCREENSHOTS_DIR = path.join(process.env.USERPROFILE || 'C:\\Users\\Brandon', 'FlashFlow', 'screenshots');
const ANIMATE_URL = 'https://new.express.adobe.com/home/tools/animate-from-audio';
const ANIMATE_URL_PWA = 'https://new.express.adobe.com/home/tools/animate-from-audio?running_pwa_mode=true';

// Ensure dirs exist
[SCREENSHOTS_DIR, path.join(USER_DATA_DIR)].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Auth middleware — skip for health check
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (req.headers['x-service-key'] !== SERVICE_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

// ─── Persistent Playwright browser ──────────────────────────────────────────
// Uses a persistent context (user data dir) so Adobe/Google login survives restarts.
// First run: log in manually. After that, cookies persist.
let browserContext = null;
let adobePage = null;

async function initBrowser() {
  browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  // Remove webdriver flag from all pages
  browserContext.on('page', async (page) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
  });
  // Also add to existing pages
  for (const page of browserContext.pages()) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
  }
  console.log('Playwright persistent browser ready');
  console.log(`User data dir: ${USER_DATA_DIR}`);
}

// Get or create the Adobe Express animate page (reuses across requests)
async function getAdobePage() {
  // Check if existing page is still valid and on the animate page
  if (adobePage && !adobePage.isClosed()) {
    try {
      const url = adobePage.url();
      if (url.includes('animate-from-audio')) return adobePage;
    } catch (_) { /* page may be in bad state */ }
  }

  // Look for existing tab already on animate-from-audio
  for (const page of browserContext.pages()) {
    try {
      if (page.url().includes('animate-from-audio')) {
        adobePage = page;
        return adobePage;
      }
    } catch (_) {}
  }

  // Get or create a page
  const pages = browserContext.pages();
  const p = pages.length > 0 ? pages[0] : await browserContext.newPage();
  adobePage = p;

  // Navigate to animate URL
  console.log('  Navigating to animate URL...');
  try {
    await p.goto(ANIMATE_URL, { waitUntil: 'load', timeout: 45000 });
  } catch (e) {
    console.log(`  goto error: ${e.message}`);
  }

  // Wait briefly for initial page render
  await p.waitForTimeout(3000);

  // Lock the URL: override history.pushState/replaceState to prevent SPA from redirecting away
  console.log('  Locking URL to prevent SPA redirect...');
  await p.evaluate(() => {
    const targetPath = '/home/tools/animate-from-audio';
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);

    history.pushState = function(state, title, url) {
      if (url && typeof url === 'string' && !url.includes('animate-from-audio')) {
        console.log('[URL LOCK] Blocked pushState to:', url);
        return; // Block redirect
      }
      origPush(state, title, url);
    };

    history.replaceState = function(state, title, url) {
      if (url && typeof url === 'string' && !url.includes('animate-from-audio')) {
        console.log('[URL LOCK] Blocked replaceState to:', url);
        return; // Block redirect
      }
      origReplace(state, title, url);
    };

    // Mark that we've installed the lock
    window.__urlLockInstalled = true;
  });

  // Wait for SPA to settle (the lock should prevent redirect)
  await p.waitForTimeout(12000);

  const finalUrl = p.url();
  console.log(`  Final URL after lock: ${finalUrl}`);

  // If the SPA used window.location (full navigation) instead of history API,
  // the lock won't help. Check and try to navigate back.
  if (!finalUrl.includes('animate-from-audio')) {
    console.log('  SPA used full navigation redirect. Trying to navigate back...');

    // Navigate again
    await p.goto(ANIMATE_URL, { waitUntil: 'load', timeout: 45000 });
    await p.waitForTimeout(2000);

    // Re-install the lock AND also override location setter
    await p.evaluate(() => {
      const targetPath = '/home/tools/animate-from-audio';
      const origPush = history.pushState.bind(history);
      const origReplace = history.replaceState.bind(history);

      history.pushState = function(state, title, url) {
        if (url && typeof url === 'string' && !url.includes('animate-from-audio')) {
          console.log('[URL LOCK] Blocked pushState to:', url);
          return;
        }
        origPush(state, title, url);
      };

      history.replaceState = function(state, title, url) {
        if (url && typeof url === 'string' && !url.includes('animate-from-audio')) {
          console.log('[URL LOCK] Blocked replaceState to:', url);
          return;
        }
        origReplace(state, title, url);
      };

      window.__urlLockInstalled = true;
    });

    await p.waitForTimeout(15000);
    console.log(`  Final URL after second attempt: ${p.url()}`);
  }

  return adobePage;
}

// ─── Shadow DOM helpers ─────────────────────────────────────────────────────
// Adobe Express uses web components with shadow roots extensively.

const SHADOW_FIND_JS = `
function findInShadow(root, tag, text) {
  var all = root.querySelectorAll(tag);
  for (var i = 0; i < all.length; i++) {
    if (all[i].textContent.trim().toLowerCase() === text) return all[i];
  }
  var elems = root.querySelectorAll("*");
  for (var j = 0; j < elems.length; j++) {
    if (elems[j].shadowRoot) {
      var f = findInShadow(elems[j].shadowRoot, tag, text);
      if (f) return f;
    }
  }
  return null;
}`;

// Click an element found in shadow DOM by tag + text
async function shadowClick(page, tag, text) {
  return page.evaluate(({ tag, text, fnSrc }) => {
    eval(fnSrc);
    const el = findInShadow(document, tag, text);
    if (!el) return 'not found';
    el.click();
    return 'clicked';
  }, { tag, text, fnSrc: SHADOW_FIND_JS });
}

// Check if a shadow DOM element exists
async function shadowExists(page, tag, text) {
  return page.evaluate(({ tag, text, fnSrc }) => {
    eval(fnSrc);
    return findInShadow(document, tag, text) ? true : false;
  }, { tag, text, fnSrc: SHADOW_FIND_JS });
}

// Download a URL to a local file
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    }).on('error', (e) => { fs.unlinkSync(destPath); reject(e); });
  });
}

// ─── Health check ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    status: 'browser service running',
    platform: 'windows',
    hasAdobePage: adobePage && !adobePage.isClosed(),
  });
});

// ─── Screenshot ─────────────────────────────────────────────────────────────
app.post('/browser/screenshot', async (req, res) => {
  let page;
  try {
    const { url } = req.body;
    page = await browserContext.newPage();
    await page.goto(url || 'https://flashflowai.com', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    const filename = path.join(SCREENSHOTS_DIR, `shot-${Date.now()}.png`);
    await page.screenshot({ fullPage: true, path: filename });
    res.json({ ok: true, path: filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (page) await page.close();
  }
});

// ─── POST /adobe/create-animated-video ──────────────────────────────────────
// Automates Adobe Express "Animate from Audio" via Playwright.
// Uses fileChooser event (no OS file dialog), shadow DOM evaluate for buttons,
// Playwright download event for the output file.
// Character/category/background use whatever is currently set in the session.

app.post('/adobe/create-animated-video', async (req, res) => {
  const screenshots = {};
  try {
    const { audioPath, audioUrl, outputPath } = req.body;

    // Resolve audio file: download from URL or use local path
    let localAudioPath = audioPath;
    if (audioUrl && !audioPath) {
      localAudioPath = path.join(DOWNLOADS_DIR, `audio-${Date.now()}.mp3`);
      console.log(`Downloading audio from ${audioUrl}...`);
      await downloadFile(audioUrl, localAudioPath);
    }

    if (!localAudioPath) return res.status(400).json({ error: 'audioPath or audioUrl is required' });
    if (!fs.existsSync(localAudioPath)) return res.status(400).json({ error: `Audio file not found: ${localAudioPath}` });

    const finalOutput = outputPath || path.join(DOWNLOADS_DIR, `animated-${Date.now()}.mp4`);
    const finalDir = path.dirname(finalOutput);
    if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

    console.log(`create-animated-video: audio="${localAudioPath}" output="${finalOutput}"`);

    // Step 1: Navigate to animate-from-audio page
    console.log('Step 1: Getting Adobe Express page...');
    await getAdobePage();
    const activePage = adobePage;

    // Verify we're on the right page
    const currentUrl = activePage.url();
    console.log(`  Page URL: ${currentUrl}`);
    if (!currentUrl.includes('animate-from-audio')) {
      throw new Error(`Failed to navigate to animate-from-audio. Current URL: ${currentUrl}`);
    }

    // Dismiss any popups with Escape
    await activePage.keyboard.press('Escape');
    await activePage.waitForTimeout(500);

    // Wait for animate component to load (poll up to 60s)
    console.log('  Waiting for animate component...');
    let componentFound = false;
    for (let i = 0; i < 12; i++) {
      const hasComponent = await activePage.evaluate(() => {
        function check(root) {
          if (root.querySelector('x-animate-ui-component')) return true;
          const all = root.querySelectorAll('*');
          for (const el of all) {
            if (el.shadowRoot && check(el.shadowRoot)) return true;
          }
          return false;
        }
        return check(document);
      });
      if (hasComponent) { componentFound = true; break; }
      console.log(`  Component poll ${i + 1}/12...`);
      await activePage.waitForTimeout(5000);
    }
    if (!componentFound) {
      console.log('  WARNING: animate component not found after 60s, continuing anyway...');
    }

    // Take screenshot of initial state
    const initShot = path.join(SCREENSHOTS_DIR, `init-${Date.now()}.png`);
    await activePage.screenshot({ path: initShot });
    screenshots.initial = initShot;

    // Step 2: Upload audio file via fileChooser (bypasses OS file dialog)
    console.log('Step 2: Uploading audio file...');
    console.log(`  Current URL: ${activePage.url()}`);

    // First verify Browse link exists
    const hasBrowse = await shadowExists(activePage, 'sp-link', 'browse');
    if (!hasBrowse) {
      const pageUrl = activePage.url();
      const pageTitle = await activePage.title();
      throw new Error(`Browse link not found. Page: ${pageTitle} (${pageUrl})`);
    }

    // Set up fileChooser listener BEFORE clicking browse
    const [fileChooser] = await Promise.all([
      activePage.waitForEvent('filechooser', { timeout: 10000 }),
      // Click the browse link in shadow DOM
      activePage.evaluate((fnSrc) => {
        eval(fnSrc);
        const el = findInShadow(document, 'sp-link', 'browse');
        el.click();
      }, SHADOW_FIND_JS),
    ]);

    // Set the file directly — no OS dialog needed!
    await fileChooser.setFiles(localAudioPath);
    console.log('  Audio file set via fileChooser');

    // Take screenshot after upload
    await activePage.waitForTimeout(2000);
    const uploadShot = path.join(SCREENSHOTS_DIR, `upload-${Date.now()}.png`);
    await activePage.screenshot({ path: uploadShot });
    screenshots.uploaded = uploadShot;

    // Step 3: Wait for rendering to complete (poll for Download button, up to 5 min)
    console.log('Step 3: Waiting for rendering...');
    let renderComplete = false;

    for (let i = 0; i < 30; i++) {
      await activePage.waitForTimeout(10000);

      // Check for Download button in shadow DOM
      const hasDownload = await shadowExists(activePage, 'sp-button', 'download');
      console.log(`  Render poll ${i + 1}/30: ${hasDownload ? 'READY' : 'rendering...'}`);

      if (hasDownload) {
        renderComplete = true;
        break;
      }
    }

    if (!renderComplete) {
      const timeoutShot = path.join(SCREENSHOTS_DIR, `timeout-${Date.now()}.png`);
      await activePage.screenshot({ path: timeoutShot });
      screenshots.renderTimeout = timeoutShot;
      throw new Error('Rendering timed out after 5 minutes');
    }

    const renderShot = path.join(SCREENSHOTS_DIR, `render-${Date.now()}.png`);
    await activePage.screenshot({ path: renderShot });
    screenshots.renderComplete = renderShot;

    // Step 4: Click Download and capture the file
    console.log('Step 4: Clicking Download...');

    const [download] = await Promise.all([
      activePage.waitForEvent('download', { timeout: 30000 }),
      shadowClick(activePage, 'sp-button', 'download'),
    ]);

    // Wait for download to complete
    const downloadPath = await download.path();
    console.log(`  Downloaded to temp: ${downloadPath}`);

    // Copy to final output path
    fs.copyFileSync(downloadPath, finalOutput);
    const stats = fs.statSync(finalOutput);
    console.log(`  Output: ${finalOutput} (${stats.size} bytes)`);

    // Step 5: Navigate back to animate page for next request
    console.log('Step 5: Resetting for next request...');
    await activePage.goto(ANIMATE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    res.json({
      ok: true,
      outputPath: finalOutput,
      size: stats.size,
      screenshots,
    });
  } catch (e) {
    console.error('create-animated-video error:', e.message);
    try {
      if (adobePage && !adobePage.isClosed()) {
        const errShot = path.join(SCREENSHOTS_DIR, `error-${Date.now()}.png`);
        await adobePage.screenshot({ path: errShot });
        screenshots.error = errShot;
      }
    } catch (_) {}
    res.status(500).json({ error: e.message, screenshots });
  }
});

// ─── Adobe Express status ───────────────────────────────────────────────────
app.get('/desktop/adobe-express-status', async (req, res) => {
  try {
    const page = await getAdobePage();
    res.json({ ok: true, url: page.url(), title: await page.title() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Start server ───────────────────────────────────────────────────────────
const PORT = 8100;
const HOST = '0.0.0.0';
initBrowser().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`Browser service on http://${HOST}:${PORT}`);
    console.log(`Platform: Windows HP`);
    console.log(`Screenshots: ${SCREENSHOTS_DIR}`);
    console.log(`\nFirst run? Log into Adobe Express in the browser window that opened.`);
    console.log(`Then test: curl http://localhost:${PORT}/health`);
  });
});
