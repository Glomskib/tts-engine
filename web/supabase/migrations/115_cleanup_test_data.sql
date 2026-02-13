-- Migration 115: Clean up test/dummy data
-- WARNING: Review carefully before applying. This migration deletes data.
-- Real products to KEEP: Hop Water, Big Boy Bundle, Milk Thistle, Magnesium,
--   OxyEnergy Milk Thistle, Hop Water Variety, and any other real products.
--
-- DO NOT RUN AUTOMATICALLY — Brandon will review and apply manually.

BEGIN;

-- Step 1: Delete video records referencing test products
DELETE FROM videos
WHERE product_id IN (
  SELECT id FROM products
  WHERE name ILIKE '%test%'
     OR name ILIKE '%default%'
     OR name ILIKE '%dummy%'
     OR name ILIKE '%sample%'
);

-- Step 2: Delete saved skits referencing test products
DELETE FROM saved_skits
WHERE product_id IN (
  SELECT id FROM products
  WHERE name ILIKE '%test%'
     OR name ILIKE '%default%'
     OR name ILIKE '%dummy%'
     OR name ILIKE '%sample%'
);

-- Step 3: Delete content package items referencing test products
DELETE FROM content_package_items
WHERE product_id IN (
  SELECT id FROM products
  WHERE name ILIKE '%test%'
     OR name ILIKE '%default%'
     OR name ILIKE '%dummy%'
     OR name ILIKE '%sample%'
);

-- Step 4: Delete the test products themselves
-- Excludes real products by name check
DELETE FROM products
WHERE (
  name ILIKE '%test%'
  OR name ILIKE '%default%'
  OR name ILIKE '%dummy%'
  OR name ILIKE '%sample%'
)
AND name NOT ILIKE '%Hop Water%'
AND name NOT ILIKE '%Big Boy Bundle%'
AND name NOT ILIKE '%Milk Thistle%'
AND name NOT ILIKE '%Magnesium%'
AND name NOT ILIKE '%OxyEnergy%'
AND name NOT ILIKE '%Hop Water Variety%';

COMMIT;
