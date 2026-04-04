# Production Observability Guide

**Updated:** 2026-03-09
**Purpose:** Document what observability exists, how to use it, and what to watch for.

## Health Endpoint

**GET** `/api/admin/system-status` (admin-only)

Returns a comprehensive health report including:

| Section | What it checks |
|---------|---------------|
| `status` | Overall system health: `healthy`, `degraded`, `unhealthy` |
| `envBoot` | Boot env vars (required/optional counts) + integration config status |
| `services` | External API reachability: Supabase, HeyGen, ElevenLabs, Runway, Shotstack, TikTok Content, tikwm, Stripe, OpenClaw |
| `pipeline` | Stuck rendering (>2h), stuck review (>24h), failed videos (24h) |
| `usage` | Total users, active users (7d), credits consumed today |
| `metricsSystem` | Provider status, snapshot counts, coverage gaps |
| `workflowHealth` | Workflow checks, cron freshness, job queue health (see below) |
| `cronJobs` | Full cron schedule (37 entries) |

### Environment Boot Status (`envBoot`)

Powered by `lib/env-validation.ts`. Returns:
- `env_ok` — all REQUIRED_AT_BOOT vars present
- `required_present` / `required_total` — boot env var counts
- `optional_present` / `optional_total` — feature env var counts
- `integrations` — per-system config check for 13 integration systems (Stripe, TikTok, Google Drive, HeyGen, Shotstack, Runway, OpenClaw, Telegram, Email, Late.dev, Mission Control, Discord, TikTok Content)

Each integration reports `configured: true/false` and which env vars are `missing`.

### Workflow Health (`workflowHealth`)

Powered by `lib/ops/workflow-health.ts`. Runs 3 parallel checks:

1. **Cron Freshness** — Queries `ff_cron_runs` for 8 critical crons with per-cron thresholds:

   | Cron | Degraded After | Critical After |
   |------|---------------|----------------|
   | orchestrator | 30min | 1h |
   | process-jobs | 6min | 30min |
   | metrics-sync | 2h | 6h |
   | drive-intake-poll | 1h | 4h |
   | sync-tiktok-videos | 30h | 72h |
   | detect-winners | 12h | 48h |
   | radar-scan | 8h | 24h |
   | clip-discover | 12h | 48h |

2. **Job Queue** — Checks `jobs` table for pending/running/failed counts. Degraded if oldest pending >15min or >20 pending. Critical if oldest pending >1h.

3. **Workflow Checks** — Per-workflow operational health:
   - **TikTok Draft Export** — Config + connection + recent export success rate
   - **Google Drive Intake** — Credentials + last poll freshness
   - **Email System** — Overdue unsent emails in `email_queue`
   - **Content Pipeline** — Stuck AI_RENDERING videos + failed content jobs
   - **Webhook Delivery** — Failed delivery rate over 24h
   - **Metrics Freshness** — Last snapshot age (degraded >36h, critical >72h)
   - **Opportunity Radar** — Last scan + last ingest (clip-discover) + last trend rescore

### Severity Model

| Level | Meaning |
|-------|---------|
| `healthy` | Working as expected |
| `degraded` | Partially working or stale data — investigate soon |
| `critical` | Broken or not running — needs immediate attention |
| `unknown` | Cannot determine (table missing, no data yet, not configured) |

Overall severity = worst of all individual checks (excluding `unknown`).

## Telegram Alerts

### Manual Report
**POST** `/api/admin/system-status/telegram` (admin-only)

Sends a formatted health summary to Telegram. Includes services, pipeline, workflow health (only non-healthy items), and warnings.

### Automatic Failure Alerts
`lib/ops/failure-alert.ts` — Throttled per-source Telegram alerts with cooldown tracking via `ff_cron_runs`. Currently used by:
- Revenue intelligence ingestion

To add failure alerting to a new cron:
```typescript
import { checkAndSendFailureAlert } from '@/lib/ops/failure-alert';

// In your catch block:
await checkAndSendFailureAlert({
  source: 'my_cron_name',
  error: err.message,
  cooldownMinutes: 30,
  context: { someKey: someValue },
});
```

## Error Capture

`withErrorCapture` wrapper (from `lib/api-errors.ts`) is applied to 69 API routes. Captures errors to:
- Console (always)
- Sentry (when configured)

## Cron Run Tracking

`lib/ops/run-tracker.ts` provides:
- `startRun(job)` / `finishRun(runId, status, meta)` — Record cron executions in `ff_cron_runs`
- `getRecentRuns(job, limit)` / `getLastRun(job)` — Query run history
- `isJobRunning(job)` — Check for in-progress runs
- `acquireDbRunLock(job, ttlMinutes)` — Prevent concurrent cron execution

## Silent Failure Patterns

Fire-and-forget async operations now log warnings instead of silently swallowing errors:
- `lib/finops/log-tool-usage.ts` — `logToolUsageEventAsync()`
- `lib/finops/log-usage.ts` — `logUsageEventAsync()`
- `lib/flashflow/generations.ts` — `logGenerationAsync()`, `logGenerationWithEvent()`
- `lib/webhooks.ts` — `dispatchWebhook()` delivery settlement

These appear as `console.warn` in Vercel function logs and can be searched for via the `[finops/`, `[ff:`, and `[webhooks]` prefixes.

## Additional Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/queue-health` | Queue aging buckets, stuck items (>24h in same status) |
| `GET /api/admin/job-health` | Job SLA tracking, stall detection, per-job health flags |
| `GET /api/admin/ops-metrics` | Pipeline throughput, blockers, aging, ingestion metrics |
| `GET /api/admin/openclaw-status` | OpenClaw feature gates, heartbeat, MC connectivity |
| `GET /api/admin/integrations/test` | Env var presence for all services |
| `POST /api/admin/integrations/test` | Live API test for a specific service |
| `GET /api/observability/health` | Lightweight health check for uptime monitoring |

## UI

**System Status page:** `/admin/settings/system-status`

Displays all health data in a single dashboard:
- Overall status banner with severity coloring
- **Environment config section** — required/optional env var counts, unconfigured integrations with missing vars
- Service cards with latency and details (including Stripe, OpenClaw)
- Pipeline health cards (stuck/failed counts)
- Workflow health section with severity pills
- Job queue status
- Cron freshness table with last run times and failure counts
- Metrics system provider status and coverage
- Full cron schedule table
- Send to Telegram button

Auto-refreshes every 60 seconds (toggleable).

**Note:** `/admin/system-health` redirects to `/admin/settings/system-status`.

## What Operators Should Check First

1. **Overall status banner** — if red, look at workflow health and services
2. **Env config section** — if integrations show as unconfigured, features are silently disabled
3. **Cron freshness table** — any critical/degraded crons need Vercel function log investigation
4. **Job queue** — growing backlog means process-jobs cron may be failing
5. **Workflow checks** — per-workflow cards show exactly what's wrong

## What to Watch For

| Signal | Where to look | Action |
|--------|--------------|--------|
| Env boot vars missing | System Status → Environment Config | Check Vercel env vars, redeploy |
| Integration unconfigured | System Status → Environment Config | Add missing env vars in Vercel |
| Cron freshness critical | System Status → Workflow Health | Check Vercel cron config, function logs |
| Job backlog growing | System Status → Job Queue | Check process-jobs cron, look for stuck jobs |
| Webhook failures >50% | System Status → Workflow Health | Check webhook URLs, subscriber health |
| Metrics data stale (>36h) | System Status → Workflow Health | Check metrics-sync cron, sync-tiktok-videos |
| Radar scans not running | System Status → Workflow Health | Check radar-scan cron, OPENCLAW config |
| Service unhealthy | System Status → Services | Check API key validity, service outage |
| Silent failure warnings | Vercel logs (search `[finops/`, `[ff:`, `[webhooks]`) | Investigate DB connectivity, table existence |

## Known Limitations

- **Metrics sync is partially a no-op**: `posting_provider` and `scrape_lite` are disabled. Only `internal_lookup` (via tiktok_videos table) works.
- **Automatic failure alerts** are only wired to RI ingestion. Other crons log errors to ff_cron_runs but don't auto-alert to Telegram (can be added per the pattern above).
- **No distributed tracing**: Sentry captures exceptions but not request flow traces.
- **OpenClaw health check**: Uses `/api/health` endpoint which may 404 if OpenClaw doesn't expose it — will show as degraded rather than healthy.
- **Service checks use 5-second timeouts**: A slow but working service may intermittently show as degraded.
