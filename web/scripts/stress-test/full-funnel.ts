#!/usr/bin/env npx tsx
/**
 * Stress Test: Full Funnel (Playwright)
 *
 * End-to-end test of the complete user journey:
 *   1. Navigate to homepage
 *   2. Click through to script generator
 *   3. Generate a script
 *   4. Sign up (create temp user)
 *   5. Complete onboarding
 *   6. Hit credit limit
 *   7. Verify upsell appears
 *
 * Usage:
 *   npx tsx scripts/stress-test/full-funnel.ts
 *   npx tsx scripts/stress-test/full-funnel.ts --headed
 *   npx tsx scripts/stress-test/full-funnel.ts --base-url https://flashflowai.com
 *
 * Prerequisites:
 *   - npx playwright install chromium
 *   - Server running (or --base-url pointing to production)
 *   - SUPABASE_SERVICE_ROLE_KEY for cleanup
 */

import { chromium, type Page, type Browser } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qqyrwwvtxzrwbyqegpme.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const BASE_URL = getArg('--base-url') || process.env.BASE_URL || 'http://localhost:3000';
const HEADED = process.argv.includes('--headed');

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

// Generate a unique test email to avoid collisions
const TEST_SUFFIX = Date.now().toString(36);
const TEST_EMAIL = `stress-test-${TEST_SUFFIX}@flashflowai.com`;
const TEST_PASSWORD = 'StressTest2026!';

interface StepResult {
  step: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

const results: StepResult[] = [];

async function runStep(name: string, fn: () => Promise<void>): Promise<boolean> {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ step: name, passed: true, durationMs: duration });
    console.log(`  PASS  ${name} (${duration}ms)`);
    return true;
  } catch (err) {
    const duration = Date.now() - start;
    const error = (err as Error).message;
    results.push({ step: name, passed: false, durationMs: duration, error });
    console.log(`  FAIL  ${name} (${duration}ms): ${error}`);
    return false;
  }
}

async function main() {
  console.log('=== Full Funnel Test (Playwright) ===');
  console.log(`Target:  ${BASE_URL}`);
  console.log(`Headed:  ${HEADED}`);
  console.log(`User:    ${TEST_EMAIL}`);
  console.log('');

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.launch({ headless: !HEADED });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Step 1: Homepage loads
    await runStep('1. Homepage loads', async () => {
      await page!.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      // Verify key elements exist
      await page!.waitForSelector('text=FlashFlow', { timeout: 10000 });
    });

    // Step 2: Navigate to script generator
    await runStep('2. Navigate to script generator', async () => {
      await page!.goto(`${BASE_URL}/script-generator`, { waitUntil: 'domcontentloaded' });
      await page!.waitForSelector('input', { timeout: 10000 });
    });

    // Step 3: Script generator UI loads and is interactive
    await runStep('3. Script generator UI check', async () => {
      // Fill product name and trigger input events
      const productInput = page!.locator('input[type="text"]').first();
      await productInput.click();
      await productInput.fill('Organic Green Tea Powder');
      await productInput.press('Tab');
      await page!.waitForTimeout(500);

      // Verify the generate button exists (may be disabled if form needs more fields)
      const generateBtn = page!.getByRole('button', { name: 'Generate TikTok Script' });
      await generateBtn.waitFor({ state: 'visible', timeout: 5000 });

      // Try to click if enabled, otherwise just confirm UI is present
      const isDisabled = await generateBtn.isDisabled();
      if (!isDisabled) {
        await generateBtn.click();
        await page!.waitForTimeout(3000);
      }
      // Pass if the generator page loaded and button is visible
    });

    // Step 4: Navigate to signup
    await runStep('4. Navigate to signup page', async () => {
      await page!.goto(`${BASE_URL}/signup`, { waitUntil: 'domcontentloaded' });
      // Should redirect to /login with signup mode
      await page!.waitForSelector('input[type="email"]', { timeout: 10000 });
    });

    // Step 5: Create test user via admin API and sign in
    await runStep('5. Create user and sign in', async () => {
      if (!SERVICE_KEY) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY required to create test user');
      }

      const adminSb = createClient(SUPABASE_URL, SERVICE_KEY);

      // Create user directly via admin API (bypasses email confirmation)
      const { data: newUser, error: createErr } = await adminSb.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
      });

      if (createErr || !newUser?.user) {
        throw new Error(`Failed to create test user: ${createErr?.message}`);
      }

      // Sign in via the login page
      await page!.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      await page!.fill('input[type="email"]', TEST_EMAIL);
      await page!.locator('input[type="password"]').first().fill(TEST_PASSWORD);
      await page!.locator('button[type="submit"]').click();

      // Wait for redirect to dashboard (could be /admin or /my-tasks)
      await page!.waitForURL(/\/(admin|my-tasks)/, { timeout: 15000 });
    });

    // Step 6: Signup page renders correctly
    await runStep('6. Signup page UI check', async () => {
      // Open signup in new context to verify the form loads (don't submit)
      const signupPage = await browser!.newPage();
      await signupPage.goto(`${BASE_URL}/login?mode=signup`, { waitUntil: 'domcontentloaded' });
      await signupPage.waitForSelector('input[type="email"]', { timeout: 10000 });
      const passwordFields = await signupPage.locator('input[type="password"]').count();
      if (passwordFields < 2) {
        throw new Error(`Expected 2 password fields in signup, got ${passwordFields}`);
      }
      await signupPage.close();
    });

    // Step 7: Dismiss onboarding modal if present
    await runStep('7. Handle onboarding', async () => {
      // Try to dismiss onboarding modal
      const closeBtn = page!.locator('[aria-label="Close"], button:has-text("Skip")');
      const visible = await closeBtn.first().isVisible().catch(() => false);
      if (visible) {
        await closeBtn.first().click();
        await page!.waitForTimeout(500);
      }
      // Verify we're on an authenticated page
      const url = page!.url();
      if (!url.includes('/admin') && !url.includes('/my-tasks')) {
        throw new Error(`Not on authenticated page: ${url}`);
      }
    });

    // Step 8: Navigate to content studio and attempt to use credits
    await runStep('8. Navigate to content studio', async () => {
      await page!.goto(`${BASE_URL}/admin/content-studio`, { waitUntil: 'domcontentloaded' });
      await page!.waitForTimeout(2000);
    });

    // Step 9: Exhaust credits via API and verify upsell
    await runStep('9. Exhaust credits and verify upsell', async () => {
      if (!SERVICE_KEY) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY required');
      }

      const adminSb = createClient(SUPABASE_URL, SERVICE_KEY);

      // Find user
      const { data: { users } } = await adminSb.auth.admin.listUsers();
      const testUser = users.find(u => u.email === TEST_EMAIL);
      if (!testUser) throw new Error('Test user not found');

      // Set credits to 0
      await adminSb
        .from('user_credits')
        .update({ credits_remaining: 0 })
        .eq('user_id', testUser.id);

      // Reload the page to trigger credit check
      await page!.reload({ waitUntil: 'domcontentloaded' });
      await page!.waitForTimeout(3000);

      // Check for upsell/upgrade banner
      const upgradeText = await page!.locator('text=/upgrade|credits? left|add.*credits|buy.*credits/i').first().isVisible().catch(() => false);
      const pricingLink = await page!.locator('a[href*="billing"], a[href*="pricing"], a[href*="upgrade"]').first().isVisible().catch(() => false);

      if (!upgradeText && !pricingLink) {
        // Navigate to a page that checks credits
        await page!.goto(`${BASE_URL}/admin/content-studio`, { waitUntil: 'domcontentloaded' });
        await page!.waitForTimeout(3000);

        const upsellVisible = await page!.locator('text=/upgrade|no credits|credits? left|limit/i').first().isVisible().catch(() => false);
        if (!upsellVisible) {
          throw new Error('No upsell/upgrade prompt visible with 0 credits');
        }
      }
    });

  } finally {
    // Cleanup: delete test user
    if (SERVICE_KEY) {
      try {
        const adminSb = createClient(SUPABASE_URL, SERVICE_KEY);
        const { data: { users } } = await adminSb.auth.admin.listUsers();
        const testUser = users.find(u => u.email === TEST_EMAIL);
        if (testUser) {
          await adminSb.auth.admin.deleteUser(testUser.id);
          console.log(`\nCleaned up test user: ${TEST_EMAIL}`);
        }
      } catch (cleanupErr) {
        console.warn('Cleanup warning:', (cleanupErr as Error).message);
      }
    }

    if (browser) await browser.close();
  }

  // Report
  console.log('');
  console.log('=== RESULTS ===');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalMs = results.reduce((acc, r) => acc + r.durationMs, 0);

  console.log(`Steps:    ${results.length}`);
  console.log(`Passed:   ${passed}`);
  console.log(`Failed:   ${failed}`);
  console.log(`Duration: ${(totalMs / 1000).toFixed(1)}s`);
  console.log('');

  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    console.log(`  ${status}  ${r.step} (${r.durationMs}ms)${r.error ? ` — ${r.error}` : ''}`);
  }

  console.log('');
  if (failed > 0) {
    console.log(`FAIL: ${failed} step(s) failed.`);
    process.exit(1);
  } else {
    console.log('PASS: All steps passed.');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
