-- Phase 7: Winner Scaling + Controlled Iteration
-- Add variant lineage and scaling batch support

-- Add lineage and scaling columns to variants table
DO $$
BEGIN
  -- Add parent_variant_id for variant lineage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'parent_variant_id') THEN
    ALTER TABLE public.variants ADD COLUMN parent_variant_id uuid NULL REFERENCES public.variants(id) ON DELETE SET NULL;
  END IF;
  
  -- Add iteration_group_id for scaling batches
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'iteration_group_id') THEN
    ALTER TABLE public.variants ADD COLUMN iteration_group_id uuid NULL;
  END IF;
  
  -- Add locked flag to prevent modifications
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'locked') THEN
    ALTER TABLE public.variants ADD COLUMN locked boolean NOT NULL DEFAULT false;
  END IF;
  
  -- Add change_type for scaling variants
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'change_type') THEN
    ALTER TABLE public.variants ADD COLUMN change_type text NULL;
  END IF;
  
  -- Add change_note for scaling details
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'change_note') THEN
    ALTER TABLE public.variants ADD COLUMN change_note text NULL;
  END IF;
END $$;

-- Create iteration_groups table for scaling batches
CREATE TABLE IF NOT EXISTS public.iteration_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  plan_json jsonb NULL,
  status text DEFAULT 'processing',
  error_message text NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraint for iteration_group_id after table creation
DO $$
BEGIN
  -- Check if the foreign key constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_variants_iteration_group_id' 
    AND table_name = 'variants'
  ) THEN
    ALTER TABLE public.variants 
    ADD CONSTRAINT fk_variants_iteration_group_id 
    FOREIGN KEY (iteration_group_id) REFERENCES public.iteration_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_variants_parent ON public.variants(parent_variant_id);
CREATE INDEX IF NOT EXISTS idx_variants_iteration_group ON public.variants(iteration_group_id);
CREATE INDEX IF NOT EXISTS idx_iteration_groups_winner ON public.iteration_groups(winner_variant_id);
CREATE INDEX IF NOT EXISTS idx_iteration_groups_concept ON public.iteration_groups(concept_id);
CREATE INDEX IF NOT EXISTS idx_iteration_groups_status ON public.iteration_groups(status);
