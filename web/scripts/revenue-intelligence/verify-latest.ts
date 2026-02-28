#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script
/**
 * Revenue Intelligence – Verify Latest Live Comments
 *
 * Prints the 10 most recently ingested LIVE comments (excluding sim_*).
 *
 * Usage:
 *   pnpm run ri:verify
 *   pnpm run ri:verify -- --limit 20
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const TAG = '[ri:verify]';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(`${TAG} Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
  process.exit(1);
}

const supabase = createClient(url, key);

function getLimit(): number {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--limit');
  if (idx !== -1 && idx + 1 < args.length) {
    const n = parseInt(args[idx + 1], 10);
    return isNaN(n) ? 10 : n;
  }
  return 10;
}

async function main() {
  const limit = getLimit();

  console.log(`\n${'='.repeat(65)}`);
  console.log('  Revenue Intelligence — Latest Live Comments');
  console.log(`${'='.repeat(65)}\n`);

  // Fetch latest live comments (exclude sim_*)
  const { data: comments, error } = await supabase
    .from('ri_comments')
    .select('id, ingested_at, commenter_username, platform_comment_id, comment_text, video_id, is_processed')
    .not('platform_comment_id', 'like', 'sim\\_%')
    .order('ingested_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`${TAG} Query failed:`, error.message);
    process.exit(1);
  }

  if (!comments || comments.length === 0) {
    console.log(`${TAG} No live comments found.`);
    return;
  }

  // Fetch video platform IDs
  const videoIds = Array.from(new Set(comments.map((c) => c.video_id)));
  const { data: videos } = await supabase
    .from('ri_videos')
    .select('id, platform_video_id')
    .in('id', videoIds);

  const videoMap = new Map<string, string>();
  for (const v of videos ?? []) {
    videoMap.set(v.id, v.platform_video_id);
  }

  // Print table
  console.log(`  Showing ${comments.length} most recent live comments:\n`);

  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    const videoId = videoMap.get(c.video_id) ?? 'unknown';
    const time = new Date(c.ingested_at).toLocaleString();
    const text = c.comment_text.length > 120
      ? c.comment_text.slice(0, 120) + '...'
      : c.comment_text;

    console.log(`  ${i + 1}. [${time}] @${c.commenter_username}`);
    console.log(`     ID:    ${c.platform_comment_id}`);
    console.log(`     Video: ${videoId}`);
    console.log(`     Text:  ${text}`);
    console.log(`     Processed: ${c.is_processed ? 'yes' : 'no'}`);
    console.log('');
  }

  // Summary counts
  const { count: totalLive } = await supabase
    .from('ri_comments')
    .select('id', { count: 'exact', head: true })
    .not('platform_comment_id', 'like', 'sim\\_%');

  const { count: totalSim } = await supabase
    .from('ri_comments')
    .select('id', { count: 'exact', head: true })
    .like('platform_comment_id', 'sim\\_%');

  console.log(`${'─'.repeat(65)}`);
  console.log(`  Total live comments: ${totalLive ?? 0}`);
  console.log(`  Total sim comments:  ${totalSim ?? 0}`);
  console.log(`${'─'.repeat(65)}\n`);
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
