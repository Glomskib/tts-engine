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

import { acquireRunLock, releaseRunLock } from '../../lib/revenue-intelligence/run-lock';
import {
  getActiveCreatorAccounts,
  runIngestionForAccount,
  getUnprocessedComments,
  markCommentsProcessed,
  logAndTime,
} from '../../lib/revenue-intelligence/comment-ingestion-service';
import { classifyComments } from '../../lib/revenue-intelligence/comment-classification-service';
import { generateReplyDrafts } from '../../lib/revenue-intelligence/reply-draft-service';
import { flagUrgentComments } from '../../lib/revenue-intelligence/urgency-scoring-service';
import { enqueueActions } from '../../lib/revenue-intelligence/actions-queue-service';
import { scrapeAccount } from '../../lib/revenue-intelligence/tiktok-scraper';
import { generateSimulationData } from '../../lib/revenue-intelligence/simulation-data';
import { logAgentAction } from '../../lib/revenue-intelligence/agent-logger';
import { getRunState, countNewSince, updateRunState, updateAlertState } from '../../lib/revenue-intelligence/run-state-service';
import { sendDigestAlert } from '../../lib/revenue-intelligence/telegram-digest';
import { getRevenueModeInbox } from '../../lib/revenue-intelligence/revenue-inbox-service';
import { evaluateAlertPolicy, loadAlertConfigFromEnv } from '../../lib/revenue-intelligence/alert-policy';
import { isAutoDraftEnabled, loadAutoDraftConfig, runAutoDrafts } from '../../lib/revenue-intelligence/auto-draft-service';
import { startRun, finishRun, isJobRunning } from '../../lib/ops/run-tracker';
import { checkAndSendFailureAlert } from '../../lib/ops/failure-alert';
import { detectRunSource, detectRequestedBy } from '../../lib/ops/run-source';
import { getNodeId } from '../../lib/node-id';
import type { IngestionConfig, IngestionRunResult, RiCreatorAccount } from '../../lib/revenue-intelligence/types';
import { DEFAULT_INGESTION_CONFIG } from '../../lib/revenue-intelligence/types';

const TAG = '[ri:cron]';

// ── Parse CLI args ─────────────────────────────────────────────

function parseArgs(): {
  simulate: boolean;
  dryRun: boolean;
  userId: string | null;
  headless: boolean;
  forceAlert: boolean;
} {
  const args = process.argv.slice(2);
  return {
    simulate: args.includes('--simulate') || args.includes('--sim'),
    dryRun: args.includes('--dry-run'),
    userId: getArgValue(args, '--user'),
    headless: !args.includes('--headed'),
    forceAlert: args.includes('--force-alert'),
  };
}

function getArgValue(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

// ── Main ───────────────────────────────────────────────────────

async function runCommentIngestion(): Promise<void> {
  const { simulate, dryRun, userId, headless, forceAlert } = parseArgs();

  const runSource = detectRunSource();
  const requestedBy = detectRequestedBy();

  // ── DB-level lock: prevent cross-machine double-execution ──
  try {
    const activeRun = await isJobRunning('ri_ingestion', 15);
    if (activeRun) {
      console.error(`${TAG} Exiting — another ingestion run is active in DB (id=${activeRun.id}, source=${activeRun.run_source}, started=${activeRun.started_at}).`);
      process.exit(2);
    }
  } catch (err) {
    // Fail open — don't block on DB errors, fall through to file lock
    console.error(`${TAG} DB lock check failed (non-fatal, proceeding):`, err);
  }

  // ── File-based run lock: prevent overlapping runs on same machine ──
  if (!acquireRunLock()) {
    console.error(`${TAG} Exiting — another ingestion run is active (file lock).`);
    process.exit(2);
  }

  const startTime = Date.now();
  const nodeId = getNodeId();

  // ── Start run tracking ──
  let runId: string | null = null;
  try {
    runId = await startRun({
      job: 'ri_ingestion',
      meta: {
        mode: simulate ? 'simulation' : 'live',
        dry_run: dryRun,
        node_id: nodeId,
      },
      run_source: runSource,
      requested_by: requestedBy,
    });
  } catch (err) {
    console.error(`${TAG} Failed to start run tracking (non-fatal):`, err);
  }

  const ingestionConfig: IngestionConfig = {
    ...DEFAULT_INGESTION_CONFIG,
    headless,
    simulation_mode: simulate,
  };

  console.log(`\n${'='.repeat(55)}`);
  console.log('  Revenue Intelligence — Comment Ingestion');
  console.log(`${'='.repeat(55)}`);
  console.log(`  Mode:       ${simulate ? 'SIMULATION' : 'LIVE'}`);
  console.log(`  Source:     ${runSource}`);
  if (requestedBy) console.log(`  Requested:  ${requestedBy}`);
  console.log(`  Dry run:    ${dryRun}`);
  console.log(`  Headless:   ${headless}`);
  console.log(`  Max videos: ${ingestionConfig.max_videos_per_account}`);
  console.log(`  Max cmts:   ${ingestionConfig.max_comments_per_video}`);
  if (userId) console.log(`  User:       ${userId}`);
  if (forceAlert) console.log(`  Force alert: true`);
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

  // Step 3: Classify + generate drafts + flag urgency + enqueue actions
  let totalQueuedThisRun = 0;
  let totalAutoDrafts = 0;
  const autoDraftEnabled = isAutoDraftEnabled();
  const autoDraftConfig = autoDraftEnabled ? loadAutoDraftConfig() : null;

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

        // Auto-draft: selectively draft high-scoring items first (gated)
        if (autoDraftEnabled && autoDraftConfig) {
          try {
            console.log(`${TAG} Auto-drafting high-scoring items (lead >= ${autoDraftConfig.leadScoreMin})...`);
            const adResult = await runAutoDrafts(commentIds, autoDraftConfig);
            totalAutoDrafts += adResult.generated;
            console.log(`${TAG} Auto-drafts: ${adResult.generated} rows (${adResult.qualified} qualified)`);
            if (adResult.errors.length > 0) {
              console.warn(`${TAG} Auto-draft warnings:`, adResult.errors);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`${TAG} Auto-draft error (non-fatal):`, msg);
          }
        }

        // Generate reply drafts (skips items already drafted by auto-draft above)
        console.log(`${TAG} Generating reply drafts...`);
        const draftResult = await generateReplyDrafts(commentIds);
        console.log(`${TAG} Drafts generated: ${draftResult.generated}`);

        // Flag urgent
        console.log(`${TAG} Scoring urgency...`);
        const urgencyResult = await flagUrgentComments(commentIds);
        console.log(`${TAG} Flagged urgent: ${urgencyResult.flagged}`);

        // Enqueue actions for human review
        console.log(`${TAG} Enqueuing actions...`);
        const queueResult = await enqueueActions({ userId: account.user_id, commentIds });
        console.log(`${TAG} Enqueued: ${queueResult.enqueued}`);
        totalQueuedThisRun += queueResult.enqueued;
        if (queueResult.errors.length > 0) {
          console.warn(`${TAG} Queue errors:`, queueResult.errors);
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
  if (autoDraftEnabled) {
    console.log(`  Auto-drafts:        ${totalAutoDrafts}`);
  }
  console.log(`  Duration:           ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);
  console.log(`${'='.repeat(55)}\n`);

  // Step 5: Run-state tracking + alert policy
  let aggregateNewCount = 0;
  let lastAlertSentAt: string | null = null;
  const firstAccount = accounts[0];

  for (const account of accounts) {
    try {
      const prevState = await getRunState(account.user_id);
      let newCount = 0;

      if (prevState) {
        newCount = await countNewSince(account.user_id, prevState.last_ingested_at);
        // Use the most recent last_alert_sent_at across accounts
        if (prevState.last_alert_sent_at && (!lastAlertSentAt || prevState.last_alert_sent_at > lastAlertSentAt)) {
          lastAlertSentAt = prevState.last_alert_sent_at;
        }
      } else {
        // First run — all new comments count as new
        newCount = totalNewComments;
      }

      aggregateNewCount += newCount;
      await updateRunState(account.user_id);
      console.log(`${TAG} Run state updated for @${account.username} (new_count: ${newCount})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${TAG} Run-state error for @${account.username}:`, msg);
    }
  }

  // Count urgent items enqueued since the last alert (avoid re-alerting on stale items)
  let urgentCount = 0;
  try {
    const { supabaseAdmin: sb } = await import('../../lib/supabaseAdmin');
    let query = sb
      .from('ri_actions_queue')
      .select('id', { count: 'exact', head: true })
      .gte('priority_score', 75)
      .eq('status', 'queued');
    if (lastAlertSentAt) {
      query = query.gt('created_at', lastAlertSentAt);
    }
    const { count } = await query;
    urgentCount = count ?? 0;
  } catch {
    // ignore — urgentCount stays 0
  }

  // Evaluate alert policy
  const alertConfig = loadAlertConfigFromEnv();
  const alertResult = evaluateAlertPolicy(
    { newCount: aggregateNewCount, urgentCount, lastAlertSentAt, forceAlert },
    alertConfig,
  );

  console.log(`${TAG} Alert policy: mode=${alertConfig.mode}, shouldSend=${alertResult.shouldSend}, reason="${alertResult.reason}"`);

  if (alertResult.shouldSend && firstAccount) {
    // ── Dedupe guard: re-check last_alert_sent_at from DB right before sending ──
    // This prevents duplicate alerts when multiple schedulers (brandon + wife slots,
    // or overlapping launchd runs) evaluate the policy concurrently.
    let dedupeSkip = false;
    if (!forceAlert) {
      try {
        const freshState = await getRunState(firstAccount.user_id);
        if (freshState?.last_alert_sent_at) {
          const elapsed = Date.now() - new Date(freshState.last_alert_sent_at).getTime();
          const windowMs = alertConfig.digestMinutes * 60 * 1000;
          if (elapsed < windowMs) {
            console.log(`${TAG} Dedupe guard: alert already sent ${Math.round(elapsed / 60000)}min ago (window=${alertConfig.digestMinutes}min) — skipping`);
            dedupeSkip = true;
          }
        }
      } catch (err) {
        // Non-fatal — proceed with send if dedupe check fails
        console.warn(`${TAG} Dedupe guard check failed, proceeding:`, err instanceof Error ? err.message : String(err));
      }
    }

    if (!dedupeSkip) {
      try {
        const topItems = await getRevenueModeInbox({
          userId: firstAccount.user_id,
          includeSimulation: simulate,
          limit: 5,
        });

        // ── Summary hash dedupe: skip if identical summary already sent within window ──
        const summaryObj = {
          newCount: aggregateNewCount,
          urgentCount,
          reason: alertResult.reason,
          topItemCount: topItems.length,
        };
        let summaryDup = false;
        if (!forceAlert) {
          try {
            const { supabaseAdmin: sb } = await import('../../lib/supabaseAdmin');
            const { data: stateRow } = await sb
              .from('ri_run_state')
              .select('last_alert_summary')
              .eq('user_id', firstAccount.user_id)
              .single();
            if (stateRow?.last_alert_summary) {
              const prevHash = JSON.stringify(stateRow.last_alert_summary);
              const currHash = JSON.stringify(summaryObj);
              if (prevHash === currHash) {
                console.log(`${TAG} Dedupe guard: identical summary already sent — skipping`);
                summaryDup = true;
              }
            }
          } catch {
            // Non-fatal — proceed with send
          }
        }

        if (!summaryDup) {
          const sent = await sendDigestAlert({
            username: firstAccount.username,
            newCount: aggregateNewCount,
            urgentCount,
            topItems,
            policyReason: alertResult.reason,
          });

          if (sent) {
            // Persist alert state for all accounts
            for (const account of accounts) {
              await updateAlertState(account.user_id, summaryObj);
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${TAG} Digest alert error:`, msg);
      }
    }
  }

  // ── Finish run tracking ──
  const totalErrors = allResults.reduce((s, r) => s + r.errors.length, 0);
  if (runId) {
    try {
      await finishRun(runId, totalErrors > 0 ? 'error' : 'ok', {
        accounts: allResults.length,
        total_new: totalNewComments,
        total_dup: allResults.reduce((s, r) => s + r.comments_duplicate, 0),
        total_videos: allResults.reduce((s, r) => s + r.videos_scanned, 0),
        total_errors: totalErrors,
        auto_drafts: totalAutoDrafts,
        alert_sent: alertResult.shouldSend,
        duration_ms: totalDuration,
        node_id: nodeId,
      });
    } catch (err) {
      console.error(`${TAG} Failed to finish run tracking (non-fatal):`, err);
    }
  }

  await logAgentAction({
    user_id: null,
    action_type: 'ingestion_cron_complete',
    details: {
      accounts: allResults.length,
      total_new: totalNewComments,
      total_dup: allResults.reduce((s, r) => s + r.comments_duplicate, 0),
      total_errors: totalErrors,
      auto_drafts: totalAutoDrafts,
    },
    error: null,
    duration_ms: totalDuration,
  });
}

// ── Entry ──────────────────────────────────────────────────────

runCommentIngestion()
  .then(() => {
    releaseRunLock();
    console.log(`${TAG} Done.`);
    process.exit(0);
  })
  .catch(async (err) => {
    releaseRunLock();
    console.error(`${TAG} Fatal:`, err);
    // Best-effort failure alert
    try {
      await checkAndSendFailureAlert({
        source: 'ri_ingestion',
        error: err instanceof Error ? err.message : String(err),
        cooldownMinutes: 60,
      });
    } catch { /* never block exit */ }
    process.exit(1);
  });
