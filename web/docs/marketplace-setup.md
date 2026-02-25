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

## VA Portal

The VA portal lives at `/va/jobs`. Features:

- **Job Board** (`/va/jobs`): Filterable list of active jobs with status tabs (All / Queued / My Jobs), title search, and columns for raw footage, b-roll, and revision count. Due-soon jobs highlight amber (< 6h) and overdue jobs highlight red.
- **Job Detail** (`/va/jobs/[id]`): Full editor packet with copy-script button, raw footage links, signed b-roll URLs with copy-link, deliverable submission with label and type (main/variant), feedback thread, and collapsible activity log.
- **State machine**: Jobs follow `queued → claimed → in_progress → submitted → approved → posted`. The "Start" action also works from `changes_requested` status so VAs can go straight to revisions.
- **Role enforcement**: VA actions (claim, start, submit, add_feedback) require `va_editor` or `admin` role. Client actions (approve, request_changes, mark_posted) require `client_owner`, `client_member`, or `admin`.
- **No client name leak**: VAs see `client_code` only. The `clients.name` field is never exposed in VA-facing responses.

## Smoke Tests

### RLS Smoke Tests

```bash
npx tsx scripts/mp-rls-smoke.ts
```

Creates temporary test users, validates RLS policies, then cleans up.

### VA Smoke Tests

```bash
npx tsx scripts/mp-va-smoke.ts
```

Tests the VA workflow: list jobs, claim, start, submit. Verifies no client name leaks in any response. Creates temporary data and cleans up.

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
| GET | `/api/marketplace/jobs` | VA/Admin | VA job board (params: `sort`, `status`, `search`) |
| GET | `/api/marketplace/jobs/[id]` | Session | Job detail (full editor packet, signed broll URLs, events) |
| PATCH | `/api/marketplace/jobs/[id]` | Session | Job actions — role-gated (claim, start, submit, approve, etc.) |
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

## Stripe Setup

Three marketplace tiers are configured as Stripe Products with monthly recurring Prices.

### Products & Prices (Live)

| Tier | Plan Key | Price/mo | Daily Cap | SLA | Priority | Stripe Product | Stripe Price |
|------|----------|----------|-----------|-----|----------|----------------|--------------|
| Pool | `pool_15` | $1,499 | 15 | 48h | 1 | `prod_U2eJH0yRk551Od` | `price_1T4Z0OKXraIWnC5DBQLeS7XV` |
| Dedicated | `dedicated_30` | $2,499 | 30 | 24h | 2 | `prod_U2eJWMN722kMvt` | `price_1T4Z0UKXraIWnC5DjeIImEui` |
| Scale | `scale_50` | $3,999 | 50 | 24h | 3 | `prod_U2eJtJG7j7x9Wr` | `price_1T4Z0aKXraIWnC5DibrKFyqU` |

### Environment Variables

Set these in `.env.local` (local dev) and **Vercel** (production):

```
STRIPE_PRICE_MP_POOL=price_1T4Z0OKXraIWnC5DBQLeS7XV
STRIPE_PRICE_MP_DEDICATED=price_1T4Z0UKXraIWnC5DjeIImEui
STRIPE_PRICE_MP_SCALE=price_1T4Z0aKXraIWnC5DibrKFyqU
```

**Where to paste in Vercel:** Settings > Environment Variables > add each key/value pair for Production (and optionally Preview).

### Verification

```bash
npx tsx scripts/verify-mp-stripe-mapping.ts
```

Expected output — all three tiers show `OK`:
```
OK       pool_15        env=STRIPE_PRICE_MP_POOL           id=price_1T4Z...
OK       dedicated_30   env=STRIPE_PRICE_MP_DEDICATED      id=price_1T4Z...
OK       scale_50       env=STRIPE_PRICE_MP_SCALE          id=price_1T4Z...
SKIP     custom         env=(none)
```

### How Stripe → DB Sync Works

1. When creating a Stripe Checkout or Subscription for a marketplace client, include `mp_client_id` in the subscription metadata.
2. On `customer.subscription.created/updated`, the webhook reads the price ID, maps it to a tier via `mpTierFromStripePriceId()`, and upserts `client_plans` with the correct `daily_cap`, `sla_hours`, `priority_weight`, and `status`.
3. On `customer.subscription.deleted`, the webhook marks the client plan as `canceled`.
4. Idempotency is enforced via the `stripe_webhook_events` table — duplicate event IDs are skipped.

### Source of Truth

| What | Where |
|------|-------|
| Plan config (caps, SLA, weights, Stripe IDs) | `lib/marketplace/plan-config.ts` |
| Per-client entitlements (synced from Stripe) | `client_plans` table |
| Webhook handler | `app/api/webhooks/stripe/route.ts` |
| Plan sync module | `lib/marketplace/plan-sync.ts` |
| Usage helper | `lib/marketplace/usage.ts` |
| Admin ops dashboard | `GET /api/admin/marketplace/ops` |

## Known Limitations

- **AI/Stock providers are stubs**: No actual video generation or stock footage fetching yet. The runner creates reference placeholders.
- **No automated polling**: B-roll scout must be triggered manually or via API call.
- **No client admin UI**: Client and VA provisioning is via CLI scripts only.
- **Drive link validation is lightweight**: Only basic URL format check, no Google Drive API integration.
