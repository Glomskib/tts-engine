#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * Revenue Intelligence – Comment Ingestion Cron
 *
 * Orchestrates the full ingestion + classification + reply draft pipeline:
 * 1. Fetch all active creator accounts
 * 2. For each account, scrape TikTok comments (or use simulation data)
 * 3. Ingest into database (deduplication via platform_comment_id)
 * 4. Classify new comments with AI
 * 5. Generate reply drafts
 * 6. Score urgency and flag/alert
 *
 * Usage:
 *   pnpm run ri:ingest                    # Full run
 *   pnpm run ri:ingest -- --simulate      # Simulation mode (mock data)
 *   pnpm run ri:ingest -- --dry-run       # Dry run (no DB writes)
 *   pnpm run ri:ingest -- --user <uuid>   # Single user only
 *
 * Interval: every 15 minutes via external scheduler (cron/launchd)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import {
  getActiveCreatorAccounts,
  runIngestionForAccount,
  getUnprocessedComments,
  markCommentsProcessed,
  logAndTime,
} from '../../lib/revenue-intelligence/comment-ingestion-service';
import { classifyComments } from '../../lib/revenue-intelligence/comment-classification-service';
import { generateReplyDrafts } from '../../lib/revenue-intelligence/reply-draft-service';
import { flagUrgentComments, sendUrgentAlerts } from '../../lib/revenue-intelligence/urgency-scoring-service';
import { scrapeAccount } from '../../lib/revenue-intelligence/tiktok-scraper';
import { generateSimulationData } from '../../lib/revenue-intelligence/simulation-data';
import { logAgentAction } from '../../lib/revenue-intelligence/agent-logger';
import { getRunState, countNewSince, updateRunState } from '../../lib/revenue-intelligence/run-state-service';
import { getRevenueModeInbox } from '../../lib/revenue-intelligence/revenue-inbox-service';
import { sendDigestAlert } from '../../lib/revenue-intelligence/telegram-digest';
import type { IngestionConfig, IngestionRunResult, RiCreatorAccount } from '../../lib/revenue-intelligence/types';
import { DEFAULT_INGESTION_CONFIG } from '../../lib/revenue-intelligence/types';

const TAG = '[ri:cron]';

// ── Parse CLI args ─────────────────────────────────────────────

function parseArgs(): {
  simulate: boolean;
  dryRun: boolean;
  userId: string | null;
  headless: boolean;
} {
  const args = process.argv.slice(2);
  return {
    simulate: args.includes('--simulate') || args.includes('--sim'),
    dryRun: args.includes('--dry-run'),
    userId: getArgValue(args, '--user'),
    headless: !args.includes('--headed'),
  };
}

function getArgValue(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

// ── Main ───────────────────────────────────────────────────────

async function runCommentIngestion(): Promise<void> {
  const { simulate, dryRun, userId, headless } = parseArgs();
  const startTime = Date.now();

  const ingestionConfig: IngestionConfig = {
    ...DEFAULT_INGESTION_CONFIG,
    headless,
    simulation_mode: simulate,
  };

  console.log(`\n${'='.repeat(55)}`);
  console.log('  Revenue Intelligence — Comment Ingestion');
  console.log(`${'='.repeat(55)}`);
  console.log(`  Mode:       ${simulate ? 'SIMULATION' : 'LIVE'}`);
  console.log(`  Dry run:    ${dryRun}`);
  console.log(`  Headless:   ${headless}`);
  console.log(`  Max videos: ${ingestionConfig.max_videos_per_account}`);
  console.log(`  Max cmts:   ${ingestionConfig.max_comments_per_video}`);
  if (userId) console.log(`  User:       ${userId}`);
  console.log(`${'='.repeat(55)}\n`);

  // Step 1: Get active accounts
  const accounts = await getActiveCreatorAccounts(userId ?? undefined);

  if (accounts.length === 0) {
    console.log(`${TAG} No active creator accounts found. Exiting.`);
    await logAgentAction({
      user_id: null,
      action_type: 'ingestion_cron',
      details: { accounts: 0, reason: 'no_active_accounts' },
      error: null,
      duration_ms: Date.now() - startTime,
    });
    return;
  }

  console.log(`${TAG} Found ${accounts.length} active account(s)\n`);

  const allResults: IngestionRunResult[] = [];
  let totalNewComments = 0;

  // Step 2: Process each account
  for (const account of accounts) {
    console.log(`${'─'.repeat(50)}`);
    console.log(`${TAG} Processing: @${account.username} (${account.id})`);
    console.log(`${'─'.repeat(50)}`);

    try {
      // Step 2a: Scrape (or simulate)
      let scrapeResults;
      if (simulate) {
        console.log(`${TAG} Using simulation data`);
        scrapeResults = generateSimulationData(
          ingestionConfig.max_videos_per_account,
          ingestionConfig.max_comments_per_video,
        );
      } else {
        console.log(`${TAG} Launching browser scraper...`);
        const scrape = await scrapeAccount(
          account.username,
          account.automation_profile_path,
          {
            maxVideos: ingestionConfig.max_videos_per_account,
            maxComments: ingestionConfig.max_comments_per_video,
            headless: ingestionConfig.headless,
          },
        );

        if (scrape.loginRequired) {
          console.error(`${TAG} Login expired for @${account.username}. Skipping.`);
          await logAgentAction({
            user_id: account.user_id,
            action_type: 'login_expired',
            details: { username: account.username, account_id: account.id },
            error: 'Login session expired — run bootstrap to re-authenticate',
            duration_ms: null,
          });
          continue;
        }

        if (scrape.errors.length > 0) {
          console.warn(`${TAG} Scrape warnings:`, scrape.errors);
        }

        scrapeResults = scrape.results;
      }

      if (scrapeResults.length === 0) {
        console.log(`${TAG} No videos scraped for @${account.username}`);
        continue;
      }

      // Step 2b: Ingest into DB
      if (dryRun) {
        const totalComments = scrapeResults.reduce((sum, r) => sum + r.comments.length, 0);
        console.log(`${TAG} [DRY RUN] Would ingest ${scrapeResults.length} videos, ${totalComments} comments`);
        for (const r of scrapeResults) {
          console.log(`  Video ${r.video.platform_video_id}: ${r.comments.length} comments`);
        }
        continue;
      }

      const result = await runIngestionForAccount(account, scrapeResults);
      allResults.push(result);
      totalNewComments += result.comments_new;

      console.log(`${TAG} Ingestion complete for @${account.username}:`);
      console.log(`  Videos scanned:    ${result.videos_scanned}`);
      console.log(`  Comments found:    ${result.comments_found}`);
      console.log(`  New comments:      ${result.comments_new}`);
      console.log(`  Duplicates:        ${result.comments_duplicate}`);
      console.log(`  Duration:          ${result.duration_ms}ms`);
      if (result.errors.length > 0) {
        console.warn(`  Errors:            ${result.errors.length}`);
      }
      console.log('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${TAG} Fatal error processing @${account.username}:`, msg);
      await logAgentAction({
        user_id: account.user_id,
        action_type: 'ingestion_fatal_error',
        details: { username: account.username },
        error: msg,
        duration_ms: null,
      });
    }
  }

  if (dryRun) {
    console.log(`\n${TAG} [DRY RUN] Complete. No DB writes.`);
    return;
  }

  // Step 3: Classify + generate drafts + flag urgency
  if (totalNewComments > 0) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`${TAG} Processing ${totalNewComments} new comment(s) through AI pipeline`);
    console.log(`${'─'.repeat(50)}\n`);

    for (const account of accounts) {
      try {
        const unprocessed = await getUnprocessedComments(account.user_id, 100);
        if (unprocessed.length === 0) continue;

        console.log(`${TAG} Classifying ${unprocessed.length} comments for @${account.username}...`);

        // Classify
        const classResult = await classifyComments(unprocessed);
        console.log(`${TAG} Classified: ${classResult.classified}`);
        if (classResult.errors.length > 0) {
          console.warn(`${TAG} Classification errors:`, classResult.errors);
        }

        const commentIds = unprocessed.map((c) => c.id);

        // Generate reply drafts
        console.log(`${TAG} Generating reply drafts...`);
        const draftResult = await generateReplyDrafts(commentIds);
        console.log(`${TAG} Drafts generated: ${draftResult.generated}`);

        // Flag urgent
        console.log(`${TAG} Scoring urgency...`);
        const urgencyResult = await flagUrgentComments(commentIds);
        console.log(`${TAG} Flagged urgent: ${urgencyResult.flagged}`);

        // Send Telegram alerts for urgent items
        if (urgencyResult.flagged > 0) {
          // Re-fetch the urgent comment IDs
          const { data: urgentStatuses } = await (await import('@/lib/supabaseAdmin')).supabaseAdmin
            .from('ri_comment_status')
            .select('comment_id')
            .in('comment_id', commentIds)
            .eq('flagged_urgent', true);

          const urgentIds = (urgentStatuses ?? []).map((s) => s.comment_id);
          if (urgentIds.length > 0) {
            await sendUrgentAlerts(urgentIds);
          }
        }

        // Mark as processed
        await markCommentsProcessed(commentIds);
        console.log(`${TAG} Marked ${commentIds.length} comments as processed\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${TAG} AI pipeline error for user ${account.user_id}:`, msg);
      }
    }
  }

  // Step 4: Summary
  const totalDuration = Date.now() - startTime;
  console.log(`\n${'='.repeat(55)}`);
  console.log('  Ingestion Run Summary');
  console.log(`${'='.repeat(55)}`);
  console.log(`  Accounts processed: ${allResults.length}`);
  console.log(`  Total videos:       ${allResults.reduce((s, r) => s + r.videos_scanned, 0)}`);
  console.log(`  Total new comments: ${totalNewComments}`);
  console.log(`  Total duplicates:   ${allResults.reduce((s, r) => s + r.comments_duplicate, 0)}`);
  console.log(`  Total errors:       ${allResults.reduce((s, r) => s + r.errors.length, 0)}`);
  console.log(`  Duration:           ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);
  console.log(`${'='.repeat(55)}\n`);

  // Step 5: Run-state tracking + digest alerts
  for (const account of accounts) {
    try {
      const prevState = await getRunState(account.user_id);
      let newCount = 0;

      if (prevState) {
        newCount = await countNewSince(account.user_id, prevState.last_ingested_at);
      } else {
        // First run — all new comments count as new
        newCount = totalNewComments;
      }

      await updateRunState(account.user_id);
      console.log(`${TAG} Run state updated for @${account.username} (new_count: ${newCount})`);

      // Find urgent count from this run's results
      const accountResult = allResults.find((r) => r.account_id === account.id);
      const urgentCount = accountResult ? accountResult.errors.length : 0; // placeholder

      if (newCount > 0) {
        const topItems = await getRevenueModeInbox({
          userId: account.user_id,
          limit: 3,
          includeSimulation: simulate,
        });

        await sendDigestAlert({
          username: account.username,
          newCount,
          urgentCount: 0,
          topItems,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${TAG} Run-state/digest error for @${account.username}:`, msg);
    }
  }

  await logAgentAction({
    user_id: null,
    action_type: 'ingestion_cron_complete',
    details: {
      accounts: allResults.length,
      total_new: totalNewComments,
      total_dup: allResults.reduce((s, r) => s + r.comments_duplicate, 0),
      total_errors: allResults.reduce((s, r) => s + r.errors.length, 0),
    },
    error: null,
    duration_ms: totalDuration,
  });
}

// ── Entry ──────────────────────────────────────────────────────

runCommentIngestion()
  .then(() => {
    console.log(`${TAG} Done.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`${TAG} Fatal:`, err);
    process.exit(1);
  });
