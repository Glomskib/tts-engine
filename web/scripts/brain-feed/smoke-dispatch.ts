#!/usr/bin/env npx tsx
/**
 * Brain Feed — Smoke test for GitHub dispatch
 *
 * Lists decision files from GitHub, picks the first one,
 * parses frontmatter, and simulates dispatch logic.
 * DRY_RUN=true by default — does NOT create tasks or write back.
 *
 * Usage:
 *   npx tsx scripts/brain-feed/smoke-dispatch.ts
 *
 * Env vars (loaded from .env.local automatically by tsx):
 *   GITHUB_TOKEN, BRAIN_FEED_GITHUB_OWNER, BRAIN_FEED_GITHUB_REPO, etc.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(__dirname, '../../.env.local') });

import {
  getGitHubFeedConfig,
  listDecisionFiles,
  fetchFile,
} from '../../lib/brain-feed/github';
import {
  parseFrontmatter,
  injectFrontmatterFields,
} from '../../Automation/brain_dispatcher';

const DRY_RUN = process.env.DRY_RUN !== 'false';

async function main() {
  console.log('\n=== Brain Feed Smoke Test ===\n');
  console.log(`DRY_RUN: ${DRY_RUN}\n`);

  // 1. Check config
  const cfg = getGitHubFeedConfig();
  if (!cfg) {
    console.error('GITHUB_TOKEN not set. Cannot proceed.');
    process.exit(1);
  }
  console.log(`Repo:   ${cfg.owner}/${cfg.repo}`);
  console.log(`Branch: ${cfg.branch}`);
  console.log(`Path:   ${cfg.decisionsPath}`);
  console.log(`Writeback: ${cfg.writeback}\n`);

  // 2. List files
  console.log('Listing decision files...');
  let files: Awaited<ReturnType<typeof listDecisionFiles>>;
  try {
    files = await listDecisionFiles(cfg);
  } catch (e) {
    console.error('Failed to list files:', e);
    process.exit(1);
  }
  console.log(`Found ${files.length} markdown file(s):\n`);
  for (const f of files) {
    console.log(`  - ${f.name} (sha: ${f.sha.slice(0, 8)})`);
  }

  if (files.length === 0) {
    console.log('\nNo decision files to test. Done.');
    process.exit(0);
  }

  // 3. Fetch first file
  const target = files[0];
  console.log(`\nFetching: ${target.name}...`);
  let content: string;
  let sha: string;
  try {
    const fetched = await fetchFile(cfg, target.path);
    content = fetched.content;
    sha = fetched.sha;
  } catch (e) {
    console.error('Failed to fetch file:', e);
    process.exit(1);
  }

  console.log(`Content length: ${content.length} chars`);
  console.log(`File SHA: ${sha.slice(0, 12)}`);

  // 4. Parse frontmatter
  const parsed = parseFrontmatter(content);
  if (!parsed) {
    console.log('\nNo frontmatter found in this file.');
    process.exit(0);
  }

  console.log('\nFrontmatter:');
  for (const [key, val] of Object.entries(parsed.data)) {
    console.log(`  ${key}: ${val}`);
  }

  // 5. Check dispatch eligibility
  const { data } = parsed;
  const eligible =
    data.status === 'approved' &&
    (!data.type || data.type === 'decision') &&
    (!data.mc_status || data.mc_status === '');

  console.log(`\nEligible for dispatch: ${eligible ? 'YES' : 'NO'}`);
  if (!eligible) {
    console.log('Reason:', !data.status ? 'no status' :
      data.status !== 'approved' ? `status=${data.status}` :
      data.mc_status ? `mc_status=${data.mc_status}` :
      `type=${data.type}`);
  }

  // 6. Simulate writeback
  if (eligible && DRY_RUN) {
    const fakeTaskId = '00000000-0000-0000-0000-000000000000';
    const simulated = injectFrontmatterFields(content, {
      mc_task_id: fakeTaskId,
      mc_status: 'created',
      updated: new Date().toISOString().slice(0, 10),
    });

    console.log('\n--- Simulated writeback preview (first 500 chars) ---');
    console.log(simulated.slice(0, 500));
    console.log('--- end preview ---');
  }

  console.log('\nSmoke test complete.\n');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
