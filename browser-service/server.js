const express = require('express');
const { chromium } = require('playwright');
const { execSync, exec } = require('child_process');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());

const FLASHFLOW_EMAIL = process.env.FLASHFLOW_EMAIL;
const FLASHFLOW_PASSWORD = process.env.FLASHFLOW_PASSWORD;
const SERVICE_KEY = process.env.BROWSER_SERVICE_KEY || 'bsk_changeme';
const ADOBE_APP = process.env.ADOBE_CH_APP || 'Adobe Character Animator 2024';

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

// Run osascript from a temp file (avoids shell quoting issues with multi-line scripts)
const path = require('path');
const os = require('os');

function runOsascript(script, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `osascript-${Date.now()}.scpt`);
    fs.writeFileSync(tmpFile, script);
    exec(`osascript "${tmpFile}"`, { timeout: timeoutMs }, (err, stdout, stderr) => {
      fs.unlinkSync(tmpFile);
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

// Adobe Character Animator lip-sync
app.post('/desktop/adobe-sync', async (req, res) => {
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

    console.log(`Adobe sync: character="${characterName}" audio="${audioPath}" output="${outputPath}"`);

    // Step 1: Activate Adobe Character Animator
    await runOsascript(`tell application "${ADOBE_APP}" to activate`);
    console.log('Adobe Character Animator activated');

    // Step 2: Wait for app to come to foreground
    await new Promise(r => setTimeout(r, 3000));

    // Step 3: Use System Events to select character, import audio, record, and export
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
    console.error('Adobe sync error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Test endpoint: just activate Adobe
app.post('/desktop/adobe-open', async (req, res) => {
  try {
    await runOsascript(`tell application "${ADOBE_APP}" to activate`);
    res.json({ ok: true, message: `${ADOBE_APP} activated` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true, status: 'browser service running' }));

const PORT = 8100;
initBrowser().then(() => {
  app.listen(PORT, () => console.log(`Browser service on http://localhost:${PORT}`));
});
