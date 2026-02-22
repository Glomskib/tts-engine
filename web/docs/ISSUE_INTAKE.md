# Issue Intake + Triage

Automated issue reporting and AI-powered triage for FlashFlow.

## Telegram Integration

**NEVER enable Telegram webhook on Bolt bot token.
Webhook mode disables OpenClaw polling and breaks Bolt.**

The Telegram webhook and OpenClaw/Bolt polling are **mutually exclusive**.
When the webhook is registered, Bolt cannot receive Telegram messages — all messages
go directly to the issue intake handler instead.

**Current state:** Webhook is **DELETED** — Bolt handles Telegram normally.

### Webhook management script

```bash
# Check current status
npx tsx scripts/telegram-webhook.ts info

# Verify no webhook is set (exit 0 = safe, exit 1 = webhook active)
npx tsx scripts/telegram-webhook.ts assert-deleted

# Enable issue intake (DISABLES Bolt — requires explicit flag)
npx tsx scripts/telegram-webhook.ts set --i-know-this-disables-bolt

# Restore Bolt
npx tsx scripts/telegram-webhook.ts delete
```

When the webhook is active, the handler at `/api/webhooks/telegram` uses intent detection:
- `/log`, `/issue`, `/bug` commands → create issue immediately
- Messages with bug/error keywords → asks "Do you want me to log this?" confirmation
- Normal messages → ignored (no response)

## Tables

### `ff_issue_reports`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| source | text | `telegram`, `slack`, `email`, `api`, `manual` |
| reporter | text | Email or handle of reporter |
| message_text | text | Raw issue description |
| context_json | jsonb | Arbitrary context (URL, stack trace, etc.) |
| severity | text | `unknown` → `low` / `medium` / `high` / `critical` |
| status | text | `new` → `triaged` → `in_progress` → `resolved` / `dismissed` |
| fingerprint | text | SHA-256 dedupe key (unique index) |

### `ff_issue_actions`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| issue_id | uuid | FK → ff_issue_reports |
| action_type | text | `intake`, `triage`, `assign`, `resolve`, `dismiss` |
| payload_json | jsonb | Action-specific data |

## API Endpoints

### `POST /api/flashflow/issues/intake`
**Auth: None** — open for Telegram bot, Slack webhooks, etc.

**Body:**
```json
{
  "source": "telegram",
  "reporter": "user@example.com",
  "message_text": "Videos are failing to generate",
  "context_json": { "video_id": "abc-123" }
}
```

**Response (new issue — 201):**
```json
{
  "ok": true,
  "deduplicated": false,
  "issue": { "id": "...", "fingerprint": "...", "status": "new", ... },
  "correlation_id": "vid_..."
}
```

**Response (duplicate — 200):**
```json
{
  "ok": true,
  "deduplicated": true,
  "issue": { "id": "...", ... },
  "correlation_id": "vid_..."
}
```

Deduplication uses SHA-256 of `source | lowercase(message_text)`.

### `POST /api/flashflow/issues/triage/run`
**Auth: Admin only** (session cookie, JWT, or `ff_ak_*` API key)

No body required. Pulls all `status=new` issues (up to 20), then for each:

1. Calls Claude Haiku to classify severity, subsystem, and generate fix steps + Claude Code prompt
2. Updates issue `status=triaged` and `severity`
3. Logs `triage` action with full classification payload
4. Posts to Mission Control for **high/critical** issues only

**Response:**
```json
{
  "ok": true,
  "triaged": 3,
  "total_new": 3,
  "results": [
    { "issue_id": "...", "severity": "high", "subsystem": "video-pipeline" }
  ],
  "correlation_id": "vid_..."
}
```

## DB Helpers

`lib/flashflow/issues.ts` exports:
- `computeFingerprint(source, messageText, path?)` — SHA-256 dedupe key
- `findByFingerprint(fingerprint)` — lookup existing issue
- `createIssue(input)` — insert new issue
- `logIssueAction(issueId, actionType, payload?)` — log action
- `updateIssue(id, fields)` — update severity/status

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes (triage) | Anthropic API key for LLM triage |
| `MC_BASE_URL` | No | Mission Control URL (default: `http://127.0.0.1:3100`) |
| `MC_API_TOKEN` | No | Mission Control bearer token |

## Smoke Test

```bash
npx tsx scripts/issues/smoke.ts
npx tsx scripts/issues/smoke.ts --base http://localhost:3000
```

Requires `SMOKE_TEST_TOKEN` (admin JWT or `ff_ak_*` key) for triage step.

## Migration

```bash
supabase db push
```

Migration file: `supabase/migrations/20260302100000_ff_issue_reports.sql`

## Runbook: Safe Telegram Issue Intake Setup

### Option A: Separate bot token (recommended)

Use a **dedicated bot** for issue intake so Bolt keeps working normally.

1. Create a new bot via `@BotFather` (e.g. `@FlashFlowIssueBot`)
2. Set the new token as `TELEGRAM_ISSUE_BOT_TOKEN` in `.env.local`
3. Register the webhook on the **new** bot only:
   ```bash
   TELEGRAM_BOT_TOKEN=$TELEGRAM_ISSUE_BOT_TOKEN \
     npx tsx scripts/telegram-webhook.ts set --i-know-this-disables-bolt
   ```
4. Bolt continues polling on the main bot token — no disruption
5. Users report issues by messaging `@FlashFlowIssueBot` directly

### Option B: Shared bot token (not recommended)

This hijacks the main Bolt bot. Only use if you explicitly want issue-intake-only mode.

1. Understand that **Bolt will stop receiving all Telegram messages**
2. Run: `npx tsx scripts/telegram-webhook.ts set --i-know-this-disables-bolt`
3. Verify: `npx tsx scripts/telegram-webhook.ts info` — should show webhook active
4. To restore Bolt: `npx tsx scripts/telegram-webhook.ts delete`

### Monitoring

Add this to CI or a cron job to catch accidental webhook registration:

```bash
npx tsx scripts/telegram-webhook.ts assert-deleted
```

Exit code 0 = safe (no webhook, Bolt is polling). Exit code 1 = webhook is set, Bolt is dead.

### Intent classifier tests

```bash
npx tsx scripts/tests/telegram-intent.test.ts
```

Tests cover: normal messages, keyword triggers, explicit commands, confirmation flow, and edge cases.
