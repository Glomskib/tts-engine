# Creator Radar — Cost Model & Architecture

## Architecture Decision: Hybrid Monitoring Model

### Chosen: Workspace-scoped watchlist + shared global creator sources

Each workspace manages its own watchlist of creators to monitor. Behind the scenes, a `creator_sources` table acts as a global dedup layer: when multiple workspaces watch the same creator (platform + handle), we store a single shared record and scan that creator once at the highest entitled frequency.

**Why this approach:**
- Workspace isolation: each workspace sees only their data
- No redundant scanning: same creator scanned once regardless of watcher count
- Cost scales with unique creators, not total watchlist entries
- Simple v1 with clear upgrade path

### Tables

| Table | Scope | Purpose |
|-------|-------|---------|
| `creator_watchlist` | workspace | Which creators this workspace monitors |
| `creator_sources` | global | Canonical per-creator monitoring state, deduped by platform+handle |
| `creator_product_observations` | workspace | Products spotted from a creator |
| `opportunities` | workspace | Scored observations ready for action |
| `creator_scan_log` | global | Audit trail of scan operations for cost tracking |

## Plan-Based Creator Limits

| Plan | Max Creators | Scans/Day | Visible Opportunities |
|------|-------------|-----------|----------------------|
| Free | 5 | 1 | 10 |
| Lite | 15 | 2 | 50 |
| Pro | 50 | 4 | Unlimited |
| Business | 100 | 6 | Unlimited |
| Brand | 200 | 8 | Unlimited |
| Agency | 500 | 12 | Unlimited |

Limits are enforced at the API layer (`canAddCreator()` in `lib/opportunity-radar/limits.ts`), not just the UI.

## Scan Cadence by Tier

The highest entitled plan among all workspaces watching a creator determines that creator's scan frequency. For example, if one Free user and one Pro user both watch `@creator`, the creator is scanned 4x/day (Pro cadence).

Scan interval = `24 / scansPerDay` hours. The `creator_sources.scan_interval_hours` field stores the resolved interval.

## Cost Control Rules

1. **No AI enrichment on every scan.** Only run deeper analysis when:
   - A new product observation is detected
   - An observation's `times_seen` or `confidence` materially changed
2. **No repeated writes if nothing changed.** Scans that find no new products log `status: 'no_change'` and skip DB writes to observations.
3. **Scan budget accounting.** The `creator_scan_log` table tracks every scan with `duration_ms`, `products_found`, `new_observations`, enabling cost monitoring.
4. **Rate limit handling.** If a platform returns rate-limited responses, the scan logs `status: 'rate_limited'` and the source's `next_check_at` is pushed forward.

## End-to-End Scan Pipeline

```
FlashFlow Cron ─────────────────────────────────────────────────────────►
│
├─ app/api/cron/radar-scan/route.ts
│  • Runs on schedule (e.g. every 5 min via Vercel cron)
│  • Calls getDueScans() to find overdue creator_sources
│  • Skips sources with active (pending/running) scan_creator jobs
│  • Enqueues scan_creator jobs (max 20 per tick)
│
▼
Job Queue (scan_creator) ───────────────────────────────────────────────►
│
├─ lib/jobs/handlers.ts → scan_creator handler
│  • Gathers workspace IDs watching this creator
│  • Calls requestCreatorScan() via lib/openclaw/client.ts
│  • Supports two response modes:
│    - Synchronous: products returned inline → ingest immediately
│    - Async: OpenClaw returns {mode: "accepted"} → callback later
│
▼
OpenClaw Agent ─────────────────────────────────────────────────────────►
│
├─ Receives scan request at POST /api/scan/creator
│  • Payload: creator_handle, platform, creator_source_id, callback_url
│  • Scrapes creator's TikTok Shop showcase / product catalog
│  • Normalizes product observations
│  • POSTs results to FlashFlow callback URL
│
▼
Webhook Callback ───────────────────────────────────────────────────────►
│
├─ app/api/webhooks/openclaw/scan-result/route.ts
│  • Authenticated via OPENCLAW_API_KEY Bearer token
│  • Receives: creator_source_id, status, products[]
│  • Finds all workspaces watching this creator
│  • Calls ingestBatch() for each workspace
│  • Updates creator_scan_log with results
│
▼
Ingestion & Scoring ────────────────────────────────────────────────────►
│
├─ lib/opportunity-radar/ingestion.ts
│  • Deduplicates by workspace + creator + product_name
│  • Detects material changes (confidence, posted status, URLs)
│  • Computes deterministic score (0-100) via scoring.ts
│  • Creates/updates opportunity records
│
▼
Opportunities ──────────────────────────────────────────────────────────►
│
├─ Scored observations available in the Opportunities UI
│  • Operators review, action, or dismiss
│  • Actions can create content_items or experiments
│
▼
Mission Control (Scan Ops) ────────────────────────────────────────────►
│
├─ app/api/admin/opportunity-radar/scan-ops/route.ts
│  • GET: dashboard stats, due/active/failed scans, recent logs
│  • POST: run_due, force_scan, retry_failed, pause_source, resume_source
```

## OpenClaw Integration

### Client: `lib/openclaw/client.ts`

- `requestCreatorScan()` — sends scan request to OpenClaw
- Retries: 2 retries with 1s/3s delays on 5xx/429/timeout
- Timeout: 30s per request
- Rate limits: 10 requests/min, 3 concurrent
- Respects `OPENCLAW_ENABLED` gate

### Webhook: `app/api/webhooks/openclaw/scan-result/route.ts`

- OpenClaw POSTs results when a scan completes
- Auth: Bearer token matching `OPENCLAW_API_KEY`
- Payload: `{ creator_source_id, status, products[] }`
- Fan-out: ingests observations into all watching workspaces
- Idempotent: dedup prevents duplicate observations

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENCLAW_API_URL` | Yes (for scans) | Base URL for the OpenClaw agent |
| `OPENCLAW_API_KEY` | Yes (for scans) | Bearer token for OpenClaw auth (used both directions) |
| `OPENCLAW_ENABLED` | No (default: true) | Master kill switch for all OpenClaw features |

### Scan Statuses in creator_scan_log

| Status | Meaning |
|--------|---------|
| `dispatched` | Scan request sent to OpenClaw (async mode) |
| `completed` | Scan finished synchronously with products inline |
| `new_products` | Callback received with new product observations |
| `updated` | Callback received, existing observations updated |
| `no_change` | No new products found |
| `error` | Scan failed |
| `rate_limited` | Platform rate limit hit |

## Shared Scan Scheduler

The scheduler determines which creators are due for scanning and enqueues jobs.

### Key modules
- **`lib/opportunity-radar/scheduler.ts`** — `ensureCreatorSource()`, `linkWatchlistToSource()`, `recalcSourceCadence()`, `getDueScans()`, `logScanResult()`, `getSchedulerStats()`
- **`app/api/cron/radar-scan/route.ts`** — Cron endpoint with dedup guard (skips sources with active jobs)
- **`lib/jobs/handlers.ts`** — `scan_creator` handler dispatches to OpenClaw and handles both sync/async responses

### Flow
1. User adds a creator → watchlist POST calls `ensureCreatorSource()` + `linkWatchlistToSource()` + `recalcSourceCadence()`
2. Cron runs `radar-scan` → finds overdue `creator_sources` via `getDueScans()` → dedup check → enqueues `scan_creator` jobs
3. Job handler dispatches to OpenClaw via `requestCreatorScan()`
4. OpenClaw scans and calls back to `/api/webhooks/openclaw/scan-result`
5. Webhook finds watchers → `ingestBatch()` for each workspace → dedup + score + create opportunities
6. `logScanResult()` writes audit log, updates source state, schedules `next_check_at`

### Cadence resolution
- Each watcher's plan determines their entitled scan interval
- `recalcSourceCadence()` picks the fastest (minimum) interval across all active watchers
- When a watcher is removed or paused, cadence is recalculated; 0 watchers → source paused
- After 10 consecutive errors, source `monitoring_status` flips to `'error'`

## Controlled Ingestion Entrypoint

All automated observation ingestion flows through a single service layer.

### Key modules
- **`lib/opportunity-radar/ingestion.ts`** — `ingestObservation()`, `ingestBatch()`, `rescoreObservation()`
- **`app/api/admin/opportunity-radar/ingest-observations/route.ts`** — API endpoint for manual/external callers
- **`app/api/webhooks/openclaw/scan-result/route.ts`** — Webhook for OpenClaw scan results

### Dedup rules
- Match on `workspace_id + creator_id + product_name` (case-insensitive via `ilike`)
- Fallback match on `product_url` exact match if name doesn't match
- Existing match → bump `times_seen` + `last_seen_at`; if material fields changed (confidence, creator_has_posted, brand_name, URLs), also update those fields and re-score

### Change detection
- **Material changes** trigger re-scoring: `confidence`, `creator_has_posted`, `brand_name`, `product_url`, `product_image_url`
- **No material change** → only bump counters, return `action: 'no_change'`, skip score update
- **New observation** → insert + compute score + create opportunity record

### Cost safety
- Undefined incoming fields are skipped (not treated as changes)
- Scoring is deterministic and does not call AI
- Batch processing continues on per-item errors (logs + skips)

## Guardrails

### Rate Limiting (Client-Side)
- `lib/openclaw/client.ts` enforces 10 requests/min and 3 concurrent scans
- Requests exceeding limits are rejected with `ok: false` (not queued)

### Cron Dedup
- `app/api/cron/radar-scan/route.ts` checks for existing pending/running scan_creator jobs before enqueueing
- Prevents duplicate scans for the same creator_source_id

### Plan Cadence
- Scan frequency respects plan limits (Free: 1/day, Agency: 12/day)
- Shared-source dedup ensures a creator is scanned at the fastest entitled cadence, not more

### Error Circuit Breaker
- 10 consecutive errors → source flagged as `monitoring_status: 'error'`
- Error sources stop being returned by `getDueScans()` until manually resumed

## Mission Control Surface

### `GET /api/admin/opportunity-radar/scan-ops`
Returns:
- Scheduler stats (total/active/due sources, scans today, errors today)
- Due sources list
- Active (pending/running) scan jobs
- Failed scan jobs (last 24h)
- Error-state sources
- Recent scan logs (last 50)

### `POST /api/admin/opportunity-radar/scan-ops`
Actions:
- `run_due` — enqueue all due scans immediately
- `force_scan` — force-scan a specific creator source (bypasses cadence)
- `retry_failed` — re-enqueue all failed scans from last 24h
- `pause_source` — pause monitoring for a creator source
- `resume_source` — resume a paused/error source and reset next_check_at

## What Is Intentionally Deferred

- Real-time webhook notifications for new opportunities
- Cross-workspace opportunity dedup (same product seen by multiple workspaces)
- AI-powered product matching (fuzzy matching product names to catalog)
- Historical trend analysis on observation frequency
- Automated priority escalation based on opportunity velocity
