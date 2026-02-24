# Editing Marketplace — Setup Guide

## Prerequisites

- Node.js 20+
- FlashFlow repo cloned
- `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Migration `20260324300000_editing_marketplace.sql` applied (already done)

## Bootstrap a Client

```bash
cd /Volumes/WorkSSD/01_ACTIVE/FlashFlow/web

# The user must have already signed up via the FlashFlow auth flow
BOOTSTRAP_EMAIL=you@example.com CLIENT_NAME="My Company" npx tsx scripts/mp-bootstrap.ts
```

This creates:
- `mp_profiles` row (role: client_owner)
- `clients` row with a unique client_code (e.g., C-4821)
- `client_memberships` linking user to client
- `client_plans` with pool_15 defaults (15/day cap, 48h SLA)

Custom plan:
```bash
BOOTSTRAP_EMAIL=you@example.com PLAN_TIER=dedicated_30 DAILY_CAP=30 SLA_HOURS=24 npx tsx scripts/mp-bootstrap.ts
```

## Bootstrap a VA Editor

```bash
MODE=va VA_EMAIL=editor@example.com LANGUAGES=en,tl npx tsx scripts/mp-bootstrap.ts
```

## Run Development Server

```bash
npm run dev
```

- Client portal: http://localhost:3000/app/pipeline
- VA portal: http://localhost:3000/va/jobs
- Metrics: http://localhost:3000/app/metrics

## RLS Smoke Tests

```bash
npx tsx scripts/mp-rls-smoke.ts
```

Creates temporary test users, validates RLS policies, then cleans up.

## Trigger B-roll Scout

```bash
# Replace SCRIPT_ID with actual UUID
curl -X POST http://localhost:3000/api/internal/broll/run \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"scriptId": "SCRIPT_ID"}'
```

Or click "Generate B-roll Pack" on the script detail page (client portal).

## B-roll Cache Sync (Archive5TB)

```bash
npx tsx scripts/broll-cache-sync.ts
# Or dry run:
DRY_RUN=1 npx tsx scripts/broll-cache-sync.ts
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/marketplace/scripts` | Session | List pipeline (client's scripts) |
| POST | `/api/marketplace/scripts` | Session | Create new script |
| GET | `/api/marketplace/scripts/[id]` | Session | Script detail + assets + job_id + broll_pack (signed URLs) |
| PATCH | `/api/marketplace/scripts/[id]` | Session | Update fields or trigger actions |
| POST | `/api/marketplace/scripts/[id]/broll` | Session | Generate b-roll pack for script |
| GET | `/api/marketplace/jobs` | Session | VA job board |
| GET | `/api/marketplace/jobs/[id]` | Session | Job detail (full editor packet) |
| PATCH | `/api/marketplace/jobs/[id]` | Session | Job actions (claim, start, submit, approve, etc.) |
| GET | `/api/marketplace/metrics` | Session | Client metrics dashboard data |
| POST | `/api/internal/broll/run` | Service key | Internal b-roll scout runner |

## Metrics

The metrics endpoint returns time breakdowns:
- **avg_turnaround_7d/30d**: Total time from job creation to approval
- **avg_queue_wait_hours**: Time waiting in queue before an editor claims
- **avg_edit_time_hours**: Time from editor start to submission
- **avg_review_time_hours**: Time from submission to client approval
- **oldest_in_queue_hours**: How long the oldest queued job has been waiting
- **on_time_rate_7d/30d**: Percentage of jobs approved before SLA deadline

## Known Limitations

- **AI/Stock providers are stubs**: No actual video generation or stock footage fetching yet. The runner creates reference placeholders.
- **No automated polling**: B-roll scout must be triggered manually or via API call.
- **No client admin UI**: Client and VA provisioning is via CLI scripts only.
- **Drive link validation is lightweight**: Only basic URL format check, no Google Drive API integration.
