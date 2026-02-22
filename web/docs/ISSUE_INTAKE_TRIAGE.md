# Issue Intake + Triage

Automated issue reporting and AI-powered triage for FlashFlow.

## Tables

### `ff_issue_reports`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| source | text | `slack`, `email`, `api`, `manual` |
| reporter | text | Email or handle of reporter |
| message_text | text | Raw issue description |
| context_json | jsonb | Arbitrary context (URL, stack trace, etc.) |
| severity | text | `unknown` → `low` / `medium` / `high` / `critical` |
| status | text | `new` → `triaged` → `in_progress` → `resolved` / `dismissed` |
| fingerprint | text | SHA-256 dedupe key (unique) |

### `ff_issue_actions`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| issue_id | uuid | FK → ff_issue_reports |
| action_type | text | `intake`, `triage`, `assign`, `resolve`, `dismiss` |
| payload_json | jsonb | Action-specific data |

## API

### `POST /api/flashflow/issues/intake`
Auth: `Authorization: Bearer <FF_ISSUES_SECRET>`

**Body:**
```json
{
  "source": "slack",
  "reporter": "user@example.com",
  "message_text": "Videos are failing to generate",
  "context": { "video_id": "abc-123" },
  "severity": "high"
}
```

- Deduplicates by fingerprint (SHA-256 of `source::message_text`)
- Creates `intake` action on the issue

### `POST /api/flashflow/issues/triage/run`
Auth: `Authorization: Bearer <FF_ISSUES_SECRET>`

No body required. Pulls all `status=new` issues (up to 20), then for each:

1. Calls Claude Haiku to classify severity, subsystem, and generate a fix prompt
2. Updates issue `status=triaged` and `severity`
3. Logs `triage` action with full classification
4. Posts to Mission Control lane "FlashFlow" tagged "issues" (if MC configured)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FF_ISSUES_SECRET` | Yes | Shared secret for intake/triage API auth |
| `MC_BASE_URL` | No | Mission Control URL (default: `https://mc.flashflowai.com`) |
| `MC_API_TOKEN` | No | Mission Control bearer token |

## Smoke Test

```bash
npx tsx scripts/issues/smoke.ts
npx tsx scripts/issues/smoke.ts --base http://localhost:3000
```

Creates a test issue, verifies dedupe, runs triage, and checks auth guard.
Requires `FF_ISSUES_SECRET` in `.env.local`.

## Migration

```bash
supabase db push
```

Migration file: `supabase/migrations/20260302100000_ff_issue_reports.sql`
