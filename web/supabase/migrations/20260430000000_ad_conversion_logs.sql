-- Ad-conversion outbound request logs.
-- Every server-to-server call from dispatchAdConversionsForSession writes one row.
-- Surfaced at /admin/ad-conversions for debugging Pixel/Events API/Ads integrations.

CREATE TABLE IF NOT EXISTS public.ad_conversion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'tiktok', 'google')),
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  http_status INTEGER,
  request_payload JSONB,
  response_body JSONB,
  error TEXT,
  correlation_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_ad_conversion_logs_event_id
  ON public.ad_conversion_logs(event_id);

CREATE INDEX IF NOT EXISTS idx_ad_conversion_logs_created_at
  ON public.ad_conversion_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_conversion_logs_platform_status
  ON public.ad_conversion_logs(platform, status, created_at DESC);

-- Service role owns writes; admin UI reads through supabaseAdmin.
ALTER TABLE public.ad_conversion_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ad_conversion_logs IS
  'Outbound server-side ad-conversion API calls (Meta CAPI, TikTok Events API, Google Ads API). One row per platform per purchase.';
