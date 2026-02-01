-- 057_video_editing_service.sql
-- Video Editing Service: Showcase, Clients, Requests, Inquiries

-- ============================================================================
-- Showcase Videos - Public portfolio of edited videos
-- ============================================================================

CREATE TABLE IF NOT EXISTS showcase_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT NOT NULL,
  tiktok_url TEXT,
  instagram_url TEXT,
  youtube_url TEXT,
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  client_name TEXT,
  category TEXT, -- e.g., 'ugc', 'product', 'testimonial', 'educational'
  tags TEXT[] DEFAULT '{}',
  is_featured BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_showcase_videos_public ON showcase_videos(is_public, is_featured, display_order);
CREATE INDEX idx_showcase_videos_category ON showcase_videos(category) WHERE is_public = true;

-- ============================================================================
-- Video Editing Clients - Companies/individuals using our editing service
-- ============================================================================

CREATE TABLE IF NOT EXISTS video_editing_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_name TEXT,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  status TEXT DEFAULT 'pending', -- pending, active, paused, cancelled
  plan_type TEXT DEFAULT 'starter', -- starter, growth, enterprise
  videos_per_month INTEGER DEFAULT 10,
  notes TEXT,
  onboarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_video_clients_user ON video_editing_clients(user_id);
CREATE INDEX idx_video_clients_status ON video_editing_clients(status);
CREATE INDEX idx_video_clients_email ON video_editing_clients(contact_email);

-- ============================================================================
-- Video Editing Requests - Individual video production requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS video_editing_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES video_editing_clients(id) ON DELETE CASCADE,
  skit_id UUID REFERENCES saved_skits(id) ON DELETE SET NULL,

  -- Request details
  title TEXT NOT NULL,
  script TEXT NOT NULL,
  brief TEXT,
  reference_urls TEXT[] DEFAULT '{}',

  -- Status tracking
  status TEXT DEFAULT 'submitted', -- submitted, in_review, in_production, review_ready, revision_requested, approved, delivered
  priority TEXT DEFAULT 'normal', -- low, normal, high, rush
  assigned_editor_id UUID REFERENCES auth.users(id),

  -- Deliverables
  draft_video_url TEXT,
  final_video_url TEXT,
  revision_count INTEGER DEFAULT 0,
  max_revisions INTEGER DEFAULT 2,

  -- Feedback
  client_feedback TEXT,
  editor_notes TEXT,

  -- Timestamps
  due_date TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_video_requests_client ON video_editing_requests(client_id);
CREATE INDEX idx_video_requests_status ON video_editing_requests(status);
CREATE INDEX idx_video_requests_editor ON video_editing_requests(assigned_editor_id);
CREATE INDEX idx_video_requests_priority ON video_editing_requests(priority, status);

-- ============================================================================
-- Video Service Inquiries - Contact form submissions
-- ============================================================================

CREATE TABLE IF NOT EXISTS video_service_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  videos_per_month TEXT, -- freeform, e.g., "10-20", "50+"
  budget_range TEXT,
  content_types TEXT[] DEFAULT '{}', -- e.g., ['ugc', 'product demos', 'testimonials']
  notes TEXT,
  source TEXT, -- landing_page, referral, ad, etc.
  status TEXT DEFAULT 'new', -- new, contacted, qualified, proposal_sent, won, lost
  assigned_to UUID REFERENCES auth.users(id),
  follow_up_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_inquiries_status ON video_service_inquiries(status);
CREATE INDEX idx_service_inquiries_email ON video_service_inquiries(email);
CREATE INDEX idx_service_inquiries_created ON video_service_inquiries(created_at DESC);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE showcase_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_editing_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_editing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_service_inquiries ENABLE ROW LEVEL SECURITY;

-- Showcase: Public can view public videos
CREATE POLICY "Public can view public showcase" ON showcase_videos
  FOR SELECT USING (is_public = true);

-- Showcase: Service role has full access
CREATE POLICY "Service role full access to showcase" ON showcase_videos
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Clients: Users can view their own client record
CREATE POLICY "Users view own client record" ON video_editing_clients
  FOR SELECT USING (auth.uid() = user_id);

-- Clients: Service role has full access
CREATE POLICY "Service role full access to clients" ON video_editing_clients
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Requests: Clients can view their own requests
CREATE POLICY "Clients view own requests" ON video_editing_requests
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM video_editing_clients WHERE user_id = auth.uid()
    )
  );

-- Requests: Clients can insert new requests
CREATE POLICY "Clients can create requests" ON video_editing_requests
  FOR INSERT WITH CHECK (
    client_id IN (
      SELECT id FROM video_editing_clients WHERE user_id = auth.uid()
    )
  );

-- Requests: Service role has full access
CREATE POLICY "Service role full access to requests" ON video_editing_requests
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Inquiries: Anyone can submit
CREATE POLICY "Anyone can submit inquiry" ON video_service_inquiries
  FOR INSERT WITH CHECK (true);

-- Inquiries: Service role has full access
CREATE POLICY "Service role full access to inquiries" ON video_service_inquiries
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_showcase_videos_updated_at
  BEFORE UPDATE ON showcase_videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_editing_clients_updated_at
  BEFORE UPDATE ON video_editing_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_editing_requests_updated_at
  BEFORE UPDATE ON video_editing_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_service_inquiries_updated_at
  BEFORE UPDATE ON video_service_inquiries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
