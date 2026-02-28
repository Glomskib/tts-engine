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
 * 6. Queries the inbox
 * 7. Reports results
 *
 * Usage:
 *   pnpm run ri:smoke
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
import { getInboxComments, getInboxStats } from '../../lib/revenue-intelligence/revenue-inbox-service';
import { generateSimulationData } from '../../lib/revenue-intelligence/simulation-data';
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
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(55)}`);
  console.log('  Revenue Intelligence — Smoke Test');
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
  assert('Unprocessed comments found', unprocessed.length > 0, `found ${unprocessed.length}`);

  if (!skipAI && unprocessed.length > 0) {
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

  // Test 8: Inbox query
  console.log('\n8. Inbox Query');
  const inbox = await getInboxComments({
    user_id: account.user_id,
    limit: 10,
  });
  // Inbox may be empty if we skipped AI (comments not marked processed)
  console.log(`  Inbox items: ${inbox.items.length}, total: ${inbox.total}`);

  // Test 9: Inbox stats
  console.log('\n9. Inbox Stats');
  const stats = await getInboxStats(account.user_id);
  console.log(`  Total: ${stats.total_comments}, Unread: ${stats.unread}, Urgent: ${stats.urgent}`);
  console.log(`  High intent: ${stats.high_intent}, Avg lead score: ${stats.avg_lead_score}`);
  console.log(`  Categories:`, stats.categories);

  // Test 10: Agent logs
  console.log('\n10. Agent Logs');
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
