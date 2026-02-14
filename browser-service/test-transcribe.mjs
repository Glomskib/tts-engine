import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

console.log('Opening flashflowai.com/transcribe...');
await page.goto('https://flashflowai.com/transcribe', { waitUntil: 'networkidle' });

// Type the TikTok URL
const input = page.locator('input[type="url"]');
await input.fill('https://www.tiktok.com/@holisticlifestyle32/video/7594848521929493791');
console.log('Pasted URL into input');

// Click Transcribe button
const btn = page.locator('button', { hasText: 'Transcribe' });
await btn.click();
console.log('Clicked Transcribe — waiting for results...');

// Wait for results to appear (up to 60s)
const transcript = page.locator('text=Full Transcript');
await transcript.waitFor({ state: 'visible', timeout: 60000 });
console.log('Results loaded!');

// Take screenshot
await page.screenshot({ path: '/tmp/transcribe-result.png', fullPage: true });
console.log('Screenshot saved to /tmp/transcribe-result.png');

// Check for key elements
const hookAnalysis = await page.locator('text=Hook Analysis').isVisible();
const contentBreakdown = await page.locator('text=Content Breakdown').isVisible();
const whatWorks = await page.locator('text=What Works').isVisible();
const winnersBtn = await page.locator('text=Add to Winners Bank').isVisible();
const signInNudge = await page.locator('text=save this to your Winners Bank').isVisible();

console.log('\n--- UI Check ---');
console.log('Full Transcript:    ✓');
console.log('Hook Analysis:     ', hookAnalysis ? '✓' : '✗');
console.log('Content Breakdown: ', contentBreakdown ? '✓' : '✗');
console.log('What Works:        ', whatWorks ? '✓' : '✗');
console.log('Winners Bank btn:  ', winnersBtn ? '✓ (logged in)' : '✗ (not logged in)');
console.log('Sign-in nudge:     ', signInNudge ? '✓' : '✗');

await browser.close();
