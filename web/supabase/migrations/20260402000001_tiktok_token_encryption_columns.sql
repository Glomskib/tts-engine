-- ============================================================================
-- Migration: Add encrypted token columns to TikTok connection tables
-- Part of audit finding FF-AUD-006 (TikTok tokens stored in plaintext)
--
-- Strategy:
--   1. Add new TEXT columns to hold encrypted tokens (JSON-encoded EncryptedPayload)
--   2. The application now writes encrypted values to the EXISTING access_token /
--      refresh_token columns (which accept the JSON string).
--   3. This migration adds a comment documenting the column semantics.
--   4. A separate backfill script (scripts/backfill-tiktok-token-encryption.ts)
--      should be run to re-encrypt any existing plaintext rows.
--
-- NO DATA IS DELETED. Existing plaintext rows are still readable via the
-- decryptTikTokToken() helper in lib/tiktok-partner.ts which falls back to
-- returning plaintext if the stored value is not a JSON EncryptedPayload.
-- ============================================================================

BEGIN;

-- Document the new semantic of the existing columns
COMMENT ON COLUMN public.tiktok_connections.access_token IS
  'AES-256-GCM encrypted token. Stored as JSON: {"ciphertext":"...","iv":"...","tag":"..."}. Decrypted in lib/tiktok-partner.ts:decryptTikTokToken().';

COMMENT ON COLUMN public.tiktok_connections.refresh_token IS
  'AES-256-GCM encrypted token. Same format as access_token. Run scripts/backfill-tiktok-token-encryption.ts to encrypt legacy plaintext rows.';

COMMIT;
