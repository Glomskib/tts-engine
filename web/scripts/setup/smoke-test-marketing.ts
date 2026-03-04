/**
 * Smoke test for the FlashFlow Marketing Engine.
 * Tests: LateService dry-run, claim risk, brand-accounts, queue module, type exports.
 *
 * Usage: LATE_DRY_RUN=true npx tsx scripts/setup/smoke-test-marketing.ts
 */

import { createPost, isConfigured, classifyClaimRisk, pushToLate } from '../../lib/marketing';
import { resolveTargets, getBrandAccounts } from '../../lib/marketing/brand-accounts';
import { generateRunId } from '../../lib/marketing/queue';
import { LATE_ACCOUNTS, FACEBOOK_PAGES } from '../../lib/marketing/types';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    failed++;
  }
}

async function main() {
  console.log('=== FlashFlow Marketing Engine — Smoke Test ===\n');

  // ── 1. Type exports ──────────────────────────────────────
  console.log('1) Type exports');
  assert('LATE_ACCOUNTS has 7 platforms', Object.keys(LATE_ACCOUNTS).length === 7);
  assert('FACEBOOK_PAGES has 2 pages', Object.keys(FACEBOOK_PAGES).length === 2);
  assert('isConfigured() is a function', typeof isConfigured === 'function');
  assert('createPost is a function', typeof createPost === 'function');
  assert('pushToLate is a function', typeof pushToLate === 'function');
  assert('classifyClaimRisk is a function', typeof classifyClaimRisk === 'function');
  console.log('');

  // ── 2. Claim risk classifier ─────────────────────────────
  console.log('2) Claim risk classifier');

  const safe = classifyClaimRisk('Check out our new cycling jersey! Great fit for long rides.');
  assert('Safe content: score < 30', safe.score < 30);
  assert('Safe content: safe=true', safe.safe === true);
  assert('Safe content: no flags', safe.flags.length === 0);

  const risky = classifyClaimRisk('This supplement cures cancer and is clinically proven to reverse diabetes. Guaranteed results!');
  assert('Risky content: score >= 70', risky.score >= 70);
  assert('Risky content: blocked=true', risky.blocked === true);
  assert('Risky content: has flags', risky.flags.length > 0);

  const medium = classifyClaimRisk('Studies show 80% of users saw improvement. Doctor recommended formula.');
  assert('Medium content: needs_review=true', medium.needs_review === true);
  assert('Medium content: 30 <= score < 70', medium.score >= 30 && medium.score < 70);

  // New fields: level and requires_human_approval
  assert('Safe content: level=LOW', safe.level === 'LOW');
  assert('Safe content: requires_human_approval=false', safe.requires_human_approval === false);
  assert('Medium content: level=MED', medium.level === 'MED');
  assert('Medium content: requires_human_approval=true', medium.requires_human_approval === true);
  assert('Risky content: level=HIGH', risky.level === 'HIGH');
  assert('Risky content: requires_human_approval=true', risky.requires_human_approval === true);

  // Supplement-specific: disallowed phrases → HIGH
  console.log('');
  console.log('2b) Supplement blocklist');
  const miracleCure = classifyClaimRisk('Try this miracle supplement — it cures cancer naturally!');
  assert('Miracle cure: blocked=true', miracleCure.blocked === true);
  assert('Miracle cure: level=HIGH', miracleCure.level === 'HIGH');
  assert('Miracle cure: has blocklist flag', miracleCure.flags.some(f => f.startsWith('blocklist_')));

  const stopMeds = classifyClaimRisk('Stop taking your medications and try this instead!');
  assert('Stop meds: blocked=true', stopMeds.blocked === true);
  assert('Stop meds: has blocklist_stop_meds', stopMeds.flags.includes('blocklist_stop_meds'));

  const fdaSupplement = classifyClaimRisk('Our FDA-approved supplement is the best on the market.');
  assert('FDA supplement: blocked=true', fdaSupplement.blocked === true);
  assert('FDA supplement: has blocklist_fda_supplement', fdaSupplement.flags.includes('blocklist_fda_supplement'));

  // Supplement-specific: disclaimer required → MED
  console.log('');
  console.log('2c) Disclaimer-required phrases');
  const supplementBenefit = classifyClaimRisk('This vitamin D supplement supports bone health and immune function.');
  assert('Supplement benefit: needs_review=true', supplementBenefit.needs_review === true || supplementBenefit.blocked === true);
  assert('Supplement benefit: requires_human_approval=true', supplementBenefit.requires_human_approval === true);
  assert('Supplement benefit: has disclaimer flag', supplementBenefit.flags.some(f => f.startsWith('disclaimer_')));

  const cbdContent = classifyClaimRisk('Our CBD oil is sourced from organic hemp farms.');
  assert('CBD mention: requires_human_approval=true', cbdContent.requires_human_approval === true);
  assert('CBD mention: has disclaimer_controlled_substance', cbdContent.flags.includes('disclaimer_controlled_substance'));

  // Benign wellness content → LOW
  console.log('');
  console.log('2d) Benign wellness (should be LOW)');
  const benign1 = classifyClaimRisk('Join our cycling group this Saturday! Great weather expected.');
  assert('Cycling group: level=LOW', benign1.level === 'LOW');
  assert('Cycling group: score=0', benign1.score === 0);

  const benign2 = classifyClaimRisk('Staying active and eating well are keys to feeling great every day.');
  assert('General wellness: level=LOW', benign2.level === 'LOW');
  assert('General wellness: no flags', benign2.flags.length === 0);
  console.log('');

  // ── 3. Brand accounts resolution ─────────────────────────
  console.log('3) Brand accounts resolution');
  const accounts = await getBrandAccounts();
  assert('getBrandAccounts returns array', Array.isArray(accounts));
  assert('Has MMM accounts', accounts.some(a => a.brand === 'Making Miles Matter'));
  assert('Has Zebby accounts', accounts.some(a => a.brand === "Zebby's World"));

  const mmmTargets = await resolveTargets('Making Miles Matter');
  assert('MMM resolves to >= 3 targets', mmmTargets.length >= 3);
  assert('MMM has facebook target', mmmTargets.some(t => t.platform === 'facebook'));
  assert('MMM facebook has pageId', mmmTargets.some(t => t.platform === 'facebook' && t.platformSpecificData?.pageId === '553582747844417'));

  const zebbyTargets = await resolveTargets("Zebby's World");
  assert('Zebby resolves to >= 2 targets', zebbyTargets.length >= 2);
  assert('Zebby facebook has Zebby pageId', zebbyTargets.some(t => t.platform === 'facebook' && t.platformSpecificData?.pageId === '673094745879999'));

  const filteredTargets = await resolveTargets('Making Miles Matter', ['twitter']);
  assert('Platform filter: only 1 target', filteredTargets.length === 1);
  assert('Platform filter: is twitter', filteredTargets[0]?.platform === 'twitter');
  console.log('');

  // ── 4. Queue module (unit tests, no DB) ──────────────────
  console.log('4) Queue module');
  const runId = generateRunId('smoke-test');
  assert('generateRunId: returns string', typeof runId === 'string');
  assert('generateRunId: starts with source', runId.startsWith('smoke-test-'));
  assert('generateRunId: has timestamp component', runId.length > 20);
  console.log('');

  // ── 5. LateService dry-run ───────────────────────────────
  console.log('5) LateService dry-run');
  const isDry = process.env.LATE_DRY_RUN === 'true';
  assert('LATE_DRY_RUN is set', isDry);

  if (isDry) {
    const result = await createPost({
      content: 'Smoke test post — FlashFlow Marketing Engine',
      platforms: [
        { platform: 'facebook', accountId: LATE_ACCOUNTS.facebook },
      ],
      publishNow: false,
    });
    assert('Dry-run createPost: ok=true', result.ok === true);
    assert('Dry-run createPost: has postId', !!result.postId);
    assert('Dry-run createPost: postId starts with dry-run-', result.postId?.startsWith('dry-run-') ?? false);
  } else {
    console.log('  ⚠ Skipping dry-run test (set LATE_DRY_RUN=true)');
  }
  console.log('');

  // ── 6. pushToLate dry-run ────────────────────────────────
  console.log('6) pushToLate (Buffer replacement) dry-run');
  if (isDry) {
    const result = await pushToLate([
      { platform: 'facebook', content: 'Test FB post' },
      { platform: 'twitter', content: 'Test Twitter post' },
    ]);
    assert('pushToLate: ok=true', result.ok === true);
    assert('pushToLate: pushed=2', result.pushed === 2);
    assert('pushToLate: no errors', result.errors.length === 0);
  } else {
    console.log('  ⚠ Skipping (set LATE_DRY_RUN=true)');
  }
  console.log('');

  // ── Summary ──────────────────────────────────────────────
  console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
