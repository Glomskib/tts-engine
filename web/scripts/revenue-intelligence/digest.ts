#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * Revenue Intelligence – Digest CLI
 *
 * Prints a JSON digest of high-intent comments to stdout.
 * Same shape as GET /api/revenue-mode/digest.
 *
 * Usage:
 *   pnpm run ri:digest
 *   pnpm run ri:digest -- --sim           # include simulation data
 *   pnpm run ri:digest -- --limit 3       # limit items
 *   pnpm run ri:digest -- --min-score 80  # minimum lead score
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { getRevenueModeInbox } from '../../lib/revenue-intelligence/revenue-inbox-service';
import { getActiveCreatorAccounts } from '../../lib/revenue-intelligence/comment-ingestion-service';

const TAG = '[ri:digest]';

async function main() {
  const args = process.argv.slice(2);
  const includeSimulation = args.includes('--sim') || args.includes('--simulate');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 && args[limitIdx + 1] ? Number(args[limitIdx + 1]) : 5;
  const minIdx = args.indexOf('--min-score');
  const minLeadScore = minIdx !== -1 && args[minIdx + 1] ? Number(args[minIdx + 1]) : 70;

  let userId = process.env.RI_TEST_USER_ID;
  if (!userId) {
    // Fallback: use the first active creator account's user_id
    const accounts = await getActiveCreatorAccounts();
    if (accounts.length > 0) {
      userId = accounts[0].user_id;
      console.error(`${TAG} Using user_id from first active account: ${userId}`);
    } else {
      console.error(`${TAG} No RI_TEST_USER_ID and no active creator accounts found`);
      process.exit(1);
    }
  }

  const items = await getRevenueModeInbox({ userId, minLeadScore, includeSimulation, limit });

  const digest = items.map((item) => ({
    commentId: item.commentId,
    commenterUsername: item.commenterUsername,
    preview: item.commentText.slice(0, 160),
    category: item.category,
    leadScore: item.leadScore,
    urgencyScore: item.urgencyScore,
    status: item.status,
    videoUrl: item.videoUrl ?? null,
    ingestedAt: item.ingestedAt ?? null,
  }));

  console.log(JSON.stringify({
    ok: true,
    total: digest.length,
    minLeadScore,
    includeSimulation,
    items: digest,
    ts: new Date().toISOString(),
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`${TAG} Fatal:`, err);
    process.exit(1);
  });
