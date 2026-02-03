-- Add pain_points JSONB column to products table
-- This stores AI-generated pain points for script generation

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS pain_points jsonb;

-- Add a comment describing the column structure
COMMENT ON COLUMN public.products.pain_points IS 'Array of pain points: [{point: string, category: emotional|practical|social|financial, intensity: mild|moderate|severe, hook_angle: string}]';

-- Create a GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_products_pain_points
ON public.products USING gin (pain_points);
