# FlashFlow AI — Launch Readiness

**Last updated:** 2026-02-25

Single source of truth for "can we ship?" Run the companion contract-check script to verify programmatically:

```bash
npx tsx scripts/contract-check.ts
```

---

## 1. Required Environment Variables

All variables are **server-only** unless marked `NEXT_PUBLIC_*`.
Values must be set in the **Vercel project dashboard** (or `.env.local` for dev).

### Supabase (database + auth)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Project URL (public, safe for client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Anon key (public, RLS-gated) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Bypasses RLS — treat as secret |

### AI Services

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Claude — primary AI engine |
| `REPLICATE_API_TOKEN` | **Yes** | Flux/SDXL image generation |
| `OPENAI_API_KEY` | No | GPT fallback (optional) |
| `ELEVENLABS_API_KEY` | No | TTS (optional) |
| `HEYGEN_API_KEY` | **Yes** | Avatar video generation |

### Stripe (payments)

| Variable | Required | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | **Yes** | `sk_live_...` for production |
| `STRIPE_WEBHOOK_SECRET` | **Yes** | `whsec_...` from webhook endpoint config |
| `STRIPE_PRICE_STARTER_MONTHLY` | **Yes** | Price ID for Starter monthly ($29) |
| `STRIPE_PRICE_STARTER_YEARLY` | **Yes** | Price ID for Starter yearly ($278) |
| `STRIPE_PRICE_PRO_MONTHLY` | **Yes** | Price ID for Pro monthly ($79) |
| `STRIPE_PRICE_PRO_YEARLY` | **Yes** | Price ID for Pro yearly ($758) |
| `STRIPE_PRICE_TEAM_MONTHLY` | **Yes** | Price ID for Team monthly ($199) |
| `STRIPE_PRICE_TEAM_YEARLY` | **Yes** | Price ID for Team yearly ($1,910) |

### Telegram (alerts)

| Variable | Required | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | **Yes** | Bolt bot token |
| `TELEGRAM_CHAT_ID` | **Yes** | Main notification channel |
| `TELEGRAM_LOG_CHAT_ID` | No | Cron/log channel (separate from alerts) |

### Mission Control

| Variable | Required | Notes |
|---|---|---|
| `MISSION_CONTROL_TOKEN` | **Yes** | Canonical token (same value on MC + tts-engine Vercel) |
| `MISSION_CONTROL_AGENT_TOKEN` | No | Agent-only fallback |

### Application

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | **Yes** | Canonical URL (`https://app.flashflow.ai`) |
| `ADMIN_USERS` | **Yes** | Comma-separated admin emails/UUIDs |
| `ADMIN_UI_ENABLED` | **Yes** | Set `true` for production admin panel |
| `INTERNAL_SERVICE_TOKEN` | **Yes** | Internal service-to-service auth |
| `CRON_SECRET` | **Yes** | Cron job authentication |

### Email (optional)

| Variable | Required | Notes |
|---|---|---|
| `SENDGRID_API_KEY` | No | Transactional email |
| `EMAIL_FROM` | No | Sender address (default: `no-reply@tts-engine.local`) |
| `EMAIL_ENABLED` | No | `true`/`false` toggle |

### Slack (optional)

| Variable | Required | Notes |
|---|---|---|
| `SLACK_WEBHOOK_URL` | No | Incoming webhook URL |
| `SLACK_ENABLED` | No | `true`/`false` toggle |

### Video Pipeline Defaults (optional)

| Variable | Required | Notes |
|---|---|---|
| `DEFAULT_RECORDER_USER_ID` | No | Auto-assign recorder |
| `DEFAULT_EDITOR_USER_ID` | No | Auto-assign editor |
| `DEFAULT_UPLOADER_USER_ID` | No | Auto-assign uploader |
| `SERVICE_USER_ID` | No | Default service user |

---

## 2. Key Rotation Playbook

### Supabase keys

1. Rotate in Supabase Dashboard → Settings → API → "Regenerate" the target key.
2. Copy the new value to Vercel env vars (both Preview + Production).
3. Redeploy: `vercel --prod` or push to main.
4. Verify: `npx tsx scripts/contract-check.ts` — Supabase ping should pass.

### Stripe keys

1. Roll the secret key in Stripe Dashboard → Developers → API Keys → "Roll key".
   Stripe gives a 72-hour grace period where both old and new keys work.
2. Update `STRIPE_SECRET_KEY` in Vercel.
3. For webhook secret: Stripe Dashboard → Webhooks → endpoint → "Reveal" → copy new `whsec_...`.
4. Update `STRIPE_WEBHOOK_SECRET` in Vercel → redeploy.
5. Verify: contract-check pings Stripe `/v1/balance` (expect 200).

### Anthropic / OpenAI / Replicate / HeyGen

1. Generate a new key in the respective dashboard.
2. Update Vercel env var → redeploy.
3. The old key continues to work until explicitly revoked on the provider side.
4. Verify via contract-check or admin health endpoint (`/api/admin/health`).

### Telegram bot token

1. Talk to @BotFather → `/revoke` → get new token.
2. Update `TELEGRAM_BOT_TOKEN` in Vercel → redeploy.
3. Run `npx tsx scripts/telegram-webhook.ts assert-deleted` to confirm no webhook is set (critical — webhook mode disables OpenClaw polling).
4. Verify: contract-check pings `getMe` endpoint.

### Mission Control token

1. Generate a new random token (e.g., `openssl rand -hex 32`).
2. Update `MISSION_CONTROL_TOKEN` in **both** Vercel projects (tts-engine AND mission-control).
3. Redeploy **both** services.
4. Watchdog (`~/ops/watchdog/openclaw_watchdog.sh`) runs every 2 min and will detect drift.
5. Verify: contract-check pings MC `/api/auth-check`.

---

## 3. Stripe Setup (Reference)

Full guide: [`docs/STRIPE_SETUP.md`](./STRIPE_SETUP.md)

**Quick summary:**

| Plan | Monthly | Annual (20% off) | Credits/mo |
|---|---|---|---|
| Starter | $29 | $278 | 100 |
| Pro | $79 | $758 | 500 |
| Team | $199 | $1,910 | 2,000 |

**Webhook endpoint:** `https://app.flashflow.ai/api/webhooks/stripe`

**Required events:**
- `checkout.session.completed`
- `customer.subscription.created` / `updated` / `deleted`
- `invoice.paid` / `invoice.payment_failed`
- `charge.refunded`
- `charge.dispute.created`
- `customer.subscription.trial_will_end`
- `account.updated` (Connect)
- `customer.deleted`

**Credit allocation:** happens on `invoice.paid` — credits reset each billing cycle.

**Database tables:** `user_subscriptions`, `user_credits`, `credit_transactions`, `subscription_plans`.

---

## 4. Supabase Migration Drift Detection

### How migrations are managed

- Migration SQL files live in `/web/migrations/` (numbered `001_*` through `046_*`).
- Subscription/credit tables are in `/web/001_subscriptions_and_credits.sql` (applied manually via Supabase SQL editor).
- Full schema reference: [`docs/DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md)

### Detecting drift

**Option A — contract-check script** (automated):
The contract-check script probes critical tables by running a `SELECT ... LIMIT 0` against each. If a table is missing, the check fails with `42P01`.

**Option B — manual column probe:**
```sql
-- Run in Supabase SQL editor to check for a specific column
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'edit_jobs'
ORDER BY ordinal_position;
```

**Option C — diffing against schema doc:**
Compare the tables listed in `DATABASE_SCHEMA.md` against what exists:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

### Critical tables that must exist

Core: `products`, `videos`, `concepts`, `saved_skits`, `skit_ratings`
Audience: `audience_personas`, `pain_points`
Hooks: `proven_hooks`, `hook_suggestions`, `script_library`, `reference_videos`
Billing: `subscription_plans`, `user_subscriptions`, `user_credits`, `credit_transactions`
Workflow: `video_events`, `notifications`, `audit_log`, `user_roles`, `user_profiles`
Marketplace: `edit_jobs`, `mp_scripts`, `mp_profiles`, `clients`, `client_plans`, `client_memberships`, `va_profiles`, `plan_usage_daily`

---

## 5. Admin Endpoints Reference

All admin routes live under `/api/admin/` and require the caller to be in `ADMIN_USERS`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/admin/enabled` | GET | Check if admin UI is on |
| `/api/admin/health` | GET | External service health checks (Supabase, Replicate, OpenAI, ElevenLabs) |
| `/api/admin/system-status` | GET | System status overview |
| `/api/admin/users/` | GET/POST | User management |
| `/api/admin/clients/` | GET/POST | Client management |
| `/api/admin/products/` | GET/POST | Product CRUD |
| `/api/admin/brands/` | GET/POST | Brand CRUD |
| `/api/admin/videos/[id]/*` | Various | Video ops (set-project, post, winner, review, force-status, timeline, re-render, bulk ops) |
| `/api/admin/editors/` | GET/POST | Editor management |
| `/api/admin/assignments/` | GET/POST | Task assignments |
| `/api/admin/hook-suggestions/` | GET/PATCH | Hook approval queue |
| `/api/admin/client-orgs/` | GET/POST | Organization management |
| `/api/admin/client-orgs/[id]/billing/` | GET/POST | Org billing |
| `/api/admin/analytics/` | GET | Analytics & reporting |
| `/api/admin/performance/` | GET | Performance metrics |
| `/api/admin/integrations/test` | POST | Integration smoke test |
| `/api/admin/deploy/` | POST | Trigger Vercel deploy |
| `/api/admin/export/` | GET | Data export |
| `/api/admin/command-center/` | Various | CC integration |
| `/api/admin/hook-bank/import` | POST | Import hooks from MC |

---

## 6. Incident Playbooks

### Playbook A: "Stripe webhook not syncing plan"

**Symptoms:** User upgrades but plan/credits don't update. `user_subscriptions` still shows `free`.

**Diagnosis:**
1. Check Stripe Dashboard → Webhooks → endpoint → "Attempted events" for failures.
2. Look for `invoice.paid` or `checkout.session.completed` events — are they marked ✓ or ✗?
3. Check Vercel function logs for `/api/webhooks/stripe` errors.
4. Verify `STRIPE_WEBHOOK_SECRET` matches the endpoint's signing secret (rotation issue?).

**Fix:**
- If webhook secret mismatch: update `STRIPE_WEBHOOK_SECRET` in Vercel → redeploy.
- If events are failing with 500: check Vercel logs for the root cause (likely a DB or schema issue).
- If events aren't arriving: verify endpoint URL is `https://app.flashflow.ai/api/webhooks/stripe` and events list includes `invoice.paid`.
- **Manual recovery:** Use Stripe CLI to replay events:
  ```bash
  stripe events resend evt_xxx --webhook-endpoint we_xxx
  ```
- Or manually update the database:
  ```sql
  UPDATE user_subscriptions SET plan_id = 'pro', status = 'active' WHERE user_id = '<uuid>';
  UPDATE user_credits SET credits_remaining = 500 WHERE user_id = '<uuid>';
  ```

### Playbook B: "VA can't claim job"

**Symptoms:** Virtual assistant gets 401/403 when trying to claim an `edit_jobs` row.

**Diagnosis:**
1. Check if `VA_ACCESS_TOKEN` is set in Vercel env vars.
2. Check if the VA's user ID exists in Supabase `auth.users`.
3. Check if the VA has a row in `va_profiles` with `status = 'active'`.
4. Check `edit_jobs` RLS policies — the VA must match the `claimed_by` or assignment conditions.
5. Check if the job is already claimed (`claimed_by IS NOT NULL`).

**Fix:**
- If token missing: add `VA_ACCESS_TOKEN` to Vercel → redeploy.
- If VA profile missing: insert into `va_profiles`.
- If job already claimed: release it first via admin or wait for claim expiry.
- If RLS blocking: check that the VA's UUID is correctly referenced in the policy.

### Playbook C: "Usage/credits wrong"

**Symptoms:** User shows incorrect credit balance, or credits don't deduct/reset properly.

**Diagnosis:**
1. Check `user_credits` for the user:
   ```sql
   SELECT * FROM user_credits WHERE user_id = '<uuid>';
   ```
2. Check `credit_transactions` for recent activity:
   ```sql
   SELECT * FROM credit_transactions WHERE user_id = '<uuid>' ORDER BY created_at DESC LIMIT 20;
   ```
3. Check if `invoice.paid` webhook fired (should trigger `reset_monthly_credits`).
4. Check `user_subscriptions` — is the plan correct? Is `current_period_end` in the future?

**Fix:**
- If credits didn't reset on renewal: check that `invoice.paid` handler calls credit reset. Manually reset:
  ```sql
  SELECT reset_monthly_credits('<uuid>');
  ```
- If over-deducted: add a correction transaction:
  ```sql
  SELECT add_credits('<uuid>', <amount>, 'bonus', 'Manual correction — incident #xxx');
  ```
- If subscription shows wrong plan: check Stripe customer portal for the actual subscription state and reconcile:
  ```sql
  UPDATE user_subscriptions SET plan_id = '<correct_plan>', status = 'active' WHERE user_id = '<uuid>';
  ```

### Playbook D: "Mission Control auth failing"

**Symptoms:** Telegram alerts with "MC Client 401". Documents not posting to MC.

**Diagnosis:**
1. Run `/debug` in Telegram → shows which env vars are present and last auth-check status.
2. Check if `MISSION_CONTROL_TOKEN` is set on **both** tts-engine and mission-control Vercel projects.
3. Check if the values match (token drift).

**Fix:**
- If values don't match: pick one canonical value, set it on both projects, redeploy both.
- The watchdog (`~/ops/watchdog/openclaw_watchdog.sh`) runs every 2 min and detects drift automatically.
- The MC client has self-healing: on 401 it probes `/api/auth-check`, retries once, and alerts if still failing.
- If persistent: `openssl rand -hex 32` → set on both projects → redeploy both.

### Playbook E: "Telegram notifications not sending"

**Symptoms:** No alerts arriving in the Telegram channel.

**Diagnosis:**
1. Run `npx tsx scripts/check-telegram-health.ts`.
2. Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set.
3. Run `npx tsx scripts/telegram-webhook.ts assert-deleted` — if a webhook is set, OpenClaw polling is broken.
4. Check Vercel logs for Telegram send errors.

**Fix:**
- If webhook accidentally set: `npx tsx scripts/telegram-webhook.ts delete` to remove it.
- If bot token revoked: get new token from @BotFather → update Vercel → redeploy.
- If chat ID wrong: send a test message to the bot, use `getUpdates` API to find the correct chat ID.

---

## 7. Pre-Launch Smoke Test

After deploying to production, verify these manually:

- [ ] Landing page loads at `NEXT_PUBLIC_APP_URL`
- [ ] Login / signup flow works (Supabase auth)
- [ ] New user receives 5 free credits
- [ ] Script generation works (deducts 1 credit)
- [ ] Admin panel accessible for users in `ADMIN_USERS`
- [ ] Stripe checkout → subscription → credits allocated
- [ ] Telegram alert fires on a test event
- [ ] `npx tsx scripts/contract-check.ts` exits 0

---

## 8. Rollback

| Problem | Action |
|---|---|
| Bad deploy | `vercel rollback` (instant, previous deployment restored) |
| Database issue | Supabase point-in-time recovery (Dashboard → Backups) |
| Stripe issue | Pause webhook endpoint in Stripe Dashboard; refund via dashboard |
| Compromised key | Rotate immediately per Section 2 above |

---

*This document is a living reference. Keep it current as integrations change.*
