# Migration Status

## Overview
93 migration files in `web/supabase/migrations/`. All migrations through 090 are confirmed applied in production Supabase. Migrations 091-102 and 20260131 were created during overnight build sessions and need manual verification.

## Applied in Production (Confirmed)
- 001-090: All applied and verified working

## Needs Verification (Created Recently)
| Migration | Description | Status |
|-----------|-------------|--------|
| 091_tiktok_accounts.sql | TikTok accounts table | Likely applied (accounts page works) |
| 092_content_calendar.sql | Content calendar table | Needs verification |
| 093_competitors.sql | Competitors tracking table | Needs verification |
| 094_notifications.sql | Notifications table | Needs verification |
| 095_webhooks.sql | Webhooks table | Needs verification |
| 096_custom_templates.sql | Custom templates table | Needs verification |
| 097_ab_test_variations.sql | A/B test variations | Needs verification |
| 098_trending_hashtags_sounds.sql | Trends data tables | Needs verification |
| 099_revenue_tracking.sql | Revenue tracking columns | Needs verification |
| 100_fix_triggers.sql | Trigger fixes | Needs verification |
| 101_webhooks_and_templates.sql | Webhook + template updates | Needs verification |
| 102_ab_variations_trending_revenue.sql | Combined updates | Needs verification |
| 20260131_generated_images.sql | Generated images table | Needs verification |

## Tables Referenced by Admin Pages
All tables referenced by admin page components have corresponding migrations:
- `videos`, `products`, `brands`, `scripts`, `saved_skits` — core tables (001-041)
- `saved_hooks`, `winners_bank` — winners system (030, 078, 082)
- `posting_accounts`, `team_members` — production workflow (029)
- `api_keys` — auth system (088)
- `tiktok_stats`, `video_performance` view — stats (090)
- `activity_log` — user activity (052)
- `events_log` — audit events (009)
- `audit_log` — audit trail (038)
- `collections` — content collections (051)
- `hook_suggestions` — AI hooks (035)

## New Migrations (Created This Session)
None yet. Will be saved to files as needed (not auto-applied).
