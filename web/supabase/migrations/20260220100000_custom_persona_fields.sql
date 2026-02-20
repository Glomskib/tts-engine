-- Add custom persona builder fields to audience_personas
-- These support the "Create Your Own Customer" feature with detailed personal attributes

ALTER TABLE audience_personas
ADD COLUMN IF NOT EXISTS marital_status TEXT,
ADD COLUMN IF NOT EXISTS sexual_orientation TEXT,
ADD COLUMN IF NOT EXISTS kids_count TEXT,
ADD COLUMN IF NOT EXISTS job_title TEXT,
ADD COLUMN IF NOT EXISTS education TEXT,
ADD COLUMN IF NOT EXISTS employment_status TEXT,
ADD COLUMN IF NOT EXISTS goals TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS struggles TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS daily_routine TEXT,
ADD COLUMN IF NOT EXISTS shopping_habits TEXT,
ADD COLUMN IF NOT EXISTS full_description TEXT;
