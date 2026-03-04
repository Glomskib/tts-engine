-- Add performance_score grade to content_item_posts
ALTER TABLE public.content_item_posts
  ADD COLUMN IF NOT EXISTS performance_score TEXT;
