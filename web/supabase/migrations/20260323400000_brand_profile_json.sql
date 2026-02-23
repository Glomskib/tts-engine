-- Migration 128: Add brand_profile_json JSONB column to brands
-- Stores: category, product_types, key_angles, compliance_notes, claims_to_avoid

ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_profile_json JSONB DEFAULT '{}';

COMMENT ON COLUMN brands.brand_profile_json IS 'Structured brand profile: category, product_types, key_angles, compliance_notes, claims_to_avoid';
