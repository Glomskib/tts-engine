ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS main_tour_seen BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS main_tour_completed_at TIMESTAMPTZ;
