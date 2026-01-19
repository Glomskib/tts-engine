-- Phase 6: Video Performance Tracking and Winner Promotion
-- Create video_metrics table for daily performance snapshots

CREATE TABLE IF NOT EXISTS public.video_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  account_id uuid,
  metric_date date NOT NULL,
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  saves integer DEFAULT 0,
  clicks integer DEFAULT 0,
  orders integer DEFAULT 0,
  revenue numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(video_id, metric_date)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_video_metrics_account_date ON public.video_metrics(account_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_video_metrics_video_date ON public.video_metrics(video_id, metric_date);

-- Add performance tracking columns to videos table (if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'views_total') THEN
    ALTER TABLE public.videos ADD COLUMN views_total integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'likes_total') THEN
    ALTER TABLE public.videos ADD COLUMN likes_total integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'comments_total') THEN
    ALTER TABLE public.videos ADD COLUMN comments_total integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'shares_total') THEN
    ALTER TABLE public.videos ADD COLUMN shares_total integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'revenue_total') THEN
    ALTER TABLE public.videos ADD COLUMN revenue_total numeric DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'orders_total') THEN
    ALTER TABLE public.videos ADD COLUMN orders_total integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'last_metric_at') THEN
    ALTER TABLE public.videos ADD COLUMN last_metric_at timestamptz;
  END IF;
END $$;

-- Add winner promotion columns to variants table (if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'score') THEN
    ALTER TABLE public.variants ADD COLUMN score numeric DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'is_winner') THEN
    ALTER TABLE public.variants ADD COLUMN is_winner boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'winner_reason') THEN
    ALTER TABLE public.variants ADD COLUMN winner_reason text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'promoted_at') THEN
    ALTER TABLE public.variants ADD COLUMN promoted_at timestamptz;
  END IF;
END $$;
