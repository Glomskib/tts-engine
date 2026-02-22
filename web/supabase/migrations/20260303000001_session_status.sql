-- 20260222000003_session_status.sql
-- Session validity tracking for external platform connections (TikTok Studio, etc.)
-- Supports TTL-based health checks and Mission Control monitoring.

CREATE TABLE IF NOT EXISTS public.ff_session_status (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    node_name text NOT NULL,                        -- e.g. 'mac-mini-1', 'vercel-cron'
    platform text NOT NULL DEFAULT 'tiktok',        -- 'tiktok', 'tiktok_content_api', etc.
    account_id uuid NULL,                           -- optional FK to tiktok_accounts
    is_valid boolean NOT NULL,
    reason text NULL,                               -- e.g. 'logged_in', 'redirected_to_login', 'token_expired'
    last_validated_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,                -- last_validated_at + TTL
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one status row per node+platform+account combo (upsert target)
CREATE UNIQUE INDEX IF NOT EXISTS ff_session_status_node_platform_account_idx
ON public.ff_session_status (node_name, platform, COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Index for Mission Control queries (latest status per platform)
CREATE INDEX IF NOT EXISTS ff_session_status_platform_valid_idx
ON public.ff_session_status (platform, is_valid, last_validated_at DESC);

-- Index for TTL expiry checks
CREATE INDEX IF NOT EXISTS ff_session_status_expires_at_idx
ON public.ff_session_status (expires_at)
WHERE is_valid = true;

COMMENT ON TABLE public.ff_session_status IS 'Tracks session/connection validity for external platforms (TikTok Studio, Content API). Used by Mission Control for health monitoring.';
COMMENT ON COLUMN public.ff_session_status.node_name IS 'Identifier for the runner node, e.g. mac-mini-1, vercel-cron';
COMMENT ON COLUMN public.ff_session_status.expires_at IS 'TTL expiry: last_validated_at + SESSION_TTL_HOURS';
