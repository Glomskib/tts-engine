# Worker Fleet Scripts

Local worker infrastructure for running cron jobs and background tasks across multiple terminals without conflicts.

## Files

| Script | Purpose |
|--------|---------|
| `with-lock.sh` | Atomic mkdir-based lock wrapper. Prevents duplicate workers. |
| `heartbeat.sh` | Prints a single-line ISO heartbeat for logging. |
| `run-endpoint.ts` | Calls a local API endpoint with CRON_SECRET auth. |

## Usage

### Run an endpoint once
```bash
npx tsx scripts/workers/run-endpoint.ts /api/cron/orchestrator
```

### Run with lock (prevents duplicates)
```bash
./scripts/workers/with-lock.sh orchestrator \
  npx tsx scripts/workers/run-endpoint.ts /api/cron/orchestrator
```

### Worker loop pattern (used by terminals)
```bash
./scripts/workers/with-lock.sh my-worker bash -c '
  while true; do
    npx tsx scripts/workers/run-endpoint.ts /api/cron/my-endpoint \
      >> logs/workers/my-worker.log 2>&1
    ./scripts/workers/heartbeat.sh my-worker
    sleep 120
  done
'
```

## Directories

| Path | Purpose |
|------|---------|
| `logs/workers/` | Worker log output (gitignored) |
| `.runtime/locks/` | Lock dirs created at runtime (gitignored) |

## Ground Rules

- One lock per worker name — second attempt exits cleanly
- Logs go to `logs/workers/*.log`
- Heartbeat prints every 60s to stdout
- Env loaded from `.env.local`
- Never commit/push from worker terminals
