# FlashFlow — Production Launch Readiness Checklist

**Created:** 2026-03-09
**Context:** Post-stabilization sprint, pre-production rollout
**Companion scripts:** `npx tsx scripts/contract-check.ts`, `pnpm tsc --noEmit`

---

## MUST DO BEFORE LAUNCH

### 1. Security — P0 Audit Fixes (Still Open)

These are the unfixed P0 findings from the 2026-03-05 backend audit. They represent real attack surface.

- [ ] **FF-AUD-002: Add CRON_SECRET to check-renders route**
  - File: `app/api/cron/check-renders/route.ts`
  - Fix: Add standard CRON_SECRET bearer check at top of handler (1-line fix, same pattern as all other cron routes)
  - Risk: Anyone can trigger render pipeline polling against HeyGen/Runway/Shotstack

- [ ] **FF-AUD-003: Fix scheduled-posts IDOR**
  - File: `app/api/scheduled-posts/route.ts` and `app/api/scheduled-posts/[id]/route.ts`
  - Fix: Add `.eq('user_id', authContext.user.id)` to all GET/PATCH/DELETE queries
  - Risk: Any authenticated user can read/modify/delete any other user's scheduled posts

- [ ] **FF-AUD-004: Add admin check to remaining admin routes**
  - `app/api/admin/export/route.ts` — missing `isAdmin` check (sub-routes are fixed)
  - `app/api/admin/performance/route.ts` — missing `isAdmin` check
  - Fix: Add `if (!authContext.isAdmin) return createApiErrorResponse(...)` after auth check

### 2. Environment Variables — Required at Boot

All 7 must be set in Vercel production env vars. App will not function without them.

| Variable | What to set | Where to get it |
|----------|------------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_APP_URL` | `https://app.flashflow.ai` | Your domain |
| `ANTHROPIC_API_KEY` | Claude API key | console.anthropic.com |
| `ADMIN_USERS` | Comma-separated admin emails | Your admin email(s) |
| `CRON_SECRET` | Random bearer token for cron auth | `openssl rand -hex 32` |

### 3. Environment Variables — Core Customer Workflow

These are needed for the primary user journey (signup → generate content → post).

| Variable | System | Required For |
|----------|--------|-------------|
| `STRIPE_SECRET_KEY` | Stripe | Billing / subscriptions |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Subscription lifecycle events |
| `STRIPE_PRICE_CREATOR_LITE` | Stripe | $9/mo plan checkout |
| `STRIPE_PRICE_CREATOR_PRO` | Stripe | $29/mo plan checkout |
| `STRIPE_PRICE_BUSINESS` | Stripe | $59/mo plan checkout |
| `HEYGEN_API_KEY` | HeyGen | Avatar video generation |
| `ELEVENLABS_API_KEY` | ElevenLabs | Text-to-speech |
| `OPENAI_API_KEY` | OpenAI | Transcription / embeddings |
| `REPLICATE_API_TOKEN` | Replicate | Image generation |
| `TELEGRAM_BOT_TOKEN` | Telegram | Operator alerts |
| `TELEGRAM_CHAT_ID` | Telegram | Alert destination |
| `INTERNAL_SERVICE_TOKEN` | Auth | Service-to-service calls |
| `TIKTOK_CONTENT_APP_KEY` | TikTok | Draft export to TikTok |
| `TIKTOK_CONTENT_APP_SECRET` | TikTok | Draft export to TikTok |

### 4. Stripe Setup

- [ ] Create products + prices in Stripe Dashboard (Creator Lite/Pro/Business)
- [ ] Copy price IDs to Vercel env vars
- [ ] Create webhook endpoint: `https://app.flashflow.ai/api/webhooks/stripe`
- [ ] Subscribe to required events (see `docs/launch-readiness.md` Section 3)
- [ ] Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`
- [ ] Verify: trigger a test event in Stripe Dashboard, check Vercel function logs

### 5. Database Migrations

- [ ] Link Supabase: `supabase link --project-ref YOUR_PROJECT_REF`
- [ ] Apply all migrations: `supabase db push`
- [ ] Verify critical tables exist: run `scripts/verify-migrations.sql` in SQL editor
- [ ] Verify RLS migration applied: `20260402000000_enable_rls_unprotected_tables.sql`
- [ ] Verify critical RPC functions exist: `deduct_credit`, `add_credits`, `reset_monthly_credits`, `initialize_user_credits`
- [ ] Verify subscription plans are seeded

### 6. Supabase Auth Configuration

- [ ] Set Site URL to production URL in Supabase Dashboard > Authentication > URL Configuration
- [ ] Add redirect URLs: `https://app.flashflow.ai/**`
- [ ] For preview deployments: add `https://*.vercel.app/**`

### 7. Telegram Safety Check

- [ ] Run: `npx tsx scripts/telegram-webhook.ts assert-deleted`
- [ ] Confirm NO webhook is set (webhook mode disables OpenClaw polling and breaks Bolt)
- [ ] Run: `npx tsx scripts/check-telegram-health.ts`

### 8. Pre-Deploy Verification

- [ ] `pnpm tsc --noEmit` — 0 errors
- [ ] `npx tsx scripts/contract-check.ts` — all checks pass
- [ ] Deploy to Vercel production

### 9. Critical Cron Jobs

These crons are required for the core product to function. Verify they're scheduled in `vercel.json` and `CRON_SECRET` is set.

| Cron | Schedule | Why It's Critical |
|------|----------|-------------------|
| `process-jobs` | Every 1 min | Processes job queue (scripts, renders, exports) |
| `check-renders` | Every 2 min | Polls HeyGen/Runway/Shotstack for render completion |
| `orchestrator` | Every 2 min | Moves videos through pipeline stages |
| `brain-dispatch` | Every 2 min | Dispatches AI decision tasks |
| `drive-intake-poll` | Every 5 min | Polls Google Drive for new content |
| `drive-intake-worker` | Every 5 min | Processes Drive intake queue |
| `content-item-processing` | Every 5 min | Processes content item pipeline |
| `auto-post` | Every 15 min | Posts scheduled content |
| `metrics-sync` | Every 30 min | Syncs performance metrics |
| `sync-tiktok-videos` | Daily 6AM UTC | Syncs TikTok video catalog |

---

## SHOULD DO NEXT (First Week)

### 10. Additional Integration Env Vars

| Variable | System | Purpose |
|----------|--------|---------|
| `MISSION_CONTROL_TOKEN` | Mission Control | Ops data sync (set on BOTH MC and tts-engine Vercel) |
| `MISSION_CONTROL_BASE_URL` | Mission Control | MC endpoint URL |
| `OPENCLAW_API_URL` | OpenClaw | Creator scan / TikTok data |
| `OPENCLAW_API_KEY` | OpenClaw | OpenClaw auth |
| `TIKTOK_CLIENT_KEY` + `SECRET` | TikTok Login Kit | User OAuth login |
| `TIKTOK_REDIRECT_URI` | TikTok | OAuth callback URL |
| `GOOGLE_DRIVE_CLIENT_ID` + `SECRET` | Google Drive | Drive intake OAuth |
| `GOOGLE_DRIVE_REDIRECT_URI` | Google Drive | `https://app.flashflow.ai/api/intake/google/callback` |
| `DRIVE_TOKEN_ENCRYPTION_KEY` | Google Drive | AES key for stored tokens |
| `RESEND_API_KEY` | Email | Transactional email |
| `LATE_API_KEY` | Late.dev | Social media scheduling |
| `SHOTSTACK_PRODUCTION_KEY` | Shotstack | Video rendering |
| `RUNWAY_API_KEY` | Runway | Video generation |

### 11. Fix Remaining Audit Findings

- [ ] **FF-AUD-006:** Encrypt TikTok OAuth tokens (migration columns exist, need app-level encryption like Google Drive)
- [ ] **FF-AUD-009:** Narrow Google Drive scope from `drive` to `drive.file`
- [ ] **FF-AUD-007:** Add API-level plan gate enforcement to 6 unprotected routes
- [ ] **FF-AUD-008:** Add row-level locking to job queue (`FOR UPDATE SKIP LOCKED`)

### 12. Remove Legacy MC_API_TOKEN

After 1-2 days of stable production:
1. `cd ~/tts-engine && vercel env rm MC_API_TOKEN production -y`
2. Remove fallback chain in `lib/flashflow/mission-control.ts`
3. Remove from `lib/support-mc-bridge.ts`
4. Remove from `app/api/admin/hook-bank/import/route.ts`
5. Redeploy

### 13. Operator Dashboard Verification

After deploy, verify these pages load and show real data:

| Page | What to check |
|------|---------------|
| `/admin/settings/system-status` | Overall status green, env config section shows no missing required vars |
| `/admin/monitoring` | Health checks passing, queue counts reasonable |
| `/admin/pipeline` | Pipeline visible, no stuck items |
| `/admin/content-items` | Content items list loads |
| `/admin/intake` | Drive intake status (if configured) |

### 14. Wire Failure Alerts to Critical Crons

Currently only RI ingestion has automatic Telegram failure alerts. Add `checkAndSendFailureAlert()` to catch blocks of:
- [ ] `check-renders`
- [ ] `orchestrator`
- [ ] `process-jobs`
- [ ] `drive-intake-poll`
- [ ] `metrics-sync`

---

## CAN WAIT UNTIL AFTER LAUNCH

### 15. Optional Integrations

| Variable | System | When needed |
|----------|--------|------------|
| `DISCORD_BOT_TOKEN` + related | Discord | Community management |
| `SLACK_WEBHOOK_URL` | Slack | Slack notifications |
| `SENTRY_DSN` | Sentry | Error tracking (recommended) |
| `BROWSER_SERVICE_URL` + `KEY` | Browser Service | TikTok automation via HP machine |
| `OUTLOOK_*` vars | Outlook/CRM | CRM email sync |
| `SCRAPECREATORS_API_KEY` | Scraping | TikTok data scraping |
| `SUPADATA_API_KEY` | Scraping | YouTube data |
| `YOUTUBE_API_KEY` | YouTube | YouTube Data API |
| `COBALT_API_URL` + `KEY` | Cobalt | Video downloads |
| `TIKTOK_SHOP_APP_KEY` + `SECRET` | TikTok Shop | Shop integration |
| `TIKTOK_RESEARCH_CLIENT_KEY` + `SECRET` | TikTok Research | Research API |

### 16. Performance Optimizations

- [ ] Fix N+1 query in creator/dashboard (26 sequential DB calls — FF-AUD finding)
- [ ] Add content item status transition enforcement
- [ ] Add Sentry error capture to remaining 23 cron routes

### 17. Video Plan Stripe Prices

| Variable | Plan | Price |
|----------|------|-------|
| `STRIPE_PRICE_VIDEO_STARTER` | Video Starter | $89/mo |
| `STRIPE_PRICE_VIDEO_GROWTH` | Video Growth | $199/mo |
| `STRIPE_PRICE_VIDEO_SCALE` | Video Scale | $499/mo |
| `STRIPE_PRICE_VIDEO_AGENCY` | Video Agency | $1,150/mo |
| `STRIPE_PRICE_EDITING_ONLY` | Editing Only | $19/mo |
| `STRIPE_PRICE_EDITING_ADDON` | Extra Edits Pack | $10/mo |
| `STRIPE_PRICE_PER_VIDEO` | Single Video Edit | $3 one-time |

---

## 5 MOST IMPORTANT END-TO-END SMOKE TESTS

Run these in production after deploy:

### Smoke Test 1: New User Signup → Free Credits
1. Visit `NEXT_PUBLIC_APP_URL` — landing page loads
2. Sign up with a new email
3. Log in — admin panel NOT accessible
4. Check `user_credits` — should have 5 free credits
5. **Pass condition:** User exists, credits initialized, non-admin routing works

### Smoke Test 2: Script Generation → Credit Deduction
1. As a user with credits, generate a script for a product
2. Verify script output appears
3. Check `credit_transactions` — should show 1 credit deducted
4. **Pass condition:** AI generation works, credits deducted atomically

### Smoke Test 3: Stripe Checkout → Plan Upgrade
1. Click upgrade, complete Stripe checkout (use test card if test mode)
2. Wait for webhook delivery (check Stripe Dashboard > Webhooks)
3. Verify `user_subscriptions` shows correct plan
4. Verify `user_credits` shows correct allocation
5. **Pass condition:** Webhook fires, plan syncs, credits allocated

### Smoke Test 4: Admin System Status
1. Log in as admin (email in `ADMIN_USERS`)
2. Visit `/admin/settings/system-status`
3. Verify: services grid shows checks (not all errored), env config section renders
4. Verify: workflow health section shows severity pills
5. Click "Send to Telegram" — verify message arrives
6. **Pass condition:** Dashboard renders with real data, Telegram alert works

### Smoke Test 5: Cron Health
1. Wait 5 minutes after deploy
2. Visit `/admin/settings/system-status` → check cron freshness table
3. Verify `process-jobs` and `orchestrator` show recent runs
4. Check `ff_cron_runs` table in Supabase — rows appearing
5. **Pass condition:** Crons are firing and logging runs

---

## PRODUCTION MIGRATIONS LIST

All migrations live in `supabase/migrations/`. Total: ~247 files.

**Critical recent migrations that must be applied:**
| Migration | Purpose |
|-----------|---------|
| `20260327000000_ff_cron_runs.sql` | Cron run tracking table |
| `20260330000000_content_items_system.sql` | Unified content items |
| `20260402000000_enable_rls_unprotected_tables.sql` | RLS on 23 tables |
| `20260402000001_tiktok_token_encryption_columns.sql` | Token encryption prep |
| `20260404000000_jobs_queue.sql` | General job queue |
| `20260407100000_high_volume_indexes.sql` | Performance indexes |
| `20260408100000_creator_opportunity_radar.sql` | Opportunity detection |
| `20260414100000_opportunity_alerts.sql` | Alert system |
| `20260417100000_scan_cost_optimization.sql` | Cost optimization |
| `MISSING_TABLES_CONSOLIDATED.sql` | 19 critical tables if missing |

**Verification:** Run `scripts/verify-migrations.sql` in Supabase SQL editor.

---

## LIKELY FAILURE POINTS — FIRST WEEK

| What could go wrong | Why | How you'd notice | What to do |
|---------------------|-----|-------------------|------------|
| **Stripe webhook signature mismatch** | STRIPE_WEBHOOK_SECRET doesn't match endpoint signing secret | Users upgrade but credits/plan don't update | Check Stripe Dashboard > Webhooks for 401s. Copy correct `whsec_...` |
| **Cron jobs not firing** | CRON_SECRET not set or mismatch with vercel.json auth | Cron freshness table shows all "never run" | Set `CRON_SECRET` in Vercel, redeploy |
| **Database migration drift** | Missing table or column | 500 errors on specific pages, `42P01` in logs | Run `supabase db push` |
| **HeyGen renders stuck** | check-renders cron running but API key expired/quota exhausted | Videos stuck in AI_RENDERING for hours | Check HeyGen dashboard for quota, system-status for service health |
| **Google Drive intake silent** | OAuth tokens expired, no auto-refresh mechanism | Drive intake freshness goes critical on dashboard | Re-authorize Google Drive in admin settings |
| **TikTok connections disconnected** | OAuth token expiry (90 days) | TikTok Content shows as "degraded" on system-status | Users must re-authorize TikTok |
| **Job queue backlog** | process-jobs cron failing, or jobs crashing repeatedly | Job queue severity goes critical on dashboard | Check Vercel function logs for process-jobs errors |
| **Email queue piling up** | RESEND_API_KEY missing or invalid | Email system shows degraded on workflow health | Set/fix RESEND_API_KEY |
| **Supabase connection limit** | Too many concurrent serverless connections | Intermittent 500s across all routes | Check Supabase Dashboard > Database > Connections |

---

## OPERATOR REFERENCE — WHAT TO CHECK DAILY

| Check | Route/Tool | What to look for |
|-------|-----------|-----------------|
| System status | `/admin/settings/system-status` | Overall status green, no critical/degraded workflows |
| Cron freshness | Same page → Cron Freshness table | All crons have recent runs, no red/amber |
| Job queue | Same page → Job Queue | No backlog, failed count < 5 |
| Pipeline | `/admin/pipeline` | No stuck rendering/review |
| Telegram | Ops chat | No failure alerts fired overnight |
| Stripe | Stripe Dashboard > Webhooks | All events delivered, no persistent failures |
| Vercel | Vercel Dashboard > Functions | No function timeout spikes |

---

*This document supersedes `docs/launch-readiness.md` for the production rollout checklist. The original launch-readiness.md remains valid as env var/playbook reference.*
