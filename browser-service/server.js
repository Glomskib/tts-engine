const express = require('express');
const { chromium } = require('playwright');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());

const FLASHFLOW_EMAIL = process.env.FLASHFLOW_EMAIL;
const FLASHFLOW_PASSWORD = process.env.FLASHFLOW_PASSWORD;
const SERVICE_KEY = process.env.BROWSER_SERVICE_KEY || 'bsk_changeme';
const HP_WORKER_URL = process.env.HP_WORKER_URL || 'http://HP_WORKER_IP:8100';

let browser, context;

// Auth middleware — skip for health check
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (req.headers['x-service-key'] !== SERVICE_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

// Initialize Playwright browser (for screenshots only — NOT for Google/Adobe login)
async function initBrowser() {
  browser = await chromium.launch({ headless: false });
  context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  console.log('Playwright browser ready');
}

// Login to FlashFlow (only triggers on flashflowai.com)
async function loginIfNeeded(page) {
  const url = page.url();
  if (url.includes('flashflowai.com') && (url.includes('login') || url.includes('auth'))) {
    await page.fill('input[type="email"]', FLASHFLOW_EMAIL);
    await page.fill('input[type="password"]', FLASHFLOW_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ timeout: 10000 });
    console.log('Logged in to FlashFlow');
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
      await page.goto(videoUrl, { waitUntil: 'networkidle', timeout: 20000 });
      const consentBtn = page.locator('button:has-text("Accept all"), button:has-text("Reject all")');
      if (await consentBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await consentBtn.first().click();
        await page.waitForTimeout(1000);
      }
      const player = page.locator('#movie_player video, video');
      if (await player.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await player.first().click().catch(() => {});
      }
      await page.waitForTimeout(4000);
    } else {
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

// ─── osascript helper ──────────────────────────────────────────────────────────
function runOsascript(script, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join('/tmp', `osascript-${Date.now()}.scpt`);
    fs.writeFileSync(tmpFile, script);
    exec(`osascript "${tmpFile}"`, { timeout: timeoutMs }, (err, stdout, stderr) => {
      fs.unlinkSync(tmpFile);
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

// ─── Adobe Express PWA (Chrome on this Mac Mini) ──────────────────────────────
// The PWA is already open and logged in — we control it via Chrome AppleScript.
// NEVER use Playwright to log into Google or Adobe.

// Navigate the PWA to any Adobe Express URL
app.post('/desktop/adobe-express-navigate', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });
    await runOsascript(`tell application "Google Chrome" to set URL of active tab of window 1 to "${url}"`);
    await new Promise(r => setTimeout(r, 3000));
    const currentUrl = await runOsascript('tell application "Google Chrome" to get URL of active tab of window 1');
    res.json({ ok: true, url: currentUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get current Adobe Express PWA state
app.get('/desktop/adobe-express-status', async (req, res) => {
  try {
    const url = await runOsascript('tell application "Google Chrome" to get URL of active tab of window 1');
    const title = await runOsascript('tell application "Google Chrome" to get title of active tab of window 1');
    res.json({ ok: true, url, title });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Execute JavaScript in the Adobe Express PWA
app.post('/desktop/adobe-express-exec', async (req, res) => {
  try {
    const { js } = req.body;
    if (!js) return res.status(400).json({ error: 'js is required' });
    const result = await runOsascript(
      `tell application "Google Chrome" to execute active tab of window 1 javascript "${js.replace(/"/g, '\\"')}"`
    );
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Screenshot the Adobe Express PWA via screencapture (native macOS)
app.post('/desktop/adobe-express-screenshot', async (req, res) => {
  try {
    // Bring Chrome to front
    await runOsascript('tell application "Google Chrome" to activate');
    await new Promise(r => setTimeout(r, 1000));
    const filename = `/tmp/screenshots/adobe-express-${Date.now()}.png`;
    await new Promise((resolve, reject) => {
      exec(`screencapture -x "${filename}"`, { timeout: 10000 }, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    res.json({ ok: true, path: filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── HP Worker: Adobe Character Animator (remote) ──────────────────────────────
// Character Animator runs on the HP Worker machine.
// This endpoint proxies the request to the HP Worker's browser-service.
// Configure HP_WORKER_URL in .env once the HP Worker is set up.

app.post('/desktop/adobe-sync', async (req, res) => {
  try {
    const { audioPath, characterName, outputPath } = req.body;
    if (!audioPath || !characterName || !outputPath) {
      return res.status(400).json({ error: 'audioPath, characterName, and outputPath are required' });
    }

    console.log(`Proxying adobe-sync to HP Worker: ${HP_WORKER_URL}`);

    // Forward the request to the HP Worker
    const response = await fetch(`${HP_WORKER_URL}/desktop/adobe-sync-local`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': SERVICE_KEY,
      },
      body: JSON.stringify({ audioPath, characterName, outputPath }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (e) {
    console.error('HP Worker proxy error:', e.message);
    res.status(500).json({
      error: `Cannot reach HP Worker at ${HP_WORKER_URL}: ${e.message}`,
      hint: 'Set HP_WORKER_URL in .env to the HP Worker Tailscale IP',
    });
  }
});

// ─── HP Worker local endpoint (runs ON the HP Worker only) ─────────────────────
// This is the actual osascript automation. Deploy browser-service on the HP Worker
// and this endpoint will control Adobe Character Animator locally.

const ADOBE_APP = process.env.ADOBE_CH_APP || 'Adobe Character Animator 2025';

app.post('/desktop/adobe-sync-local', async (req, res) => {
  try {
    const { audioPath, characterName, outputPath } = req.body;
    if (!audioPath || !characterName || !outputPath) {
      return res.status(400).json({ error: 'audioPath, characterName, and outputPath are required' });
    }

    if (!fs.existsSync(audioPath)) {
      return res.status(400).json({ error: `Audio file not found: ${audioPath}` });
    }

    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`Adobe sync local: character="${characterName}" audio="${audioPath}" output="${outputPath}"`);

    // Step 1: Activate Adobe Character Animator
    await runOsascript(`tell application "${ADOBE_APP}" to activate`);
    console.log('Adobe Character Animator activated');
    await new Promise(r => setTimeout(r, 3000));

    // Step 2: Use System Events to select character, import audio, record, and export
    const syncScript = `tell application "System Events"
  tell process "${ADOBE_APP}"
    set frontmost to true
    delay 1

    -- Open puppet: File > Open (Cmd+O)
    keystroke "o" using {command down}
    delay 2
    keystroke "${characterName}"
    delay 1
    keystroke return
    delay 3

    -- Import audio: File > Import (Cmd+I)
    keystroke "i" using {command down}
    delay 2
    -- Navigate to audio path
    keystroke "g" using {command down, shift down}
    delay 1
    keystroke "${audioPath}"
    delay 0.5
    keystroke return
    delay 1
    keystroke return
    delay 3

    -- Start recording (R key in Character Animator)
    keystroke "r"
    delay 2

    -- Wait for audio playback (30s default — adjust per clip)
    delay 30

    -- Stop recording (spacebar)
    keystroke " "
    delay 2

    -- Export: File > Export
    click menu item "Export" of menu "File" of menu bar 1
    delay 2

    -- Set output path via Go To dialog
    keystroke "g" using {command down, shift down}
    delay 1
    keystroke "${outputPath}"
    delay 0.5
    keystroke return
    delay 1
    keystroke return
    delay 5

  end tell
end tell`;

    await runOsascript(syncScript, 180000);
    console.log('Adobe sync complete');

    await new Promise(r => setTimeout(r, 5000));
    const exists = fs.existsSync(outputPath);

    res.json({ ok: true, outputPath, exported: exists });
  } catch (e) {
    console.error('Adobe sync local error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── cliclick / keyboard helpers ─────────────────────────────────────────────
function cliclick(action) {
  return new Promise((resolve, reject) => {
    exec(`/opt/homebrew/bin/cliclick ${action}`, { timeout: 5000 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}

function keystroke(keys, modifiers) {
  const mod = modifiers ? ` using {${modifiers}}` : '';
  return runOsascript(`tell application "System Events" to keystroke "${keys}"${mod}`);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Execute JS in Chrome active tab and return result
function chromeJS(js) {
  const escaped = js.replace(/"/g, '\\"');
  return runOsascript(
    `tell application "Google Chrome" to execute active tab of window 1 javascript "${escaped}"`
  );
}

// Shadow DOM helper JS — finds an element by tag+text through nested shadow roots
const SHADOW_FIND_FN = `
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

// Get Chrome viewport offset (screen Y where viewport starts)
async function getViewportOffset() {
  const info = JSON.parse(await chromeJS(
    'JSON.stringify({innerHeight:window.innerHeight,outerHeight:window.outerHeight,screenY:window.screenY})'
  ));
  const chromeUI = info.outerHeight - info.innerHeight;
  return { x: 0, y: info.screenY + chromeUI };
}

// ─── POST /adobe/create-animated-video ───────────────────────────────────────
// Automates Adobe Express "Animate from Audio" via Chrome PWA.
// Uses cliclick for file dialog, JS for shadow DOM buttons, screencapture for verification.
// Character/category/background use whatever is currently set in the PWA.

app.post('/adobe/create-animated-video', async (req, res) => {
  const screenshots = {};
  try {
    const { audioPath, outputPath } = req.body;
    if (!audioPath) return res.status(400).json({ error: 'audioPath is required' });
    if (!fs.existsSync(audioPath)) return res.status(400).json({ error: `Audio file not found: ${audioPath}` });

    const audioBasename = path.basename(audioPath, path.extname(audioPath));
    const finalOutput = outputPath || `/tmp/screenshots/animated-${Date.now()}.mp4`;
    const finalDir = path.dirname(finalOutput);
    if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

    console.log(`create-animated-video: audio="${audioPath}" output="${finalOutput}"`);

    // Step 1: Navigate to animate-from-audio page
    console.log('Step 1: Navigating to animate-from-audio...');
    await runOsascript('tell application "Google Chrome" to set URL of active tab of window 1 to "https://new.express.adobe.com/home/tools/animate-from-audio"');
    await delay(8000);

    // Wait for animate component to load (poll up to 30s)
    for (let i = 0; i < 6; i++) {
      const hasComponent = await chromeJS(`
        (function() {
          function check(root) {
            if (root.querySelector("x-animate-ui-component")) return true;
            var all = root.querySelectorAll("*");
            for (var i = 0; i < all.length; i++) {
              if (all[i].shadowRoot && check(all[i].shadowRoot)) return true;
            }
            return false;
          }
          return check(document) ? "true" : "false";
        })()
      `);
      if (hasComponent === 'true') break;
      await delay(5000);
    }

    // Step 2: Click Browse to open file dialog
    console.log('Step 2: Clicking Browse...');
    await runOsascript('tell application "Google Chrome" to activate');
    await delay(500);

    // Get viewport offset for coordinate mapping
    const offset = await getViewportOffset();

    // Find Browse link position via JS
    const browseInfo = await chromeJS(`
      (function() {
        ${SHADOW_FIND_FN}
        var el = findInShadow(document, "sp-link", "browse");
        if (!el) return "null";
        var r = el.getBoundingClientRect();
        return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2});
      })()
    `);

    if (browseInfo === 'null') {
      throw new Error('Browse link not found on page');
    }

    const browsePos = JSON.parse(browseInfo);
    const screenX = Math.round(browsePos.x + offset.x);
    const screenY = Math.round(browsePos.y + offset.y);

    await cliclick(`c:${screenX},${screenY}`);
    await delay(2000);

    // Verify file dialog opened (take screenshot)
    const dialogShot = `/tmp/screenshots/dialog-${Date.now()}.png`;
    await new Promise((resolve, reject) => {
      exec(`screencapture -x "${dialogShot}"`, { timeout: 5000 }, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    screenshots.fileDialog = dialogShot;

    // Step 3: Navigate to audio file in dialog
    console.log('Step 3: Navigating to audio file...');
    await keystroke('g', 'command down, shift down');
    await delay(1000);
    await keystroke('a', 'command down');
    await delay(300);
    await runOsascript(`tell application "System Events" to keystroke "${audioPath}"`);
    await delay(500);
    await runOsascript('tell application "System Events" to keystroke return');
    await delay(1500);
    // Press Enter again to select the file
    await runOsascript('tell application "System Events" to keystroke return');
    await delay(5000);

    // Step 4: Wait for rendering to complete (poll for download button, up to 3 min)
    console.log('Step 4: Waiting for rendering...');
    let downloadFound = false;
    for (let i = 0; i < 18; i++) {
      await delay(10000);
      const result = await chromeJS(`
        (function() {
          ${SHADOW_FIND_FN}
          var dl = findInShadow(document, "sp-button", "download");
          if (dl) {
            var r = dl.getBoundingClientRect();
            return r.width > 0 ? "ready" : "hidden";
          }
          return "rendering";
        })()
      `);
      console.log(`  Render poll ${i + 1}: ${result}`);
      if (result === 'ready') {
        downloadFound = true;
        break;
      }
    }

    if (!downloadFound) {
      const renderShot = `/tmp/screenshots/render-timeout-${Date.now()}.png`;
      await new Promise((resolve, reject) => {
        exec(`screencapture -x "${renderShot}"`, { timeout: 5000 }, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      screenshots.renderTimeout = renderShot;
      throw new Error('Rendering timed out after 3 minutes');
    }

    // Take post-render screenshot
    const renderShot = `/tmp/screenshots/render-done-${Date.now()}.png`;
    await new Promise((resolve, reject) => {
      exec(`screencapture -x "${renderShot}"`, { timeout: 5000 }, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    screenshots.renderComplete = renderShot;

    // Step 5: Click Download via JS
    console.log('Step 5: Clicking Download...');
    const clickResult = await chromeJS(`
      (function() {
        ${SHADOW_FIND_FN}
        var btn = findInShadow(document, "sp-button", "download");
        if (!btn) return "not found";
        btn.click();
        return "clicked";
      })()
    `);

    if (clickResult !== 'clicked') {
      throw new Error('Download button not found or not clickable');
    }

    // Step 6: Wait for file to appear in ~/Downloads/
    console.log('Step 6: Waiting for download...');
    const downloadsDir = path.join(process.env.HOME || '/Users/brandonglomski', 'Downloads');
    let downloadedFile = null;
    const startTime = Date.now();

    for (let i = 0; i < 30; i++) {
      await delay(2000);
      const files = fs.readdirSync(downloadsDir)
        .filter(f => f.endsWith('.mp4') && !f.endsWith('.crdownload'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(downloadsDir, f)).mtimeMs }))
        .filter(f => f.mtime > startTime - 5000)
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > 0) {
        downloadedFile = path.join(downloadsDir, files[0].name);
        break;
      }
    }

    if (!downloadedFile) {
      throw new Error('Download did not complete within 60 seconds');
    }

    console.log(`Downloaded: ${downloadedFile}`);

    // Step 7: Move to output path
    fs.copyFileSync(downloadedFile, finalOutput);
    const stats = fs.statSync(finalOutput);
    console.log(`Output: ${finalOutput} (${stats.size} bytes)`);

    res.json({
      ok: true,
      outputPath: finalOutput,
      size: stats.size,
      downloadedFrom: downloadedFile,
      screenshots,
    });
  } catch (e) {
    console.error('create-animated-video error:', e.message);
    // Try to capture error state screenshot
    try {
      const errShot = `/tmp/screenshots/error-${Date.now()}.png`;
      exec(`screencapture -x "${errShot}"`);
      screenshots.error = errShot;
    } catch (_) {}
    res.status(500).json({ error: e.message, screenshots });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true, status: 'browser service running' }));

const PORT = 8100;
initBrowser().then(() => {
  app.listen(PORT, () => console.log(`Browser service on http://localhost:${PORT}`));
});
