#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script
/**
 * Revenue Intelligence – Purge Simulation Data
 *
 * Safely deletes all simulation rows (platform_comment_id like 'sim_%')
 * and their related records from:
 *   ri_reply_drafts → ri_comment_analysis → ri_comment_status → ri_comments → ri_videos
 *
 * Usage:
 *   pnpm run ri:purge:sim -- --yes-really
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const TAG = '[ri:purge-sim]';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(`${TAG} Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  if (!process.argv.includes('--yes-really')) {
    console.error(`${TAG} Safety flag required. Run with: --yes-really`);
    console.error(`${TAG} This will DELETE all simulation data (sim_* rows) permanently.`);
    process.exit(1);
  }

  console.log(`\n${'='.repeat(55)}`);
  console.log('  Revenue Intelligence — Purge Simulation Data');
  console.log(`${'='.repeat(55)}\n`);

  // Count before
  const before = await getCounts();
  console.log(`${TAG} Counts BEFORE purge:`);
  printCounts(before);

  // Step 1: Find simulation comment IDs
  const { data: simComments } = await supabase
    .from('ri_comments')
    .select('id')
    .like('platform_comment_id', 'sim\\_%');

  const simCommentIds = (simComments ?? []).map((c) => c.id);
  console.log(`\n${TAG} Found ${simCommentIds.length} simulation comments to purge`);

  if (simCommentIds.length === 0) {
    console.log(`${TAG} No simulation data found. Nothing to purge.`);
    return;
  }

  // Step 2: Delete in FK-safe order
  // 2a: reply drafts
  const { count: draftsDel } = await supabase
    .from('ri_reply_drafts')
    .delete({ count: 'exact' })
    .in('comment_id', simCommentIds);
  console.log(`${TAG} Deleted ${draftsDel ?? 0} reply drafts`);

  // 2b: comment analysis
  const { count: analysisDel } = await supabase
    .from('ri_comment_analysis')
    .delete({ count: 'exact' })
    .in('comment_id', simCommentIds);
  console.log(`${TAG} Deleted ${analysisDel ?? 0} comment analyses`);

  // 2c: comment status
  const { count: statusDel } = await supabase
    .from('ri_comment_status')
    .delete({ count: 'exact' })
    .in('comment_id', simCommentIds);
  console.log(`${TAG} Deleted ${statusDel ?? 0} comment statuses`);

  // 2d: comments
  const { count: commentsDel } = await supabase
    .from('ri_comments')
    .delete({ count: 'exact' })
    .in('id', simCommentIds);
  console.log(`${TAG} Deleted ${commentsDel ?? 0} comments`);

  // 2e: simulation-only videos (not referenced by any live comments)
  const { data: simVideos } = await supabase
    .from('ri_videos')
    .select('id')
    .like('platform_video_id', 'sim\\_%');

  let videosDel = 0;
  for (const v of simVideos ?? []) {
    // Check if any live comments reference this video
    const { count: liveRefs } = await supabase
      .from('ri_comments')
      .select('id', { count: 'exact', head: true })
      .eq('video_id', v.id);

    if ((liveRefs ?? 0) === 0) {
      await supabase.from('ri_videos').delete().eq('id', v.id);
      videosDel++;
    }
  }
  console.log(`${TAG} Deleted ${videosDel} simulation-only videos`);

  // Count after
  console.log('');
  const after = await getCounts();
  console.log(`${TAG} Counts AFTER purge:`);
  printCounts(after);

  console.log(`\n${TAG} Purge complete.`);
}

async function getCounts(): Promise<Record<string, number>> {
  const tables = ['ri_comments', 'ri_comment_analysis', 'ri_reply_drafts', 'ri_comment_status', 'ri_videos'];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const { count } = await supabase.from(t).select('id', { count: 'exact', head: true });
    counts[t] = count ?? 0;
  }
  return counts;
}

function printCounts(counts: Record<string, number>) {
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table}: ${count}`);
  }
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
