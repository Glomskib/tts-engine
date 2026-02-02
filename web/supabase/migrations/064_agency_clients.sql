-- 064_agency_clients.sql
-- Agency clients table for managing sub-accounts

CREATE TABLE IF NOT EXISTS public.agency_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  website VARCHAR(500),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'churned')),
  subscription_type VARCHAR(50) DEFAULT 'video_editing',
  plan_name VARCHAR(50),
  videos_quota INTEGER DEFAULT 30,
  videos_used INTEGER DEFAULT 0,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agency_clients_agency ON public.agency_clients(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_clients_status ON public.agency_clients(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_agency_clients_email ON public.agency_clients(email);

-- Enable RLS
ALTER TABLE public.agency_clients ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Agency can manage own clients
CREATE POLICY "Agency can manage own clients" ON public.agency_clients
  FOR ALL USING (auth.uid() = agency_id);

-- Admin can view all
CREATE POLICY "Admin can view all clients" ON public.agency_clients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Update trigger
CREATE OR REPLACE FUNCTION public.update_agency_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_agency_clients_updated_at ON public.agency_clients;
CREATE TRIGGER tr_agency_clients_updated_at
BEFORE UPDATE ON public.agency_clients
FOR EACH ROW EXECUTE FUNCTION public.update_agency_clients_updated_at();

-- Link video_requests to agency clients (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'video_requests'
    AND column_name = 'agency_client_id'
  ) THEN
    ALTER TABLE public.video_requests ADD COLUMN agency_client_id UUID REFERENCES public.agency_clients(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_video_requests_agency_client ON public.video_requests(agency_client_id);
  END IF;
END $$;

-- Comments
COMMENT ON TABLE public.agency_clients IS 'Clients managed by agency accounts';
COMMENT ON COLUMN public.agency_clients.status IS 'Client status: active, paused, or churned';
COMMENT ON COLUMN public.agency_clients.videos_quota IS 'Monthly video quota for this client';
