#!/usr/bin/env tsx
/**
 * MMM Calendar Batch Scheduler
 *
 * Reads a markdown social calendar file and creates marketing_posts rows
 * for each entry within the specified date range.
 *
 * Usage:
 *   npx tsx scripts/marketing/publish-mmm-calendar.ts                             # next 7 days
 *   npx tsx scripts/marketing/publish-mmm-calendar.ts --from 2026-03-01 --to 2026-03-07
 *   npx tsx scripts/marketing/publish-mmm-calendar.ts --file content/social/mmm_march_2026_calendar.md
 *   npx tsx scripts/marketing/publish-mmm-calendar.ts --dry-run                   # preview only
 *
 * One-liner for next 7 days:
 *   npx tsx scripts/marketing/publish-mmm-calendar.ts --dry-run
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const TAG = '[mmm-calendar]';
const BRAND = 'Making Miles Matter';
const DEFAULT_CALENDAR = 'content/social/mmm_march_2026_calendar.md';

// ── Types ────────────────────────────────────────────────────────
interface CalendarEntry {
  date: string;        // YYYY-MM-DD
  time: string;        // HH:MM
  scheduledFor: string; // ISO datetime
  platforms: string[];
  content: string;
  hashtags: string[];
}

// ── Calendar Parser ──────────────────────────────────────────────
function parseCalendar(markdown: string): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  const sections = markdown.split(/^## /gm).filter(Boolean);

  for (const section of sections) {
    const lines = section.trim().split('\n');
    if (lines.length === 0) continue;

    // Parse header: "2026-03-03 09:00"
    const headerMatch = lines[0].match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
    if (!headerMatch) continue;

    const [, date, time] = headerMatch;
    const scheduledFor = `${date}T${time}:00.000Z`;

    let platforms: string[] = [];
    let content = '';
    let hashtags: string[] = [];

    for (const line of lines.slice(1)) {
      const platformMatch = line.match(/^\s*-\s*\*\*Platforms?:\*\*\s*(.+)/i);
      if (platformMatch) {
        platforms = platformMatch[1].split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
        continue;
      }

      const postMatch = line.match(/^\s*-\s*\*\*Post:\*\*\s*(.+)/i);
      if (postMatch) {
        content = postMatch[1].trim();
        continue;
      }

      const hashtagMatch = line.match(/^\s*-\s*\*\*Hashtags?:\*\*\s*(.+)/i);
      if (hashtagMatch) {
        hashtags = hashtagMatch[1].split(/\s+/).map(h => h.replace(/^#/, '')).filter(Boolean);
        continue;
      }
    }

    if (content && platforms.length > 0) {
      entries.push({ date, time, scheduledFor, platforms, content, hashtags });
    }
  }

  return entries;
}

// ── Args Parser ──────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  let from: string | undefined;
  let to: string | undefined;
  let file: string | undefined;

  const fromIdx = args.indexOf('--from');
  if (fromIdx !== -1 && args[fromIdx + 1]) from = args[fromIdx + 1];

  const toIdx = args.indexOf('--to');
  if (toIdx !== -1 && args[toIdx + 1]) to = args[toIdx + 1];

  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) file = args[fileIdx + 1];

  // Default: next 7 days
  if (!from) from = new Date().toISOString().slice(0, 10);
  if (!to) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    to = d.toISOString().slice(0, 10);
  }

  return { from, to, dryRun, file };
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const { from, to, dryRun, file } = parseArgs();

  console.log(`${TAG} Calendar Scheduler`);
  console.log(`${TAG} Date range: ${from} → ${to}`);
  console.log(`${TAG} Dry run: ${dryRun}`);

  // Find calendar file
  const calendarPath = resolve(process.cwd(), file || DEFAULT_CALENDAR);
  if (!existsSync(calendarPath)) {
    // Try to find any matching calendar file in content/social/
    const socialDir = resolve(process.cwd(), 'content/social');
    const matches = existsSync(socialDir)
      ? readdirSync(socialDir).filter(f => /^mmm_.*_calendar\.md$/.test(f))
      : [];
    if (matches.length === 0) {
      console.error(`${TAG} No calendar file found at ${calendarPath}`);
      console.error(`${TAG} Create one at content/social/mmm_MONTH_YEAR_calendar.md`);
      process.exit(1);
    }
    console.log(`${TAG} Found calendar: content/social/${matches[0]}`);
  }

  const markdown = readFileSync(calendarPath, 'utf-8');
  const allEntries = parseCalendar(markdown);
  console.log(`${TAG} Parsed ${allEntries.length} total entries from calendar`);

  // Filter to date range
  const entries = allEntries.filter(e => e.date >= from! && e.date <= to!);
  console.log(`${TAG} ${entries.length} entries in range ${from} → ${to}`);

  if (entries.length === 0) {
    console.log(`${TAG} Nothing to schedule.`);
    process.exit(0);
  }

  // Print preview
  console.log('');
  for (const e of entries) {
    console.log(`  ${e.date} ${e.time} | ${e.platforms.join(', ')} | ${e.content.slice(0, 60)}...`);
  }
  console.log('');

  if (dryRun) {
    console.log(`${TAG} DRY RUN — would create ${entries.length} marketing_posts rows.`);
    process.exit(0);
  }

  // Connect to Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error(`${TAG} Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Resolve brand → platform targets (use hardcoded fallback since we're in a script)
  const { resolveTargets } = await import('../../lib/marketing/brand-accounts');
  const { classifyClaimRisk } = await import('../../lib/marketing/claim-risk');

  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const runId = `mmm-calendar-${ts}`;

  let created = 0;
  let skipped = 0;
  let blocked = 0;

  for (const entry of entries) {
    // Collision detection: check if same content + scheduled_for already exists
    const contentHash = entry.content.slice(0, 100);
    const { data: existing } = await supabase
      .from('marketing_posts')
      .select('id')
      .eq('scheduled_for', entry.scheduledFor)
      .like('content', `${contentHash}%`)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`  SKIP ${entry.date} ${entry.time} — already exists (${existing[0].id})`);
      skipped++;
      continue;
    }

    // Build full content with hashtags
    const fullContent = entry.hashtags.length > 0
      ? `${entry.content}\n\n${entry.hashtags.map(h => `#${h}`).join(' ')}`
      : entry.content;

    // Claim risk
    const risk = classifyClaimRisk(fullContent);
    if (risk.blocked) {
      console.log(`  BLOCKED ${entry.date} ${entry.time} — risk score ${risk.score} (${risk.flags.join(', ')})`);
      blocked++;
      continue;
    }

    // Resolve platform targets
    const targets = await resolveTargets(BRAND, entry.platforms as Array<'facebook' | 'twitter' | 'linkedin' | 'tiktok' | 'youtube' | 'pinterest' | 'reddit'>);

    const { error: insertErr } = await supabase
      .from('marketing_posts')
      .insert({
        content: fullContent,
        media_items: [],
        platforms: targets,
        status: 'pending',
        source: 'mmm-calendar',
        scheduled_for: entry.scheduledFor,
        claim_risk_score: risk.score,
        claim_risk_flags: risk.flags,
        created_by: 'mmm-calendar-script',
        meta: {
          run_id: runId,
          brand: BRAND,
          draft: true,
          calendar_date: entry.date,
          calendar_time: entry.time,
          original_platforms: entry.platforms,
          needs_review: risk.needs_review,
        },
      });

    if (insertErr) {
      console.error(`  ERROR ${entry.date} ${entry.time}: ${insertErr.message}`);
    } else {
      console.log(`  QUEUED ${entry.date} ${entry.time} | risk=${risk.score} | ${entry.platforms.join(',')}`);
      created++;
    }
  }

  console.log('');
  console.log(`${TAG} === Summary ===`);
  console.log(`${TAG} Created: ${created}`);
  console.log(`${TAG} Skipped (duplicates): ${skipped}`);
  console.log(`${TAG} Blocked (claim risk): ${blocked}`);
  console.log(`${TAG} Run ID: ${runId}`);

  if (created > 0) {
    console.log(`${TAG}`);
    console.log(`${TAG} Posts are PENDING (draft). The marketing-scheduler cron will schedule them via Late.`);
    console.log(`${TAG} To trigger now: curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/marketing-scheduler`);
  }
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
