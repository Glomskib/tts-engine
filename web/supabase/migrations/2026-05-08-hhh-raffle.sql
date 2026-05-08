-- HHH 2026 raffle entries — driven by /api/hhh-raffle/submit
-- One row per entry-earning event. Email aggregates across rows for total ticket count.
--
-- Sources of entries:
--   shop-ride   — Saturday False Chord ride sign-in, 1 per ride (max ~30 across 2026)
--   registration — automatic when rider pays for HHH 2026 (handled by Stripe webhook)
--   referral    — friend registers, both get +2
--   purchase    — bought tickets at $5 each at pre-party / day-of / post-party
--   volunteer   — 5 entries thank-you for volunteering Sept 12
--   sponsor-emp — 2 entries for sponsor's team members
--
-- Status flow:
--   auto_approved  — no human review needed (registration, volunteer, paid)
--   pending_review — photo proof submitted, Brandon reviews within 24h
--   approved       — human-reviewed and counted
--   rejected       — declined (fraud, duplicate, etc.)

CREATE TABLE IF NOT EXISTS public.hhh_raffle_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  shop_name    text,                    -- which shop ride or 'Referral bonus' or 'HHH registration'
  ride_date    date,                    -- when the entry-earning activity happened
  photo_url    text,                    -- supabase storage URL if photo proof provided
  source       text NOT NULL CHECK (source IN ('shop-ride','registration','referral','purchase','volunteer','sponsor-emp','manual')),
  status       text NOT NULL DEFAULT 'auto_approved' CHECK (status IN ('auto_approved','pending_review','approved','rejected')),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  reviewed_by  text                     -- admin email who approved/rejected
);

CREATE INDEX IF NOT EXISTS idx_hhh_raffle_email      ON public.hhh_raffle_entries (email);
CREATE INDEX IF NOT EXISTS idx_hhh_raffle_status     ON public.hhh_raffle_entries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hhh_raffle_dedup      ON public.hhh_raffle_entries (email, shop_name, ride_date);

-- Reviewers can see all; service role manages writes
ALTER TABLE public.hhh_raffle_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.hhh_raffle_entries FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Public read of own entries by email (for the "how many tickets do I have?" lookup)
CREATE POLICY "public_read_own" ON public.hhh_raffle_entries FOR SELECT TO anon USING (
  status IN ('auto_approved', 'approved')
);
