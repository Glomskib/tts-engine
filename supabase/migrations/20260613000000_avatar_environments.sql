-- Migration: avatar_environments
-- Created: 2026-06-13
--
-- 1. New table: global cache of AI-generated environment background images.
--    One row per preset_id. 'plain' never has a row (resolves to solid color).
-- 2. New column on brand_profiles: persists a user's environment choice as JSON.
--
-- Additive only — no alters/drops to existing data.

CREATE TABLE IF NOT EXISTS avatar_environment_assets (
  preset_id  text         PRIMARY KEY,
  image_url  text         NOT NULL,
  created_at timestamptz  DEFAULT now()
);

ALTER TABLE brand_profiles
  ADD COLUMN IF NOT EXISTS avatar_environment_json jsonb;
