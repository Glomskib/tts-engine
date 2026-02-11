-- Migration 104: Script of the Day
-- Smart daily script recommendation with winner remix, rotation scoring, and SMS delivery

CREATE TABLE IF NOT EXISTS script_of_the_day (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  script_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Product info
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_brand TEXT,
  product_category TEXT,

  -- Script content
  hook TEXT NOT NULL DEFAULT '',
  full_script JSONB NOT NULL DEFAULT '{}',
  filming_tips JSONB DEFAULT '{}',

  -- Selection intelligence
  selection_reasons JSONB DEFAULT '[]',
  compound_score NUMERIC(7,2) DEFAULT 0,
  ai_score JSONB,

  -- Winner remix
  winner_remix_id UUID,
  winner_remix_hook TEXT,

  -- Posting suggestion
  suggested_account_id UUID,
  suggested_account_name TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'accepted', 'rejected', 'filmed', 'posted')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sotd_user_date ON script_of_the_day(user_id, script_date DESC);
CREATE INDEX IF NOT EXISTS idx_sotd_product ON script_of_the_day(product_id);

ALTER TABLE script_of_the_day ENABLE ROW LEVEL SECURITY;
