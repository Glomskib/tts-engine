-- Add internal notes column to ff_feedback_items for ops team annotations
ALTER TABLE public.ff_feedback_items ADD COLUMN IF NOT EXISTS notes text;
