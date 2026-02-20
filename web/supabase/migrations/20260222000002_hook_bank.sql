-- ============================================================
-- Hook Bank: content library for TikTok hooks
-- Migration: 20260222_hook_bank
-- Table: hook_bank_items
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hook_bank_items (
  id serial PRIMARY KEY,
  category text NOT NULL,
  hook_text text NOT NULL,
  angle text,
  compliance_notes text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  source_doc_id uuid,
  lane text DEFAULT 'FlashFlow',
  tags text[] DEFAULT '{}'::text[]
);

CREATE INDEX IF NOT EXISTS idx_hook_bank_items_category ON public.hook_bank_items (category);
CREATE INDEX IF NOT EXISTS idx_hook_bank_items_status ON public.hook_bank_items (status);
CREATE INDEX IF NOT EXISTS idx_hook_bank_items_tags ON public.hook_bank_items USING gin (tags);

ALTER TABLE public.hook_bank_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hook_bank_items_service_only" ON public.hook_bank_items;
CREATE POLICY "hook_bank_items_service_only" ON public.hook_bank_items
  FOR ALL USING (public.is_service_role());
