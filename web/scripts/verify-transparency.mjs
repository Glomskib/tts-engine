/**
 * verify-transparency.mjs
 * Run from web/ directory: node scripts/verify-transparency.mjs
 */
import pkg from '../node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.js';
const { chromium } = pkg;
import fs from 'fs';
import { execSync } from 'child_process';

const PORT = process.env.PORT || 3333;
const URL  = `http://localhost:${PORT}/tools/tok-comment`;
const OUT  = '/tmp/tok-comment-test.png';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  // Intercept the anchor .click() to capture the data URL instead of downloading
  await page.addInitScript(() => {
    const _orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href && this.href.startsWith('data:image/png')) {
        window.__capturedPng = this.href;
        return;
      }
      _orig.call(this);
    };
  });

  console.log(`Navigating to ${URL} …`);
  await page.goto(URL, { waitUntil: 'networkidle' });

  // Fill inputs
  await page.fill('input[placeholder="originalcommenter"]', 'testuser');
  await page.fill('input[placeholder="yourcreatorhandle"]', 'myhandle');
  await page.fill('textarea[placeholder="Type the comment text here..."]', 'This is a transparency test 👀');
  await page.waitForTimeout(400);

  // Click download
  await page.click('button:has-text("Download PNG")');
  await page.waitForTimeout(2000);

  const capturedDataUrl = await page.evaluate(() => window.__capturedPng);
  await browser.close();

  if (!capturedDataUrl) {
    console.error('❌  No PNG data URL captured — export may have failed or took too long.');
    process.exit(1);
  }

  const base64 = capturedDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(OUT, Buffer.from(base64, 'base64'));
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`✅  PNG saved: ${OUT} (${kb} KB)`);

  // Verify alpha with Python Pillow
  const py = `
from PIL import Image
img = Image.open("${OUT}")
print("Mode:", img.mode)
assert img.mode == "RGBA", f"FAIL: expected RGBA, got {img.mode}"
w, h = img.size
print(f"Size: {w}x{h}")
px = img.load()
corners = [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]
for xy in corners:
    r,g,b,a = px[xy]
    print(f"  corner {xy}: alpha={a}")
    assert a == 0, f"FAIL: corner {xy} alpha={a}, expected 0"
print("PASS: all corners alpha=0 (transparent)")
`.trim();

  try {
    const out = execSync(`python3 -c "${py.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });
    console.log(out);
  } catch (e) {
    console.error('❌  Pillow check failed:\n', e.stdout, e.stderr);
    process.exit(1);
  }
})();
