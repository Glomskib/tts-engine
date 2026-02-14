-- Brand retainer/partnership tracking columns
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS retainer_type TEXT
  CHECK (retainer_type IN ('retainer', 'bonus', 'challenge', 'affiliate', 'none'))
  DEFAULT 'none';
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS retainer_video_goal INTEGER DEFAULT 0;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS retainer_period_start DATE;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS retainer_period_end DATE;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS retainer_payout_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS retainer_bonus_tiers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS retainer_notes TEXT;

-- Seed Forest Leaf retainer data
UPDATE public.brands
SET
  retainer_type = 'retainer',
  retainer_video_goal = 50,
  retainer_period_start = '2026-02-01',
  retainer_period_end = '2026-02-28',
  retainer_payout_amount = 500,
  retainer_bonus_tiers = '[
    {"videos": 50, "payout": 500, "label": "Base retainer"},
    {"gmv": 5000, "bonus": 500, "label": "GMV bonus tier 1"},
    {"gmv": 10000, "bonus": 1000, "label": "GMV bonus tier 2"},
    {"gmv": 20000, "bonus": 2000, "label": "GMV bonus tier 3"}
  ]'::jsonb,
  retainer_notes = 'Feb 1-28, 2026 content challenge. $500 base + GMV bonuses.'
WHERE LOWER(name) = 'forest leaf';
