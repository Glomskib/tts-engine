-- Add render_image_url to videos table for audit trail
-- Records the exact image URL sent to Runway before the render call
ALTER TABLE videos ADD COLUMN IF NOT EXISTS render_image_url TEXT;

COMMENT ON COLUMN videos.render_image_url IS 'Exact image URL sent to Runway for rendering (saved before the API call for audit trail)';
