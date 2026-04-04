# Cron/Scheduler Audit

**Date:** 2026-03-09
**Scope:** Vercel cron schedules vs actual route handlers

## Summary

| Metric | Count |
|--------|-------|
| Cron routes in `app/api/cron/` | 37 |
| Scheduled in `vercel.json` (before fix) | 28 |
| Scheduled in `vercel.json` (after fix) | 37 |
| Ghost entries removed | 1 (`nightly-reset`) |
| Previously unscheduled routes added | 10 |
| Placeholder/misleading crons | 1 (`metrics-sync`) |

## Scheduling Mechanism

- **Sole scheduler:** `vercel.json` `crons` array
- **Auth:** All cron routes use `CRON_SECRET` Bearer token (Vercel sends this automatically)
- **Error handling:** Most routes use `withErrorCapture` wrapper for Sentry reporting

## Changes Made

### Removed: Ghost Entry

| Path | Reason |
|------|--------|
| `/api/cron/nightly-reset` | No route exists. Identified in previous audit (FF-AUD-011). |

### Added: 10 Previously Unscheduled Routes

| Path | Schedule | Reason |
|------|----------|--------|
| `/api/cron/analyze-videos` | `*/15 * * * *` | CRITICAL: video analysis queue processor |
| `/api/cron/brain-dispatch` | `*/2 * * * *` | Decision→task dispatch, high-throughput |
| `/api/cron/build-creator-dna` | `0 5 * * *` | Daily creator DNA aggregation |
| `/api/cron/process-payouts` | `0 8 1 * *` | Monthly affiliate payouts (has idempotency guard) |
| `/api/cron/marketing-health` | `0 */6 * * *` | Marketing system health probe |
| `/api/cron/radar-scan` | `0 */4 * * *` | Opportunity radar scanning |
| `/api/cron/rescore-trends` | `30 */6 * * *` | Trend score freshness recalculation |
| `/api/cron/sync-tiktok-sales` | `0 7 * * *` | TikTok Shop revenue attribution |
| `/api/cron/weekly-report-card` | `0 18 * * 1` | User-facing weekly performance reports |
| `/api/cron/weekly-summaries` | `30 18 * * 1` | Strategy optimization summaries |

## Placeholder/Misleading Crons

### `metrics-sync` — Runs but does nothing

**Schedule:** `*/30 * * * *` (every 30 min)
**File:** `app/api/cron/metrics-sync/route.ts`

Has real infrastructure (finds stale posts, inserts snapshots, updates scores) but all 3 metric provider functions are stubs:

```typescript
async function tryPlatformApi(): Promise<MetricsData | null> { return null; }
async function tryPostingProvider(): Promise<MetricsData | null> { return null; }
async function tryScrapeLite(): Promise<MetricsData | null> { return null; }
```

**Impact:** Runs every 30 minutes, queries the database, but never actually syncs any metrics. Creates false confidence that metrics are being tracked. The cascade `platform_api → posting_provider → scrape-lite → skip` always reaches `skip`.

**Recommendation:** Either implement at least one provider (Late.dev analytics is the most viable) or reduce frequency to daily until implementation is ready.

## Feature Impact Analysis

### CRITICAL (Revenue/User-Facing)

| Cron | Impact If Not Running |
|------|-----------------------|
| `process-jobs` | All queued jobs stall (rendering, generation, etc.) |
| `check-renders` | Videos stuck in AI_RENDERING forever |
| `orchestrator` | Pipeline progression stops |
| `auto-post` | Scheduled social posts never publish |
| `analyze-videos` | Video analysis queue never processes — was unscheduled |
| `process-payouts` | Affiliates never get paid — was unscheduled |
| `sync-tiktok-sales` | Revenue attribution stops — was unscheduled |

### HIGH (Feature Degradation)

| Cron | Impact If Not Running |
|------|-----------------------|
| `brain-dispatch` | Decisions pile up without task creation — was unscheduled |
| `build-creator-dna` | Creator profiles become stale — was unscheduled |
| `weekly-report-card` | Users stop receiving performance reports — was unscheduled |
| `weekly-summaries` | Strategy optimization goes stale — was unscheduled |
| `content-item-processing` | Content pipeline stalls |
| `drive-intake-poll/worker` | Google Drive imports stop |

### MEDIUM (Operational)

| Cron | Impact If Not Running |
|------|-----------------------|
| `radar-scan` | Opportunity detection stops — was unscheduled |
| `rescore-trends` | Trend scores become stale — was unscheduled |
| `marketing-health` | No health monitoring for marketing system — was unscheduled |
| `metrics-sync` | Already a no-op (placeholder) |
| `clip-discover/analyze` | Clip index stops growing |
| `detect-winners` | Winner pattern detection pauses |

### LOW (Informational)

| Cron | Impact If Not Running |
|------|-----------------------|
| `daily-digest` | Daily Telegram digest skipped |
| `weekly-digest` | Weekly digest skipped |
| `daily-virals` | Viral scan skipped |
| `script-of-the-day` | Daily script generation skipped |

## Full Schedule (37 crons, ordered by frequency)

| Frequency | Path | Schedule |
|-----------|------|----------|
| Every minute | `process-jobs` | `* * * * *` |
| Every 2 min | `check-renders` | `*/2 * * * *` |
| Every 2 min | `orchestrator` | `*/2 * * * *` |
| Every 2 min | `brain-dispatch` | `*/2 * * * *` |
| Every 5 min | `drive-intake-poll` | `*/5 * * * *` |
| Every 5 min | `drive-intake-worker` | `*/5 * * * *` |
| Every 5 min | `content-item-processing` | `*/5 * * * *` |
| Every 15 min | `auto-post` | `*/15 * * * *` |
| Every 15 min | `posting-reminders` | `*/15 * * * *` |
| Every 15 min | `triage-issues` | `*/15 * * * *` |
| Every 15 min | `marketing-scheduler` | `*/15 * * * *` |
| Every 15 min | `analyze-videos` | `*/15 * * * *` |
| Every 30 min | `metrics-sync` | `*/30 * * * *` |
| Hourly | `clip-analyze` | `15 * * * *` |
| Every 4 hours | `radar-scan` | `0 */4 * * *` |
| Every 6 hours | `process-emails` | `0 */6 * * *` |
| Every 6 hours | `discord-role-sync` | `0 */6 * * *` |
| Every 6 hours | `clip-discover` | `0 */6 * * *` |
| Every 6 hours | `detect-winners` | `0 */6 * * *` |
| Every 6 hours | `marketing-health` | `0 */6 * * *` |
| Every 6 hours | `rescore-trends` | `30 */6 * * *` |
| Daily 5 AM | `build-creator-dna` | `0 5 * * *` |
| Daily 6 AM | `sync-tiktok-videos` | `0 6 * * *` |
| Daily 6 AM | `finops-daily` | `0 6 * * *` |
| Daily 7 AM | `sync-tiktok-sales` | `0 7 * * *` |
| Daily 1 PM | `retainer-check` | `0 13 * * *` |
| Daily 1:30 PM | `daily-virals` | `30 13 * * *` |
| Daily 2 PM | `daily-digest` | `0 14 * * *` |
| Daily 3 PM | `script-of-the-day` | `0 15 * * *` |
| Mon 4 PM | `weekly-digest` | `0 16 * * 1` |
| Mon 5 PM | `weekly-trainer` | `0 17 * * 1` |
| Mon 5:30 PM | `weekly-support-report` | `30 17 * * 1` |
| Mon 6 PM | `weekly-report-card` | `0 18 * * 1` |
| Mon 6:30 PM | `weekly-summaries` | `30 18 * * 1` |
| Mon 6:30 AM | `finops-weekly` | `30 6 * * 1` |
| 1st of month | `process-payouts` | `0 8 1 * *` |
| Sun 4 AM | `cleanup-webhook-events` | `0 4 * * 0` |

## Known Issues

1. **`metrics-sync` is a no-op** — All 3 provider functions return `null`. Runs every 30 min doing nothing useful.
2. **`nightly-reset` was a ghost** — Scheduled but had no route handler. Removed.
3. **10 routes were unscheduled** — Including critical ones like `analyze-videos`, `process-payouts`, and `sync-tiktok-sales`. Now scheduled.

## Verification

- `pnpm tsc --noEmit` — passes
- `vercel.json` — valid JSON with 37 cron entries
- System status endpoint updated with complete cron list
