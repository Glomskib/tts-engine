-- This migration was renamed to 20260501000001_tiktok_oauth_accounts.sql to
-- avoid colliding with the existing public.tiktok_accounts table (which is the
-- account-CMS surface for handles/posting frequencies, not OAuth tokens).
-- This file is kept as a placeholder so any tooling that already recorded its
-- name still finds something. Apply the renamed file instead.
SELECT 1;
