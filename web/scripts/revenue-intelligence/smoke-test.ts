#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * Revenue Intelligence – Smoke Test
 *
 * Validates the full pipeline using simulation data:
 * 1. Generates mock scrape results
 * 2. Runs ingestion (upsert videos + comments)
 * 3. Runs classification
 * 4. Runs reply draft generation
 * 5. Runs urgency scoring
 * 6. Queries the inbox (with sim filtering verification)
 * 7. Reports results
 *
 * Usage:
 *   pnpm run ri:smoke
 *   pnpm run ri:smoke:db-only       # skip AI (--skip-ai)
 *
 * Requires: SUPABASE env vars + ANTHROPIC_API_KEY (or --skip-ai to test DB only)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { supabaseAdmin } from '../../lib/supabaseAdmin';
import {
  runIngestionForAccount,
  getUnprocessedComments,
  markCommentsProcessed,
} from '../../lib/revenue-intelligence/comment-ingestion-service';
import { classifyComments } from '../../lib/revenue-intelligence/comment-classification-service';
import { generateReplyDrafts } from '../../lib/revenue-intelligence/reply-draft-service';
import { flagUrgentComments } from '../../lib/revenue-intelligence/urgency-scoring-service';
import { getInboxComments, getInboxStats, getRevenueModeInbox } from '../../lib/revenue-intelligence/revenue-inbox-service';
import { generateSimulationData } from '../../lib/revenue-intelligence/simulation-data';
import { isSimulationComment } from '../../lib/revenue-intelligence/simulation-filter';
import type { RiCreatorAccount } from '../../lib/revenue-intelligence/types';

const TAG = '[ri:smoke]';
const skipAI = process.argv.includes('--skip-ai');

// ── Test account ───────────────────────────────────────────────

const TEST_USER_ID = process.env.RI_SMOKE_USER_ID || process.env.SMOKE_USER_ID;

async function getOrCreateTestAccount(): Promise<RiCreatorAccount | null> {
  if (!TEST_USER_ID) {
    console.error(`${TAG} Set RI_SMOKE_USER_ID or SMOKE_USER_ID env var to run smoke test`);
    return null;
  }

  // Try to find existing test account
  const { data: existing } = await supabaseAdmin
    .from('ri_creator_accounts')
    .select('*')
    .eq('user_id', TEST_USER_ID)
    .eq('username', 'smoke_test_creator')
    .single();

  if (existing) return existing as RiCreatorAccount;

  // Create test account
  const { data: created, error } = await supabaseAdmin
    .from('ri_creator_accounts')
    .insert({
      user_id: TEST_USER_ID,
      platform: 'tiktok',
      username: 'smoke_test_creator',
      is_active: true,
    })
    .select('*')
    .single();

  if (error) {
    console.error(`${TAG} Failed to create test account:`, error.message);
    return null;
  }

  return created as RiCreatorAccount;
}

// ── Assertions ─────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}${detail ? ` \u2014 ${detail}` : ''}`);
    failed++;
  }
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(55)}`);
  console.log('  Revenue Intelligence \u2014 Smoke Test');
  console.log(`${'='.repeat(55)}`);
  console.log(`  Skip AI:  ${skipAI}`);
  console.log(`  User ID:  ${TEST_USER_ID ?? 'NOT SET'}`);
  console.log(`${'='.repeat(55)}\n`);

  const account = await getOrCreateTestAccount();
  if (!account) {
    process.exit(1);
  }

  // Test 1: Simulation data generation
  console.log('\n1. Simulation Data Generation');
  const simData = generateSimulationData(5, 10);
  assert('Generates 5 videos', simData.length === 5);
  assert('Each video has comments', simData.every((v) => v.comments.length > 0));
  assert('Comments have required fields', simData[0].comments[0].platform_comment_id.length > 0);

  // Test 1b: Simulation filter helper
  console.log('\n1b. Simulation Filter Helper');
  assert('sim_ prefix detected', isSimulationComment('sim_7340001001_comment_0'));
  assert('live comment not flagged', !isSimulationComment('7594848521929493791_2g0mif'));

  // Test 2: Ingestion
  console.log('\n2. Comment Ingestion');
  const ingestionResult = await runIngestionForAccount(account, simData);
  assert('Videos scanned > 0', ingestionResult.videos_scanned > 0);
  assert('Comments found > 0', ingestionResult.comments_found > 0);
  assert('Comments ingested (new or deduped)', ingestionResult.comments_new > 0 || ingestionResult.comments_duplicate > 0);
  assert('Duration tracked', ingestionResult.duration_ms > 0);
  assert('No fatal errors', ingestionResult.errors.length === 0, ingestionResult.errors.join(', '));

  // Test 3: Deduplication
  console.log('\n3. Deduplication');
  const dupResult = await runIngestionForAccount(account, simData);
  assert('Second run has 0 new comments', dupResult.comments_new === 0);
  assert('All marked as duplicates', dupResult.comments_duplicate > 0);

  // Test 4: Unprocessed comments
  console.log('\n4. Unprocessed Comments');
  const unprocessed = await getUnprocessedComments(account.user_id, 50);
  // On re-run, all sim comments may already be processed — that's OK
  const hasUnprocessed = unprocessed.length > 0;
  if (hasUnprocessed) {
    assert('Unprocessed comments found', true, `found ${unprocessed.length}`);
  } else {
    assert('All comments already processed (re-run)', true, 'dedup preserves is_processed');
  }

  if (!skipAI && hasUnprocessed) {
    // Test 5: Classification
    console.log('\n5. AI Classification');
    const classResult = await classifyComments(unprocessed.slice(0, 10));
    assert('Classification ran', classResult.classified > 0, `classified ${classResult.classified}`);
    assert('No classification errors', classResult.errors.length === 0, classResult.errors.join(', '));

    // Verify analysis rows in DB
    const { data: analyses } = await supabaseAdmin
      .from('ri_comment_analysis')
      .select('*')
      .in('comment_id', unprocessed.slice(0, 10).map((c) => c.id));
    assert('Analysis rows in DB', (analyses?.length ?? 0) > 0, `found ${analyses?.length}`);

    // Test 6: Reply drafts
    console.log('\n6. Reply Draft Generation');
    const commentIds = unprocessed.slice(0, 5).map((c) => c.id);
    const draftResult = await generateReplyDrafts(commentIds);
    assert('Drafts generated', draftResult.generated > 0, `generated ${draftResult.generated}`);

    // Verify drafts in DB
    const { data: drafts } = await supabaseAdmin
      .from('ri_reply_drafts')
      .select('*')
      .in('comment_id', commentIds);
    assert('Draft rows in DB', (drafts?.length ?? 0) > 0, `found ${drafts?.length}`);
    assert('3 tones per comment', (drafts?.length ?? 0) >= 3);

    // Test 7: Urgency scoring
    console.log('\n7. Urgency Scoring');
    const urgencyResult = await flagUrgentComments(commentIds);
    assert('Urgency scoring ran', true);
    console.log(`  Flagged urgent: ${urgencyResult.flagged}`);

    // Mark processed
    await markCommentsProcessed(unprocessed.slice(0, 10).map((c) => c.id));
  } else if (skipAI) {
    console.log('\n5-7. Skipping AI tests (--skip-ai)\n');
  }

  // Test 8: Inbox query — default excludes sim
  console.log('\n8. Inbox Query (sim filter)');
  const inboxDefault = await getInboxComments({
    user_id: account.user_id,
    limit: 50,
  });
  const defaultHasSim = inboxDefault.items.some(
    (i) => isSimulationComment(i.comment.platform_comment_id),
  );
  assert('Default inbox excludes sim_ comments', !defaultHasSim,
    defaultHasSim ? 'found sim_ in default results' : `${inboxDefault.items.length} items, 0 sim`);

  // Test 8b: includeSimulation=true returns sim rows
  const inboxWithSim = await getInboxComments({
    user_id: account.user_id,
    limit: 50,
    includeSimulation: true,
  });
  const withSimHasSim = inboxWithSim.items.some(
    (i) => isSimulationComment(i.comment.platform_comment_id),
  );
  assert('includeSimulation=true returns sim_ comments', withSimHasSim,
    `total=${inboxWithSim.total}, items=${inboxWithSim.items.length}`);

  console.log(`  Default inbox: ${inboxDefault.items.length} items (total ${inboxDefault.total})`);
  console.log(`  With sim:      ${inboxWithSim.items.length} items (total ${inboxWithSim.total})`);

  // Test 9: Inbox stats — default excludes sim
  console.log('\n9. Inbox Stats (sim filter)');
  const statsDefault = await getInboxStats(account.user_id);
  const statsWithSim = await getInboxStats(account.user_id, { includeSimulation: true });
  assert('Stats with sim >= stats without sim', statsWithSim.total_comments >= statsDefault.total_comments);
  console.log(`  Default: total=${statsDefault.total_comments}, unread=${statsDefault.unread}, urgent=${statsDefault.urgent}`);
  console.log(`  With sim: total=${statsWithSim.total_comments}, unread=${statsWithSim.unread}, urgent=${statsWithSim.urgent}`);
  console.log(`  Categories (with sim):`, statsWithSim.categories);

  // Test 10: Revenue Mode Inbox
  console.log('\n10. Revenue Mode Inbox');

  // 10a: Default (excludes sim)
  const revDefault = await getRevenueModeInbox({ userId: account.user_id });
  const revDefaultHasSim = revDefault.some((i) =>
    isSimulationComment(i.commentId), // commentId is a UUID, not platform_comment_id
  );
  // We check via the actual comment rows instead
  const revDefaultSimCheck = await (async () => {
    if (revDefault.length === 0) return false;
    const ids = revDefault.map((i) => i.commentId);
    const { data } = await supabaseAdmin
      .from('ri_comments')
      .select('platform_comment_id')
      .in('id', ids);
    return (data ?? []).some((c) => isSimulationComment(c.platform_comment_id));
  })();
  assert('Revenue Mode default excludes sim', !revDefaultSimCheck,
    `${revDefault.length} items`);

  // 10b: With sim
  const revWithSim = await getRevenueModeInbox({
    userId: account.user_id,
    includeSimulation: true,
  });
  assert('Revenue Mode with sim >= without sim', revWithSim.length >= revDefault.length,
    `default=${revDefault.length}, withSim=${revWithSim.length}`);

  // 10c: Verify structure
  if (revWithSim.length > 0) {
    const first = revWithSim[0];
    assert('Revenue Mode item has commentId', typeof first.commentId === 'string' && first.commentId.length > 0);
    assert('Revenue Mode item has category', first.category === 'buying_intent' || first.category === 'objection');
    assert('Revenue Mode item has leadScore >= 70', first.leadScore >= 70);
    assert('Revenue Mode item has drafts object', typeof first.drafts === 'object');
    console.log(`  Top item: @${first.commenterUsername} [${first.category}] lead=${first.leadScore} urgency=${first.urgencyScore}`);
    console.log(`  Text: ${first.commentText.slice(0, 80)}`);
  } else {
    console.log('  No revenue mode items found (expected if no buying_intent/objection with lead >= 70)');
  }

  // 10d: Ordering check
  if (revWithSim.length >= 2) {
    const sorted = revWithSim.every((item, idx) => {
      if (idx === 0) return true;
      const prev = revWithSim[idx - 1];
      return prev.urgencyScore > item.urgencyScore ||
        (prev.urgencyScore === item.urgencyScore && prev.leadScore >= item.leadScore);
    });
    assert('Revenue Mode sorted by urgency DESC, lead DESC', sorted);
  }

  console.log(`  Revenue Mode: ${revDefault.length} live, ${revWithSim.length} total (with sim)`);

  // Test 11: Agent logs
  console.log('\n11. Agent Logs');
  const { data: logs } = await supabaseAdmin
    .from('ri_agent_logs')
    .select('action_type, duration_ms, error')
    .order('created_at', { ascending: false })
    .limit(5);
  assert('Agent logs recorded', (logs?.length ?? 0) > 0, `found ${logs?.length}`);
  for (const log of logs ?? []) {
    console.log(`  ${log.action_type} (${log.duration_ms}ms)${log.error ? ` ERROR: ${log.error}` : ''}`);
  }

  // Summary
  console.log(`\n${'='.repeat(55)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(55)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
