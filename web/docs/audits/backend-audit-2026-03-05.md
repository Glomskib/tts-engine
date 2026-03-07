# FlashFlow Backend Audit Report
**Generated:** 2026-03-05
**Auditor:** Claude Opus 4.6 (automated)
**Scope:** FlashFlow, Mission Control, MMM Event OS, OpenClaw Workspace

---

## 1. Executive Summary (Top 15 Issues)

| # | Sev | Issue | Area |
|---|-----|-------|------|
| 1 | **P0** | API keys in plaintext with no .gitignore in OpenClaw workspace -- one `git add .` from public exposure | Security |
| 2 | **P0** | `check-renders` cron has NO CRON_SECRET -- anyone can trigger render pipeline | Auth |
| 3 | **P0** | Scheduled posts IDOR -- any authenticated user can read/modify/delete ANY user's posts | Auth |
| 4 | **P0** | Admin routes (`deploy`, `export`, `performance`) missing admin role check -- any auth'd user can trigger | Auth |
| 5 | **P0** | 23 tables have NO Row Level Security enabled (including `video_events`, `posting_accounts`) | DB |
| 6 | **P0** | TikTok OAuth tokens stored in plain text (4 tables) -- Drive tokens properly encrypted | Security |
| 7 | **P1** | 6 plan-gated features have NO API-level plan enforcement -- free users can bypass via direct API calls | Plan Gates |
| 8 | **P1** | Job queue has no row-level locking -- concurrent `process-jobs` invocations will double-execute | Workers |
| 9 | **P1** | Stripe checkout metadata key mismatch (`/api/stripe/checkout` uses `userId`/`tier`, webhook expects `user_id`/`plan_id`) | Billing |
| 10 | **P1** | Google Drive service account uses full `drive` scope instead of `drive.file` | Security |
| 11 | **P1** | Two divergent clones of tts-engine repo on disk | DevOps |
| 12 | **P1** | Large uncommitted delta in Mission Control (17 new routes/pages) | DevOps |
| 13 | **P2** | 23 of 34 cron routes lack Sentry error capture | Observability |
| 14 | **P2** | 6 confirmed N+1 query patterns (worst: creator/dashboard with 26 sequential DB calls) | Performance |
| 15 | **P2** | No content item status transition enforcement -- can jump from `briefing` to `posted` | Data Integrity |

**Next Actions (ordered):**
1. Add .gitignore to OpenClaw workspace immediately (blocks credential leak)
2. Add CRON_SECRET to check-renders route (1 line fix)
3. Add workspace_id filter to scheduled-posts routes (IDOR fix)
4. Add admin role checks to admin/deploy, admin/export, admin/performance
5. Enable RLS on 23 unprotected tables (migration)
6. Encrypt TikTok tokens using existing AES-256-GCM crypto module
7. Add plan gate checks to 6 unprotected API routes
8. Add `FOR UPDATE SKIP LOCKED` to job queue runner
9. Fix or remove `/api/stripe/checkout` metadata mismatch
10. Narrow Drive service account scope to `drive.file`

---

## 2. Repo Inventory + Health

| Repo | Path | Status | Branch | Build | Tests |
|------|------|--------|--------|-------|-------|
| **FlashFlow** | `/Volumes/WorkSSD/01_ACTIVE/FlashFlow/web` | Audited | `master` (clean) | 0 TS errors | 207/207 pass |
| **Mission Control** | `~/mission-control` | Audited | `main` (dirty: 10 modified + 17 untracked) | Healthy | N/A |
| **MMM Event OS** | `~/mmm-event-os` | Audited | `feat/my-events` (clean) | Active dev | N/A |
| **OpenClaw Workspace** | `~/.openclaw/workspace` | Audited | `main` (all untracked) | N/A | N/A |
| **tts-engine (dup)** | `~/tts-engine/web` | Same repo, behind by 3 commits | `master` | Same | Same |
| **Browser Service** | `/Volumes/WorkSSD/01_ACTIVE/FlashFlow/browser-service/` | Audited | N/A | Express+Playwright | N/A |

**FlashFlow stats:** 642 API routes, ~200 DB tables, 28 Vercel cron jobs, 34 cron route files.

---

## 3. Findings by Severity

### P0 -- Critical / Broken (6 findings)

#### FF-AUD-001: OpenClaw API Keys in Plaintext, No .gitignore
- **Symptom:** `brave_api_key.txt`, `late_api_key.txt` (contains full `sk_...` key), `service-account-key.json` sit in workspace root with NO .gitignore
- **Root cause:** Workspace was initialized without a .gitignore; files are untracked but one `git add .` pushes them to the PUBLIC repo `Glomskib/openclaw-workspace`
- **Evidence:** `~/.openclaw/workspace/late_api_key.txt`, `~/.openclaw/workspace/service-account-key.json`
- **Impact:** Credential leak to public GitHub. Late.dev API key, Google service account, Brave API key all exposed.
- **Fix:** Add `.gitignore` with `*.txt`, `*.json`, `*.key` patterns. Rotate exposed keys. **Effort: S** | **Owner: DevOps**

#### FF-AUD-002: check-renders Cron Missing CRON_SECRET
- **Symptom:** No authorization check in the route handler
- **Root cause:** Route was wrapped with `withErrorCapture()` but CRON_SECRET guard was never added
- **Evidence:** `app/api/cron/check-renders/route.ts:66` -- zero occurrences of `CRON_SECRET`
- **Impact:** Anyone can trigger render polling against external APIs (Runway, HeyGen, Shotstack), manipulate video pipeline state
- **Fix:** Add standard CRON_SECRET check at top of handler. **Effort: S** | **Owner: Backend**

#### FF-AUD-003: Scheduled Posts IDOR
- **Symptom:** GET/PATCH/DELETE on scheduled_posts operates on any record without user ownership check
- **Root cause:** Routes query `scheduled_posts` without filtering by `user_id`
- **Evidence:**
  - `app/api/scheduled-posts/route.ts:23-36` (GET -- no user_id filter)
  - `app/api/scheduled-posts/[id]/route.ts:21-28` (GET by ID -- no user_id filter)
  - `app/api/scheduled-posts/[id]/route.ts:77-82` (PATCH -- no user_id filter)
  - `app/api/scheduled-posts/[id]/route.ts:110-113` (DELETE -- no user_id filter)
- **Impact:** Any authenticated user can read, modify, or delete any other user's scheduled posts
- **Fix:** Add `.eq('user_id', user.id)` to all queries. **Effort: S** | **Owner: Backend**

#### FF-AUD-004: Admin Routes Missing Admin Role Check
- **Symptom:** Routes under `/api/admin/` don't verify admin role
- **Root cause:** Comment in deploy route says "admin layout already gates access" -- UI gating is not a security control
- **Evidence:**
  - `app/api/admin/deploy/route.ts:12` -- any auth'd user can trigger Vercel deploys
  - `app/api/admin/export/route.ts:24` -- any auth'd user can export all video data
  - `app/api/admin/performance/route.ts:9` -- uses supabaseAdmin without workspace filter
  - `app/api/admin/health/route.ts:16` -- any auth'd user can view system health
- **Impact:** Privilege escalation. Non-admin users can trigger deployments and export all data.
- **Fix:** Add `if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })` to each. **Effort: S** | **Owner: Backend**

#### FF-AUD-005: 23 Tables Without Row Level Security
- **Symptom:** Tables accept queries from any authenticated user via client-side Supabase
- **Root cause:** RLS was never enabled on these tables
- **Evidence:** Migration files lack `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for:
  - `video_events` (69 code references), `video_metrics` (8), `posting_accounts` (9), `proven_hooks` (16), `hook_feedback` (9), `audit_log` (4), `iteration_groups` (6), `team_members` (5), `script_library` (5), `script_feedback` (2), `agent_tasks`, `stripe_webhook_events` (3), `ff_agent_dispatch`, `ff_research_jobs`, `ff_session_status`, `skit_budget`, `ai_generation_runs`, `ai_hook_feedback`, `broll_clips`, `plan_video_quotas`, `reference_assets`, `reference_extracts`, `video_winners`
- **Impact:** Data leakage. Any authenticated user can read/write these tables directly.
- **Fix:** Migration to enable RLS + add policies scoped by workspace_id/user_id. **Effort: M** | **Owner: Backend**

#### FF-AUD-006: TikTok OAuth Tokens Stored in Plain Text
- **Symptom:** access_token and refresh_token stored as TEXT columns
- **Root cause:** Encryption pattern used for Drive tokens was never applied to TikTok
- **Evidence:**
  - `supabase/migrations/20260325100000_tiktok_connections.sql:9-10`
  - `supabase/migrations/124_tiktok_shop_connections.sql:9-10`
  - `supabase/migrations/20260213000001_tiktok_content_posting.sql:16-17`
  - `supabase/migrations/20260221000001_tiktok_login_connections.sql:12-13`
- **Impact:** Compromised user session or DB access exposes all TikTok tokens. Drive tokens are properly encrypted via `lib/security/crypto.ts` (AES-256-GCM).
- **Fix:** Apply same encryption pattern from `lib/security/crypto.ts`. Add encrypted columns, migrate data, drop plain columns. **Effort: M** | **Owner: Backend**

---

### P1 -- Major (8 findings)

#### FF-AUD-007: Plan Gate Drift -- UI Gated, API Open
- **Symptom:** 6 features gated in UI via `<PlanGate>` but API routes have no plan check
- **Evidence:**
  - `/admin/winners/patterns` (UI: `creator_pro`) -> `/api/winners/analyze-patterns` (API: none)
  - `/admin/calendar` (UI: `creator_pro`) -> `/api/calendar` (API: none)
  - `/admin/posting-queue` (UI: `creator_pro`) -> `/api/videos/queue` (API: none)
  - `/admin/second-brain` (UI: `agency`) -> `/api/second-brain/documents` (API: none)
  - `/admin/audience` (UI: plan check) -> `/api/audience/personas` (API: none)
  - Editor notes manual POST endpoint also lacks plan gate
- **Impact:** Free-tier users bypass paid features via direct API calls
- **Fix:** Add `assertMinPlan` to each API route. **Effort: S** | **Owner: Backend**

#### FF-AUD-008: Job Queue Double-Execution Risk
- **Symptom:** Two concurrent `process-jobs` invocations claim the same batch
- **Root cause:** `runner.ts:27-32` uses simple `SELECT ... WHERE status='pending'` without row locking
- **Evidence:** `lib/jobs/runner.ts:27-32`
- **Impact:** Jobs executed twice -- duplicate AI calls, duplicate DB writes
- **Fix:** Add `FOR UPDATE SKIP LOCKED` to the job claim query. **Effort: S** | **Owner: Backend**

#### FF-AUD-009: Stripe Checkout Metadata Mismatch
- **Symptom:** `/api/stripe/checkout` uses `userId`/`tier` in metadata; webhook reads `user_id`/`plan_id`
- **Evidence:** `app/api/stripe/checkout/route.ts:63-67` vs `app/api/webhooks/stripe/route.ts`
- **Impact:** Checkouts via this route silently fail to provision subscriptions
- **Fix:** Either fix metadata keys to match or delete the legacy route (canonical route is `/api/subscriptions/checkout`). **Effort: S** | **Owner: Backend**

#### FF-AUD-010: Drive Service Account Over-Scoped
- **Symptom:** Uses `https://www.googleapis.com/auth/drive` (full access) scope
- **Evidence:** `lib/drive/client.ts:58`
- **Impact:** Service account has full read/write/delete access to all Drive files. Only needs `drive.file` for files it creates.
- **Fix:** Change scope to `drive.file`. **Effort: S** | **Owner: Backend**

#### FF-AUD-011: Ghost Cron Entry (nightly-reset)
- **Symptom:** `vercel.json` defines cron for `/api/cron/nightly-reset` but no route file exists
- **Evidence:** `vercel.json` cron entry; `app/api/cron/nightly-reset/` does not exist
- **Impact:** Vercel fires a 404 every day at 05:05 UTC
- **Fix:** Remove from vercel.json or create the route. **Effort: S** | **Owner: DevOps**

#### FF-AUD-012: content_items.short_id Missing UNIQUE Constraint
- **Symptom:** Only a plain index, no uniqueness enforcement
- **Evidence:** `supabase/migrations/20260330000000_content_items_system.sql:72`
- **Impact:** Trigger generates 6-char hex from UUID prefix (16M space). Collisions possible. Duplicates silently accepted.
- **Fix:** `CREATE UNIQUE INDEX`. **Effort: S** | **Owner: Backend**

#### FF-AUD-013: Two Divergent tts-engine Clones
- **Symptom:** `~/tts-engine` (HTTPS, HEAD `e69c7a2`) behind `/Volumes/WorkSSD/01_ACTIVE/FlashFlow` (SSH, HEAD `5ce8dc2`)
- **Impact:** Work in wrong clone causes merge conflicts or lost work
- **Fix:** Delete one clone, symlink. **Effort: S** | **Owner: DevOps**

#### FF-AUD-014: Mission Control Large Uncommitted Delta
- **Symptom:** 10 modified + 17 untracked files including entire new route groups
- **Evidence:** `~/mission-control` git status
- **Impact:** Significant functionality sitting only on disk -- vulnerable to data loss
- **Fix:** Commit and push. **Effort: S** | **Owner: DevOps**

---

### P2 -- Important (12 findings)

#### FF-AUD-015: 23 Cron Routes Lack Sentry Error Capture
- **Evidence:** Only 11 of 34 cron routes use `withErrorCapture` or `captureRouteError`
- **Impact:** Silent failures in 23 crons only visible in Vercel logs, not Sentry alerts
- **Fix:** Wrap remaining routes with `withErrorCapture`. **Effort: M** | **Owner: Backend**

#### FF-AUD-016: No Content Item Status Transition Enforcement
- **Evidence:** `app/api/content-items/[id]/route.ts:91` -- validates status is valid enum but allows any transition
- **Impact:** Items can jump from `briefing` to `posted` or regress backwards
- **Fix:** Add transition map and validate `oldStatus -> newStatus`. **Effort: S** | **Owner: Backend**

#### FF-AUD-017: N+1 Query Patterns (6 routes)
- **Evidence:**
  - `app/api/creator/dashboard/route.ts:92-119` -- 26 sequential DB calls
  - `app/api/admin/retainers/route.ts:26-50` -- 2N queries per brand
  - `app/api/admin/editors/route.ts:74` -- N queries per editor
  - `app/api/admin/ops-warnings/route.ts:229` -- N queries per hook
  - `app/api/admin/clip-index/status/route.ts:31` -- N per status
  - `app/api/variants/scale/route.ts:258` -- N per account
- **Fix:** Batch with `.in()` filters or RPC functions. **Effort: M** | **Owner: Backend**

#### FF-AUD-018: Duplicate Drive Folder Endpoints
- **Evidence:** `app/api/content-items/[id]/drive-folder/route.ts` and `app/api/content-items/[id]/drive/ensure/route.ts` -- different lib imports, same purpose
- **Fix:** Consolidate to one endpoint. **Effort: S** | **Owner: Backend**

#### FF-AUD-019: No AI Spending Cap / Budget Enforcement
- **Evidence:** Usage tracked in `usage_events` but no circuit breaker when costs exceed threshold
- **Impact:** Single user could exhaust API credits
- **Fix:** Add per-user daily/monthly credit limit enforcement. **Effort: M** | **Owner: Backend**

#### FF-AUD-020: CORS Allows All Origins
- **Evidence:** `middleware.ts:7` -- `Access-Control-Allow-Origin: *`
- **Fix:** Whitelist production domains. **Effort: S** | **Owner: Backend**

#### FF-AUD-021: No CSRF Protection
- **Evidence:** No CSRF token validation on state-changing endpoints
- **Mitigating:** SameSite cookies + `Content-Type: application/json` requirement
- **Fix:** Consider CSRF tokens for critical operations. **Effort: M** | **Owner: Backend**

#### FF-AUD-022: Issues Intake Endpoint Open Without Rate Limiting
- **Evidence:** `app/api/flashflow/issues/intake/route.ts:1-10` -- designed for external integrations, no auth, no rate limit
- **Fix:** Add shared secret or rate limiting. **Effort: S** | **Owner: Backend**

#### FF-AUD-023: Hardcoded Test Passwords in Source
- **Evidence:** `app/api/admin/test-accounts/route.ts:19` (`FlashFlow2026!`), stress test scripts
- **Fix:** Move to env vars or generate random passwords. **Effort: S** | **Owner: Backend**

#### FF-AUD-024: exec_sql RPC -- Arbitrary SQL Execution
- **Evidence:** `lib/schema-migration.ts:20,51,74` calls `supabaseAdmin.rpc('exec_sql', { sql: ... })`
- **Impact:** If the function exists in production, it's a powerful attack surface
- **Fix:** Verify the function is restricted or does not exist in prod. **Effort: S** | **Owner: Backend**

#### FF-AUD-025: Posting Queue Uses Legacy videos Table, Not content_items
- **Evidence:** `app/api/posting-queue/route.ts` queries `videos` only
- **Impact:** Content items created via new pipeline never appear in posting queue
- **Fix:** Add content_items query alongside videos. **Effort: M** | **Owner: Backend**

#### FF-AUD-026: Watchdog Hardcoded Fallback Token
- **Evidence:** `~/ops/watchdog/openclaw_watchdog.sh:184` -- `echo "mc-admin-token-2026"`
- **Fix:** Remove fallback. **Effort: S** | **Owner: DevOps**

---

### P3 -- Nice-to-Have (10 findings)

| ID | Issue | Evidence |
|----|-------|----------|
| FF-AUD-027 | 8 orphan cron routes not in vercel.json | `weekly-summaries`, `process-payouts`, `analyze-videos`, etc. |
| FF-AUD-028 | ~106 potentially dead API routes (16.5% of 642) | Routes with no frontend fetch() callers |
| FF-AUD-029 | 95 admin pages with no sidebar nav link | See Section 8 |
| FF-AUD-030 | 18 orphaned lib/ files never imported | `dashboard-roles.ts`, `supabaseClient.ts`, `feature-gates.ts`, etc. |
| FF-AUD-031 | Unused useState variables in content-studio (7+) | `productDescription`, `creatorPersonaExpanded`, etc. |
| FF-AUD-032 | 2 placeholder job handlers return fake success | `generate_script`, `refresh_metrics` in `lib/jobs/handlers.ts` |
| FF-AUD-033 | Metrics sync cron is a stub | `app/api/cron/metrics-sync/route.ts` -- no platform API integration |
| FF-AUD-034 | Late.dev integration has no retry/backoff | `lib/marketing/late-service.ts` |
| FF-AUD-035 | MMM Event OS test route in production | `/api/test/apply-early-bonus` |
| FF-AUD-036 | `sales_summary` table has zero code references | Dead table |

---

## 4. Schema Integrity + RLS

### Tables Without RLS (23)
`video_events`, `video_metrics`, `video_winners`, `posting_accounts`, `proven_hooks`, `hook_feedback`, `audit_log`, `iteration_groups`, `team_members`, `script_library`, `script_feedback`, `agent_tasks`, `stripe_webhook_events`, `ff_agent_dispatch`, `ff_research_jobs`, `ff_session_status`, `skit_budget`, `ai_generation_runs`, `ai_hook_feedback`, `broll_clips`, `plan_video_quotas`, `reference_assets`, `reference_extracts`

### Token Storage
| Token Type | Encrypted? | Method | Risk |
|---|---|---|---|
| Google Drive OAuth | Yes | AES-256-GCM (iv+tag) | Low |
| TikTok (4 tables) | **No** | Plain TEXT | **High** |
| API Keys | Yes | SHA-256 hash | Low |
| Webhook secrets | No | Plain TEXT (user-scoped RLS) | Medium |

### Schema Drift
11 tables referenced via `.from()` but missing from `supabase/migrations/`: `task_queue`, `email_queue`, `email_subscribers`, `events_log`, `variants`, `video_assets`, `video_enrichment_tasks`, `video_ingestion_jobs`, `video_ingestion_rows`, `concepts`, `videos`

### content_items Integrity
- workspace_id: **No FK constraint** (should reference auth.users)
- short_id: **No UNIQUE constraint** (collision risk)
- `type` column: **Missing** from schema (referenced in audit requirements)
- Status enum: Validated but transitions not enforced

---

## 5. Cron/Worker Reliability

| Cron | Schedule | CRON_SECRET | Error Capture | Overlap Risk |
|------|----------|-------------|---------------|--------------|
| check-renders | */2 * * * * | **MISSING** | Yes | High |
| process-jobs | * * * * * | Yes | **No** | **High** (no row lock) |
| orchestrator | */2 * * * * | Yes | **No** | High |
| content-item-processing | */5 * * * * | Yes | Yes | Medium |
| drive-intake-poll | */10 * * * * | Yes | Yes | Low |
| nightly-reset | 5 5 * * * | N/A | N/A | **Route missing** |
| (25 others) | Various | Yes | Mixed | Low-Medium |

**Job Queue:** 6 types defined, 2 are stubs. No dead letter queue. No concurrent execution guard.

---

## 6. Integrations

| Integration | Status | Key Issues |
|---|---|---|
| **TikTok OAuth** | Working (both flows) | Tokens unencrypted (P0), no Sentry on callback |
| **Google Drive** | Working (dual auth) | Service account over-scoped (P1), OAuth docs scope broad |
| **Late.dev** | Working | No retry/backoff (P3) |
| **Stripe** | Working | Metadata mismatch on legacy checkout (P1), no Sentry on webhook |
| **Sentry** | Partial | 68% of crons lack capture; Stripe webhook uncaptured |
| **Claude/OpenAI** | Working | No spending cap (P2), no per-user rate limit on AI calls |
| **Mission Control** | Working | Token cleanup TODO still pending |

---

## 7. Content Items E2E Trace

| Step | Route/Function | Status | Issues |
|------|---------------|--------|--------|
| 1. Create | `POST /api/content-items` | Working | Experiment insert errors silently swallowed |
| 2. Brief (AI) | `POST /api/content-items/[id]/brief` | Working | Plan gated (creator_pro) -- correct |
| 3. Drive folder | `POST .../drive-folder` + `POST .../drive/ensure` | Working | **Two duplicate endpoints** with different lib imports |
| 4. Transcript | `POST .../transcript` + cron auto-process | Working | Auto-transcription triggers editor notes |
| 5. Editor notes | `POST .../editor-notes` + job queue + cron | Working | **Manual endpoint missing plan gate** |
| 6. Status transitions | `PATCH /api/content-items/[id]` | Partial | **No sequential enforcement** -- can skip/regress |
| 7. Posting queue | `GET /api/posting-queue` | Partial | **Uses legacy videos table only** -- content_items not included |
| 8. Metrics | `POST .../metrics` + cron stub | Partial | **Metrics sync cron is a stub** -- manual entry only |
| 9. Winners | Detector + cron batch | Working | Fire-and-forget pattern (errors logged, not thrown) |

---

## 8. Consolidation Map

| Opportunity | Current Pages | Effort | Recommendation |
|---|---|---|---|
| Calendar + Posting Queue | 2 pages, 2 APIs | Medium | Merge into single "Content Calendar" with calendar/queue toggle |
| Pipeline Board + Content Items | 2 pages, 2 tables | High | Merge into "Production Board" with Videos/Content Items tabs |
| Analytics (orphans) | 8 pages, 3 in nav | Low | Delete 5 orphan pages, consolidate 3 nav pages into tabs |
| Settings (diagnostics+status) | 9 pages | Low | Merge Diagnostics + System Status; merge Notifications + Telegram |
| Content Studio + Briefs | 2 pages | Low | Keep separate, add "Generate from Brief" handoff button |

---

## 9. Dead Code Summary

- **18 orphaned lib/ files** with exports never imported
- **~106 dead API routes** (never called from frontend)
- **95 admin pages** with no sidebar navigation link
- **7+ unused useState variables** in content-studio
- **1 dead DB table** (`sales_summary` -- zero references)
- **2 stub job handlers** returning fake success

---

## 10. Recommended Next Sprint (Ordered)

1. **[S] Add .gitignore to OpenClaw workspace** -- prevents credential leak (FF-AUD-001)
2. **[S] Add CRON_SECRET to check-renders** (FF-AUD-002)
3. **[S] Fix scheduled-posts IDOR** -- add user_id filters (FF-AUD-003)
4. **[S] Add admin role checks** to deploy/export/performance routes (FF-AUD-004)
5. **[M] Enable RLS on 23 tables** -- write migration (FF-AUD-005)
6. **[M] Encrypt TikTok tokens** using existing crypto module (FF-AUD-006)
7. **[S] Add plan gate checks** to 6 unprotected API routes (FF-AUD-007)
8. **[S] Add FOR UPDATE SKIP LOCKED** to job queue runner (FF-AUD-008)
9. **[S] Fix/remove legacy Stripe checkout route** (FF-AUD-009)
10. **[S] Narrow Drive service account scope** (FF-AUD-010)
11. **[S] Remove nightly-reset from vercel.json** (FF-AUD-011)
12. **[S] Add UNIQUE constraint to content_items.short_id** (FF-AUD-012)
13. **[M] Add Sentry capture to remaining 23 crons** (FF-AUD-015)
14. **[S] Add status transition enforcement** to content items (FF-AUD-016)
15. **[M] Fix N+1 queries** in creator/dashboard and retainers (FF-AUD-017)
16. **[S] Consolidate duplicate Drive folder endpoints** (FF-AUD-018)
17. **[S] Whitelist CORS origins** (FF-AUD-020)
18. **[M] Delete confirmed dead routes and orphan pages** (FF-AUD-028, FF-AUD-029)
19. **[S] Commit Mission Control changes** (FF-AUD-014)
20. **[S] Delete duplicate tts-engine clone** (FF-AUD-013)
