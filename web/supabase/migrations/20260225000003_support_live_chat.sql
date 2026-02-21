-- Add source and visitor_email columns to support_threads for live chat support
ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS source text DEFAULT 'dashboard';
ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS visitor_email text;
