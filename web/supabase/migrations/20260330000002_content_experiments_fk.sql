-- Add deferred FK from content_experiments.content_item_id -> content_items(id)
-- Deferred from 20260304300000_content_experiments.sql because content_items didn't exist yet.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_ce_content_item' AND table_name = 'content_experiments'
  ) THEN
    ALTER TABLE content_experiments
      ADD CONSTRAINT fk_ce_content_item FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE;
  END IF;
END $$;
