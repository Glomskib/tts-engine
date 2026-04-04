# Schema Verification Audit

**Date:** 2026-03-09
**Scope:** Code references vs migration coverage for all Supabase tables

## Summary

| Metric | Count |
|--------|-------|
| Unique tables referenced in code | 169 |
| Tables with migrations in `supabase/migrations/` | ~160 |
| Tables with NO migration | 6 |
| Tables in non-standard migration location | 3 |
| Database types file coverage | 11 of 169 (6.5%) |

## Part 1: Tables Missing Migrations

These tables are referenced in production code but have NO `CREATE TABLE` statement in `supabase/migrations/`:

### CRITICAL — Active Production Features

| Table | Used In | Impact If Missing |
|-------|---------|-------------------|
| `email_subscribers` | `lib/email/unsubscribe.ts`, `app/api/lead-magnet/route.ts` | Lead magnet capture fails, email unsubscribe fails, CAN-SPAM compliance at risk |
| `email_queue` | `lib/email/scheduler.ts` (7 references) | All automated email sequences fail (onboarding, winback, lead magnet, digest) |
| `content_item_transcripts` | `lib/editing/analyzeTranscript.ts` | Editing suggestion generation fails (cut pauses, remove fillers, add B-roll) |

### MODERATE — Used But Gracefully Degrades

| Table | Used In | Impact If Missing |
|-------|---------|-------------------|
| `system_settings` | `app/api/cron/daily-digest/route.ts` | Credits show as "unknown" in Telegram digest — wrapped in try-catch, non-blocking |
| `referrals` | `lib/affiliates.ts` | Referral count returns null — affiliate dashboard shows 0 referrals, non-fatal |

### NON-STANDARD LOCATION

These tables have migrations but in `/web/migrations/` instead of `/web/supabase/migrations/`:

| Table | Location | Note |
|-------|----------|------|
| `posting_queue` | `migrations/posting_queue.sql` | Manual SQL execution needed |
| `task_queue` | `migrations/add_task_queue.sql` | Manual SQL execution needed |
| `ff_trending_items` | `migrations/ff_trending_items.sql` | Manual SQL execution needed |

## Part 2: Tables Previously Thought Missing But Actually Covered

The MISSING_TABLES_CONSOLIDATED.sql file listed 19 tables as missing. Current status:

| Table | Status | Migration |
|-------|--------|-----------|
| `video_metrics` | COVERED | `006_video_performance.sql` |
| `collections` | COVERED | `051_collections.sql` |
| `collection_items` | COVERED | `051_collections.sql` |
| `user_activity` | COVERED | `052_user_activity.sql` |
| `script_comments` | COVERED | `054_script_comments.sql` |
| `credit_packages` | COVERED | `059_credits.sql` |
| `credit_purchases` | COVERED | `059_credits.sql` |
| `client_orgs` | COVERED | `071_client_orgs.sql` |
| `client_org_members` | COVERED | `071_client_orgs.sql` |
| `client_projects` | COVERED | `071_client_orgs.sql` |
| `winner_patterns` | COVERED | `119_winner_patterns.sql` + `20260402000000_winner_patterns_engine.sql` |
| `webhooks` | COVERED | `095_webhooks.sql` |
| `webhook_deliveries` | COVERED | `095_webhooks.sql` |
| `custom_templates` | COVERED | `096_custom_templates.sql` |
| `ab_test_variations` | COVERED | `097_ab_tests.sql` |
| `trending_hashtags` | COVERED | `098_trending.sql` |
| `trending_sounds` | COVERED | `098_trending.sql` |
| `user_settings` | COVERED | `MISSING_TABLES_CONSOLIDATED.sql` only |

**Conclusion:** The MISSING_TABLES_CONSOLIDATED.sql concern is largely resolved. All 19 tables now have at least one migration covering them. However, `user_settings` only exists in the consolidated file (which may or may not have been run).

## Part 3: Tables Initially Reported Missing But Found

These tables were initially flagged as missing but DO have migrations (the earlier search used CREATE TABLE grep which missed lowercase/case variations):

| Table | Migration |
|-------|-----------|
| `marketing_posts` | `20260303000000_marketing_engine.sql` |
| `marketing_runs` | `20260303000000_marketing_engine.sql` |
| `marketing_assets` | `20260303000000_marketing_engine.sql` |
| `marketing_brand_accounts` | `20260303100000_marketing_brand_accounts.sql` |
| `ff_clip_index` | `20260328000000_clip_index_tables.sql` |
| `ff_clip_analysis` | `20260328000000_clip_index_tables.sql` |
| `ff_clip_candidates` | `20260328000000_clip_index_tables.sql` |
| `video_external_ids` | `023_video_ingestion.sql` |

## Part 4: Database Types Health

**File:** `lib/database.types.ts`
**Status:** SEVERELY STALE

| Issue | Detail |
|-------|--------|
| Tables defined | 11 (accounts, compliance_runs, concepts, events_log, hooks, iteration_groups, products, scripts, variants, video_events, videos) |
| Tables in codebase | 169 |
| Coverage | 6.5% |
| Encoding | UTF-16LE (unusual — should be UTF-8) |
| Used by code | NO — `supabaseAdmin` is created without `<Database>` type parameter |
| Impact | None currently — all queries are untyped strings |

**Should it be regenerated?** Not urgently. Since no code imports or uses the `Database` type, regenerating it wouldn't fix anything or break anything. It would only matter if you wanted to add typed Supabase queries in the future.

**Risk:** The real risk is that all 169 table references use untyped string-based queries (`.from('table_name')`). Column name typos won't be caught at compile time. This is a codebase-wide pattern, not something to fix piecemeal.

## Part 5: High-Risk Feature Impact

### CRITICAL Risk

**Email System** — `email_subscribers` + `email_queue`
- If these tables don't exist in prod DB, lead magnet capture silently fails, onboarding emails never send, CAN-SPAM unsubscribe breaks
- Supabase returns `{ error }` but code in `scheduler.ts` may not fully handle missing table errors
- **Severity:** HIGH — compliance and user onboarding impact

**Editing Suggestions** — `content_item_transcripts`
- `analyzeTranscript.ts` queries this table to fetch transcript segments
- If missing, editing suggestion generation silently returns empty results
- **Severity:** MODERATE — feature degradation, not crash

### MODERATE Risk

**Posting Queue** — `posting_queue`
- Migration exists but in wrong directory (`/web/migrations/` not `/web/supabase/migrations/`)
- May or may not have been manually run against prod DB
- If missing: nightly TikTok posting automation fails
- **Severity:** HIGH if not manually applied, NONE if already in prod DB

**Daily Digest** — `system_settings`
- Already has try-catch fallback
- **Severity:** LOW

### LOW Risk (Resolved)

All opportunity radar, clip index, marketing, and creator profile tables have proper migrations and are covered.

## Part 6: Repair Plan

### Tier 1: Must-Fix (Create Missing Migrations)

These 3 tables need migrations created:

1. **`email_subscribers`** — referenced by lead-magnet API and email unsubscribe system
2. **`email_queue`** — referenced by email scheduler (7 call sites)
3. **`content_item_transcripts`** — referenced by editing suggestion engine

### Tier 2: Verify Production State

These items need manual verification against the production Supabase database:

1. **`posting_queue`** — migration exists but in non-standard location. Check if table exists in prod.
2. **`task_queue`** — same situation
3. **`user_settings`** — only in MISSING_TABLES_CONSOLIDATED.sql. Check if applied.
4. **`system_settings`** — no migration but has try-catch fallback. Check if table exists in prod.
5. **`referrals`** — may be intentionally replaced by `referral_codes` + `referral_redemptions`

### Tier 3: Type System (Future)

1. Regenerate `database.types.ts` from live schema
2. Convert encoding to UTF-8
3. Consider adding `<Database>` type parameter to Supabase clients

### Tier 4: Cleanup

1. Move 3 migrations from `/web/migrations/` to `/web/supabase/migrations/` (or document they were manually applied)
2. Consider archiving `MISSING_TABLES_CONSOLIDATED.sql` since all 19 tables are now covered

## Part 7: Duplicate/Conflicting Migrations

| Table | Migrations | Issue |
|-------|-----------|-------|
| `winner_patterns` | 078, 119, 20260402000000 | 3 different schemas — 078=winners_bank addition, 119=standalone, 20260402000000=v2 normalized. All use `IF NOT EXISTS` so later ones win. |
| `webhooks` | 095, 101 | 101 extends 095. Both create table IF NOT EXISTS. |
| `notifications` | 017, 094 | 094 extends 017. |

These are not dangerous — `IF NOT EXISTS` prevents conflicts — but they add confusion.

## Part 8: Verification Checklist

- [ ] Check prod DB for `email_subscribers` table
- [ ] Check prod DB for `email_queue` table
- [ ] Check prod DB for `content_item_transcripts` table
- [ ] Check prod DB for `posting_queue` table
- [ ] Check prod DB for `system_settings` table
- [ ] Check prod DB for `user_settings` table
- [ ] Check prod DB for `referrals` table
- [ ] If any are missing, run the appropriate migration
- [ ] Verify `pnpm tsc --noEmit` passes (confirmed: clean)
- [ ] Consider regenerating `database.types.ts` from live schema
