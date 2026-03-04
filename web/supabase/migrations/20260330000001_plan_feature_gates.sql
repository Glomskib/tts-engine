-- Content Items System — Plan Feature Gates
-- Adds content_items, creator_briefs, drive_automation, editor_notes_ai, posting_automation features

-- Free: content_items only
INSERT INTO plan_features (plan_name, feature_key, is_enabled, limit_value) VALUES
  ('free', 'content_items', true, NULL),
  ('free', 'creator_briefs', false, NULL),
  ('free', 'drive_automation', false, NULL),
  ('free', 'editor_notes_ai', false, NULL),
  ('free', 'posting_automation', false, NULL)
ON CONFLICT (plan_name, feature_key) DO NOTHING;

-- Creator Lite: content_items + posting
INSERT INTO plan_features (plan_name, feature_key, is_enabled, limit_value) VALUES
  ('creator_lite', 'content_items', true, NULL),
  ('creator_lite', 'creator_briefs', false, NULL),
  ('creator_lite', 'drive_automation', false, NULL),
  ('creator_lite', 'editor_notes_ai', false, NULL),
  ('creator_lite', 'posting_automation', true, NULL)
ON CONFLICT (plan_name, feature_key) DO NOTHING;

-- Creator Pro: all features
INSERT INTO plan_features (plan_name, feature_key, is_enabled, limit_value) VALUES
  ('creator_pro', 'content_items', true, NULL),
  ('creator_pro', 'creator_briefs', true, NULL),
  ('creator_pro', 'drive_automation', true, NULL),
  ('creator_pro', 'editor_notes_ai', true, NULL),
  ('creator_pro', 'posting_automation', true, NULL)
ON CONFLICT (plan_name, feature_key) DO NOTHING;

-- Brand: all features
INSERT INTO plan_features (plan_name, feature_key, is_enabled, limit_value) VALUES
  ('brand', 'content_items', true, NULL),
  ('brand', 'creator_briefs', true, NULL),
  ('brand', 'drive_automation', true, NULL),
  ('brand', 'editor_notes_ai', true, NULL),
  ('brand', 'posting_automation', true, NULL)
ON CONFLICT (plan_name, feature_key) DO NOTHING;

-- Agency: all features
INSERT INTO plan_features (plan_name, feature_key, is_enabled, limit_value) VALUES
  ('agency', 'content_items', true, NULL),
  ('agency', 'creator_briefs', true, NULL),
  ('agency', 'drive_automation', true, NULL),
  ('agency', 'editor_notes_ai', true, NULL),
  ('agency', 'posting_automation', true, NULL)
ON CONFLICT (plan_name, feature_key) DO NOTHING;

-- Business: all features
INSERT INTO plan_features (plan_name, feature_key, is_enabled, limit_value) VALUES
  ('business', 'content_items', true, NULL),
  ('business', 'creator_briefs', true, NULL),
  ('business', 'drive_automation', true, NULL),
  ('business', 'editor_notes_ai', true, NULL),
  ('business', 'posting_automation', true, NULL)
ON CONFLICT (plan_name, feature_key) DO NOTHING;
