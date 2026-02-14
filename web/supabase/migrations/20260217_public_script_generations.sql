-- Track public script generator usage for rate limiting and analytics
CREATE TABLE IF NOT EXISTS public_script_generations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  persona_id text,
  risk_tier text DEFAULT 'BALANCED',
  score smallint,
  created_at timestamptz DEFAULT now()
);

-- Index for daily rate limit checks
CREATE INDEX IF NOT EXISTS idx_public_script_gen_user_date
  ON public_script_generations (user_id, created_at)
  WHERE user_id IS NOT NULL;

-- RLS: users can only see their own generations
ALTER TABLE public_script_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own generations"
  ON public_script_generations FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert (API route uses supabaseAdmin)
CREATE POLICY "Service role can insert"
  ON public_script_generations FOR INSERT
  WITH CHECK (true);
