import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 2400 } });

await page.goto('https://flashflowai.com/transcribe', { waitUntil: 'networkidle' });
await page.locator('input[type="url"]').fill('https://www.tiktok.com/@holisticlifestyle32/video/7594848521929493791');
await page.locator('button', { hasText: 'Transcribe' }).click();
console.log('Clicked Transcribe...');

// Wait for loading spinner to disappear
await page.locator('text=Transcribing video').waitFor({ state: 'hidden', timeout: 90000 });
console.log('Loading finished');
await page.waitForTimeout(1000);

await page.screenshot({ path: '/tmp/transcribe-final.png', fullPage: true });
console.log('Screenshot saved');
await browser.close();
