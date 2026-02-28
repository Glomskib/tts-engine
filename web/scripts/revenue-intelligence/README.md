# Revenue Intelligence — Scripts

## Quick Reference

| Command | Description |
|---|---|
| `pnpm run ri:ingest` | Live scrape + full AI pipeline |
| `pnpm run ri:ingest:sim` | Simulation mode (mock data, no browser) |
| `pnpm run ri:ingest:dry` | Dry run (scrape but no DB writes) |
| `pnpm run ri:bootstrap -- --username <handle>` | Open browser to log into TikTok |
| `pnpm run ri:smoke` | Full smoke test (DB + AI) |
| `pnpm run ri:smoke:db-only` | DB-only smoke test (skip AI) |
| `pnpm run ri:purge:sim -- --yes-really` | Delete all simulation data |
| `pnpm run ri:verify` | Show 10 most recent live comments |

## Environment Flags

| Variable | Default | Description |
|---|---|---|
| `RI_DEBUG` | `0` | Set to `1` for verbose debug logging (video URLs, comment IDs, texts, scroll rounds) |
| `RI_RECENT_SWEEP` | `0` | Set to `1` to enable a second extraction pass per video to catch just-posted comments |
| `RI_SMOKE_USER_ID` | — | User UUID for smoke tests |

### Example: debug + recent sweep

```bash
RI_DEBUG=1 RI_RECENT_SWEEP=1 pnpm run ri:ingest
```

## Simulation Filtering

Simulation data uses `platform_comment_id` and `platform_video_id` prefixed with `sim_`.

- **Inbox queries** (`getInboxComments`, `getInboxStats`) exclude simulation rows by default.
- Pass `includeSimulation: true` to include them.
- The centralized predicate lives in `lib/revenue-intelligence/simulation-filter.ts`.
- Use `isSimulationComment(id)` or `isSimulationVideo(id)` for in-code checks.
- The Supabase pattern `SIM_COMMENT_PATTERN` (`sim\_%`) is used in `.not()` filters.

## Purge Simulation Data

```bash
pnpm run ri:purge:sim -- --yes-really
```

Deletes in FK-safe order:
1. `ri_reply_drafts` (for sim comment IDs)
2. `ri_comment_analysis` (for sim comment IDs)
3. `ri_comment_status` (for sim comment IDs)
4. `ri_comments` (where `platform_comment_id LIKE 'sim_%'`)
5. `ri_videos` (where `platform_video_id LIKE 'sim_%'` and no live comments reference them)

Prints row counts before and after. Requires `--yes-really` flag.

## Verify Latest Comments

```bash
pnpm run ri:verify
pnpm run ri:verify -- --limit 20
```

Shows the N most recently ingested **live** comments (excludes sim_*) with:
- Ingestion timestamp
- Commenter username
- Platform comment ID
- First 120 chars of text
- Video platform ID
- Processed status

## Pipeline Flow

```
ri:bootstrap  →  ri:ingest  →  classify  →  draft  →  urgency  →  Telegram alert
                     ↑
              ri:ingest:sim (testing)
```

Each `ri:ingest` run:
1. Scrapes the 5 most recent videos from each creator account
2. Extracts up to 100 comments per video (tries to sort by Newest)
3. Upserts into `ri_comments` with dedup on `platform_comment_id`
4. Classifies new comments via Claude Haiku
5. Generates 3 reply drafts per comment (neutral, friendly, conversion)
6. Flags urgent comments and sends Telegram alerts
