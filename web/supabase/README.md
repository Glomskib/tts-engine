# Supabase Migrations

This directory contains SQL migrations for the TTS Engine database schema.

## Required Manual Migrations

The following migrations must be applied manually in Supabase Dashboard (they cannot be auto-applied via the app):

### 009_video_events_audit.sql
Creates `public.video_events` table used by Phase 9 observability.

**If Admin UI shows "video_events table not yet migrated":**
1. Open Supabase Dashboard → SQL Editor
2. Copy and run the contents of `migrations/009_video_events_audit.sql`
3. Restart dev server

### 010_videos_editor_claim.sql
Adds `claimed_by`, `claimed_at`, `claim_expires_at` columns to videos table for editor workflow.

**If Admin UI shows "Claim columns not yet migrated":**
1. Open Supabase Dashboard → SQL Editor
2. Copy and run the contents of `migrations/010_videos_editor_claim.sql`
3. Restart dev server

Note: Without this migration, claim/release still works via in-memory fallback, but "Release stale claims" and persistent claims require the database columns.

## Migration Order

| Migration | Description | Auto-applied |
|-----------|-------------|--------------|
| 001 | Products schema | Manual |
| 002 | Concepts schema | Manual |
| 003 | Hooks concept_id | Manual |
| 006 | Video performance | Manual |
| 007 | Winner scaling | Manual |
| 008 | Videos unique queue constraint | Manual |
| 009 | Video events audit table | Manual |
| 010 | Videos editor claim fields | Manual |

## Verifying Migrations

To check if a table exists in Supabase:
```sql
SELECT to_regclass('public.video_events') AS table_exists;
```

Returns `public.video_events` if exists, `NULL` if not.

To check if claim columns exist:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'videos' AND column_name IN ('claimed_by', 'claimed_at', 'claim_expires_at');
```

Should return 3 rows if migration 010 is applied.
