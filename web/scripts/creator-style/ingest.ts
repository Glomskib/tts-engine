#!/usr/bin/env tsx
/**
 * Creator-style ingest — CLI script.
 *
 * Reads URLs from a file, launches Playwright to extract content,
 * runs LLM analysis, and stores results in ff_creator_sources/samples.
 *
 * Usage:
 *   pnpm ff:ingest -- --creator amber --urls urls.txt --limit 25
 *   pnpm ff:ingest -- --creator amber --urls urls.txt --limit 5 --no-headless
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';
import { detectPlatform, getTranscript } from '../../lib/creator-style/transcript-adapter';
import { upsertSources, getSourcesByStatus, updateSourceStatus, upsertSample } from './lib/db';
import { launchBrowser, closeBrowser, extractFromPage } from './lib/browser';
import { describeScreenshots, analyzeVideoSample } from './lib/analysis';
import type { IngestConfig, IngestResult } from './lib/types';

const TAG = '[ff:ingest]';

// ── Arg parsing ──

function parseArgs(): IngestConfig {
  const args = process.argv.slice(2);
  let creatorKey = '';
  let urlsFile = '';
  let limit = 25;
  let headless = true;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--creator':
        creatorKey = args[++i] || '';
        break;
      case '--urls':
        urlsFile = args[++i] || '';
        break;
      case '--limit':
        limit = parseInt(args[++i] || '25', 10);
        break;
      case '--no-headless':
        headless = false;
        break;
    }
  }

  if (!creatorKey) {
    console.error(`${TAG} --creator is required`);
    process.exit(1);
  }
  if (!urlsFile) {
    console.error(`${TAG} --urls is required`);
    process.exit(1);
  }

  return { creatorKey, urlsFile, limit, headless };
}

// ── Main ──

async function main() {
  const cfg = parseArgs();

  console.log(`${TAG} Ingesting for creator="${cfg.creatorKey}" from "${cfg.urlsFile}" (limit=${cfg.limit})`);

  // 1. Read URLs from file
  const urlsPath = path.resolve(cfg.urlsFile);
  if (!fs.existsSync(urlsPath)) {
    console.error(`${TAG} File not found: ${urlsPath}`);
    process.exit(1);
  }

  const rawUrls = fs.readFileSync(urlsPath, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  console.log(`${TAG} Read ${rawUrls.length} URLs from file`);

  // 2. Detect platform per URL
  const urlEntries = rawUrls
    .map(url => {
      const platform = detectPlatform(url);
      if (!platform) {
        console.warn(`${TAG} Skipping unrecognized URL: ${url}`);
        return null;
      }
      return { url, platform };
    })
    .filter((e): e is { url: string; platform: 'tiktok' | 'youtube' } => e !== null);

  // 3. Upsert sources → filter to pending → apply limit
  await upsertSources(cfg.creatorKey, urlEntries);

  const pending = await getSourcesByStatus(cfg.creatorKey, 'pending');
  const toProcess = pending.slice(0, cfg.limit);

  console.log(`${TAG} ${pending.length} pending sources, processing ${toProcess.length}`);

  if (toProcess.length === 0) {
    console.log(`${TAG} Nothing to process — all URLs already done or failed.`);
    return;
  }

  // 4. Launch browser
  const context = await launchBrowser(cfg.headless);

  const result: IngestResult = {
    total_urls: rawUrls.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: rawUrls.length - urlEntries.length,
  };

  // 5. Process each URL sequentially
  for (let i = 0; i < toProcess.length; i++) {
    const source = toProcess[i];
    const platform = source.platform as 'tiktok' | 'youtube';
    const progress = `[${i + 1}/${toProcess.length}]`;

    console.log(`${TAG} ${progress} Processing: ${source.url}`);
    await updateSourceStatus(cfg.creatorKey, source.url, 'processing');
    result.processed++;

    try {
      // Playwright extraction
      const extracted = await extractFromPage(context, source.url, platform);

      // If DOM scraping yielded no transcript, fall back to getTranscript()
      let transcript = extracted.transcript;
      let duration = extracted.duration_seconds;

      if (!transcript || transcript.length < 20) {
        console.log(`${TAG} ${progress} DOM transcript too short, falling back to getTranscript()`);
        try {
          const tr = await getTranscript(source.url, platform);
          transcript = tr.transcript;
          duration = tr.duration_seconds;
        } catch (err) {
          console.warn(`${TAG} ${progress} Transcript fallback failed:`, err);
        }
      }

      if (!transcript || transcript.length < 10) {
        console.warn(`${TAG} ${progress} No transcript obtained — skipping analysis`);
        await updateSourceStatus(cfg.creatorKey, source.url, 'failed');
        result.failed++;
        continue;
      }

      // Screenshot descriptions via Haiku Vision
      let screenshots = extracted.screenshots;
      if (screenshots.length > 0) {
        screenshots = await describeScreenshots(screenshots, cfg.creatorKey);
      }

      // Style analysis via Haiku
      const analysis = await analyzeVideoSample(
        transcript,
        screenshots,
        cfg.creatorKey,
        platform,
      );

      // Store sample
      await upsertSample({
        creator_key: cfg.creatorKey,
        platform,
        url: source.url,
        transcript,
        ocr_text: extracted.ocr_text,
        visual_notes: screenshots
          .filter(s => s.description)
          .map(s => `[${s.timestamp_label}] ${s.description}`)
          .join('\n') || null,
        hooks: analysis.hook_pattern ? [{
          type: analysis.hook_pattern.type,
          template: analysis.hook_pattern.template,
          word_count: analysis.hook_pattern.avg_word_count,
        }] : null,
        screenshots: screenshots.map(s => ({
          timestamp_label: s.timestamp_label,
          base64_jpeg: '', // Don't store full base64 in DB
          description: s.description,
        })),
        duration_seconds: duration,
        analysis,
      });

      await updateSourceStatus(cfg.creatorKey, source.url, 'done');
      result.succeeded++;
      console.log(`${TAG} ${progress} Done ✓`);
    } catch (err) {
      console.error(`${TAG} ${progress} Failed:`, err);
      await updateSourceStatus(cfg.creatorKey, source.url, 'failed');
      result.failed++;
    }

    // Delay between URLs
    if (i < toProcess.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // 6. Cleanup
  await closeBrowser(context);

  // Summary
  console.log(`\n${TAG} === Ingest Summary ===`);
  console.log(`  Total URLs:  ${result.total_urls}`);
  console.log(`  Processed:   ${result.processed}`);
  console.log(`  Succeeded:   ${result.succeeded}`);
  console.log(`  Failed:      ${result.failed}`);
  console.log(`  Skipped:     ${result.skipped}`);
}

main().catch(err => {
  console.error(`${TAG} Fatal error:`, err);
  process.exit(1);
});
