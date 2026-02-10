-- Migration 099: Revenue & ROI Tracking Columns
-- Adds estimated/actual revenue and production cost to videos for ROI calculation

ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS estimated_revenue DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS actual_revenue DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS production_cost DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN public.videos.estimated_revenue IS 'Estimated revenue from this video (projected)';
COMMENT ON COLUMN public.videos.actual_revenue IS 'Actual confirmed revenue from this video';
COMMENT ON COLUMN public.videos.production_cost IS 'Cost to produce this video (VA, editing, etc)';
