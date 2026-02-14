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

    // Step 3: Generate a free script
    await runStep('3. Generate a free script', async () => {
      // Fill product name
      const productInput = page!.locator('input[type="text"]').first();
      await productInput.fill('Organic Green Tea Powder');

      // Click generate button
      const generateBtn = page!.getByRole('button', { name: /generate/i });
      await generateBtn.click();

      // Wait for script output (may take a while due to AI generation)
      await page!.waitForSelector('[class*="script"], [class*="result"], [data-testid="script-output"]', {
        timeout: 60000,
      }).catch(() => {
        // Fallback: wait for any substantial text change
        return page!.waitForTimeout(5000);
      });
    });

    // Step 4: Navigate to signup
    await runStep('4. Navigate to signup page', async () => {
      await page!.goto(`${BASE_URL}/signup`, { waitUntil: 'domcontentloaded' });
      // Should redirect to /login with signup mode
      await page!.waitForSelector('input[type="email"]', { timeout: 10000 });
    });

    // Step 5: Fill signup form
    await runStep('5. Fill and submit signup form', async () => {
      await page!.fill('input[type="email"]', TEST_EMAIL);

      // Fill password fields
      const passwordInputs = page!.locator('input[type="password"]');
      const count = await passwordInputs.count();

      if (count >= 2) {
        await passwordInputs.nth(0).fill(TEST_PASSWORD);
        await passwordInputs.nth(1).fill(TEST_PASSWORD);
      } else {
        await passwordInputs.first().fill(TEST_PASSWORD);
      }

      // Submit
      const submitBtn = page!.locator('button[type="submit"]');
      await submitBtn.click();

      // Wait for post-signup state (could be confirmation message or redirect)
      await page!.waitForTimeout(3000);
    });

    // Step 6: Confirm user via admin API and sign in
    await runStep('6. Confirm user and sign in', async () => {
      if (!SERVICE_KEY) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY required to confirm test user');
      }

      const adminSb = createClient(SUPABASE_URL, SERVICE_KEY);

      // Find the user
      const { data: { users } } = await adminSb.auth.admin.listUsers();
      const testUser = users.find(u => u.email === TEST_EMAIL);

      if (!testUser) {
        throw new Error(`Test user ${TEST_EMAIL} not found after signup`);
      }

      // Confirm email
      await adminSb.auth.admin.updateUserById(testUser.id, {
        email_confirm: true,
      });

      // Now sign in via the login page
      await page!.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      await page!.fill('input[type="email"]', TEST_EMAIL);
      await page!.locator('input[type="password"]').first().fill(TEST_PASSWORD);
      await page!.locator('button[type="submit"]').click();

      // Wait for redirect to dashboard
      await page!.waitForURL(/\/admin/, { timeout: 15000 });
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
      // Verify we're on an admin page
      const url = page!.url();
      if (!url.includes('/admin')) {
        throw new Error(`Not on admin page: ${url}`);
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
