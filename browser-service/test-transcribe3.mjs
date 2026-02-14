import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 2400 } });

await page.goto('https://flashflowai.com/transcribe', { waitUntil: 'networkidle' });
await page.locator('input[type="url"]').fill('https://www.tiktok.com/@holisticlifestyle32/video/7594848521929493791');
await page.locator('button', { hasText: 'Transcribe' }).click();
console.log('Clicked Transcribe...');

// Wait for the loading spinner to disappear (means results or error rendered)
await page.locator('text=Transcribing video').waitFor({ state: 'hidden', timeout: 90000 });
console.log('Loading finished');
await page.waitForTimeout(1000);

// Check what we got
const hasTranscript = await page.locator('text=Full Transcript').isVisible();
const hasError = await page.locator('[class*="red"]').isVisible();
console.log('Has transcript:', hasTranscript, '| Has error:', hasError);

if (hasError) {
  const errorText = await page.locator('[class*="red"]').first().textContent();
  console.log('Error:', errorText);
}

await page.screenshot({ path: '/tmp/transcribe-final.png', fullPage: true });
console.log('Screenshot saved');
await browser.close();
