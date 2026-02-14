-- Track transcribe API usage for rate limiting + analytics
CREATE TABLE transcribe_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ip text NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  url_transcribed text NOT NULL,
  processing_time_ms integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_transcribe_usage_ip_date ON transcribe_usage (ip, created_at);
CREATE INDEX idx_transcribe_usage_user_date ON transcribe_usage (user_id, created_at);

-- RLS: only service role inserts (from API route via supabaseAdmin)
ALTER TABLE transcribe_usage ENABLE ROW LEVEL SECURITY;
