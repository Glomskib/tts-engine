-- 114: Add review columns for admin video review workflow
ALTER TABLE videos ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS review_notes TEXT;

COMMENT ON COLUMN videos.rejection_reason IS 'Reason for rejection during admin review';
COMMENT ON COLUMN videos.review_notes IS 'Admin notes added during review (approve or reject)';
