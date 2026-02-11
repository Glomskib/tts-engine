-- Migration 107: Add full_script JSONB to content_package_items
-- Stores AI-expanded full UGC scripts (hook, setup, body, CTA, filming notes, etc.)

ALTER TABLE content_package_items
  ADD COLUMN IF NOT EXISTS full_script JSONB DEFAULT NULL;

COMMENT ON COLUMN content_package_items.full_script IS
  'AI-generated full filmable script: {hook, setup, body, cta, on_screen_text, filming_notes, persona, sales_approach, estimated_length}';
