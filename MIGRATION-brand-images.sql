-- ============================================================================
-- MIGRATION: Add Brand Image Support
-- Task 85 Phase 7: Brand Image Support
-- ============================================================================

-- Add brand image column
ALTER TABLE brands
ADD COLUMN IF NOT EXISTS brand_image_url TEXT DEFAULT NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_brands_image ON brands(brand_image_url)
WHERE brand_image_url IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN brands.brand_image_url IS 'Brand logo/image URL for video generation and product displays';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'brands'
AND column_name = 'brand_image_url';

-- Sample query to verify
SELECT id, name, brand_image_url
FROM brands
LIMIT 5;
