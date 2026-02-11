-- ============================================================================
-- MIGRATION: Add Product Image Support
-- Task 85: Product Image Support + Bolt-Facing API Endpoint
-- ============================================================================

-- Add product image columns
ALTER TABLE products
ADD COLUMN IF NOT EXISTS product_image_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_image ON products(product_image_url)
WHERE product_image_url IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN products.product_image_url IS 'Primary hero image URL for video generation (Bolt AI)';
COMMENT ON COLUMN products.images IS 'Additional product images gallery (JSONB array of URLs)';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check the columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'products'
AND column_name IN ('product_image_url', 'images');

-- Sample query to verify
SELECT id, name, product_image_url, images
FROM products
LIMIT 5;
