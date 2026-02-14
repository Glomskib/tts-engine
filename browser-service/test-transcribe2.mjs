import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto('https://flashflowai.com/transcribe', { waitUntil: 'networkidle' });
const input = page.locator('input[type="url"]');
await input.fill('https://www.tiktok.com/@holisticlifestyle32/video/7594848521929493791');
await page.locator('button', { hasText: 'Transcribe' }).click();

// Wait for Full Transcript heading
await page.locator('text=Full Transcript').waitFor({ state: 'visible', timeout: 60000 });
// Extra wait for all cards to render
await page.waitForTimeout(2000);

// Screenshot the results area
await page.screenshot({ path: '/tmp/transcribe-results-top.png', fullPage: false });

// Scroll down to see more
await page.evaluate(() => window.scrollBy(0, 800));
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/transcribe-results-bottom.png', fullPage: false });

await browser.close();
console.log('Done - screenshots saved');
