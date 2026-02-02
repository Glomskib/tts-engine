-- ============================================================================
-- VIDEO REQUEST LINKING & DENORMALIZED CLIENT REQUESTS
-- Links videos to client requests, orgs, and projects for fast queries
-- ============================================================================

-- PART 1: Add columns to videos table
-- ============================================================================

-- Add columns to link videos to client requests, orgs, and projects
ALTER TABLE videos ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS request_id UUID;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS client_user_id UUID REFERENCES auth.users(id);

-- Add indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_videos_org_id ON videos(org_id);
CREATE INDEX IF NOT EXISTS idx_videos_project_id ON videos(project_id);
CREATE INDEX IF NOT EXISTS idx_videos_request_id ON videos(request_id);
CREATE INDEX IF NOT EXISTS idx_videos_client ON videos(client_user_id);

-- Add SLA tracking fields
ALTER TABLE videos ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMPTZ;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS sla_priority VARCHAR(20) DEFAULT 'standard'; -- rush, priority, standard
ALTER TABLE videos ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT FALSE;

-- Index for SLA queries
CREATE INDEX IF NOT EXISTS idx_videos_sla_deadline ON videos(sla_deadline) WHERE sla_breached = FALSE;


-- PART 2: Create denormalized client_requests table
-- ============================================================================

-- Denormalized client requests for fast queries
CREATE TABLE IF NOT EXISTS client_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Client info
  org_id UUID NOT NULL,
  project_id UUID,
  client_user_id UUID REFERENCES auth.users(id),

  -- Request details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  request_type VARCHAR(50) DEFAULT 'new_video', -- 'new_video', 'revision', 'edit'

  -- Content details
  script_content TEXT,
  assets_url TEXT, -- Google Drive link to raw assets
  brand_guidelines TEXT,
  special_instructions TEXT,

  -- Timing
  priority VARCHAR(20) DEFAULT 'standard', -- rush (24h), priority (48h), standard (72h)
  deadline TIMESTAMPTZ,
  sla_hours INT DEFAULT 72,

  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, review, revision, completed, cancelled
  assigned_to UUID REFERENCES auth.users(id),

  -- Delivery
  video_id UUID, -- Links to completed video
  delivery_url TEXT, -- Google Drive link to final video

  -- Feedback
  client_feedback TEXT,
  revision_count INT DEFAULT 0,
  client_approved BOOLEAN DEFAULT FALSE,
  client_approved_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes for client_requests
CREATE INDEX IF NOT EXISTS idx_client_requests_org ON client_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_client_requests_project ON client_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_client_requests_client ON client_requests(client_user_id);
CREATE INDEX IF NOT EXISTS idx_client_requests_status ON client_requests(status);
CREATE INDEX IF NOT EXISTS idx_client_requests_assigned ON client_requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_client_requests_deadline ON client_requests(deadline);
CREATE INDEX IF NOT EXISTS idx_client_requests_video ON client_requests(video_id);
CREATE INDEX IF NOT EXISTS idx_client_requests_created ON client_requests(created_at DESC);

-- Partial index for active requests (not completed/cancelled)
CREATE INDEX IF NOT EXISTS idx_client_requests_active
  ON client_requests(deadline, priority)
  WHERE status NOT IN ('completed', 'cancelled');

-- Enable RLS
ALTER TABLE client_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Clients can view their own requests
CREATE POLICY "Users view own requests" ON client_requests
  FOR SELECT USING (client_user_id = auth.uid());

-- Clients can create requests
CREATE POLICY "Users create requests" ON client_requests
  FOR INSERT WITH CHECK (client_user_id = auth.uid());

-- Clients can update their own pending requests
CREATE POLICY "Users update own pending requests" ON client_requests
  FOR UPDATE USING (
    client_user_id = auth.uid() AND
    status = 'pending'
  );

-- Service role bypass for admin operations
CREATE POLICY "Service role full access" ON client_requests
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');


-- PART 3: Create client_orgs table (denormalized from events)
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  contact_name VARCHAR(255),
  plan_name VARCHAR(50) DEFAULT 'starter', -- starter, growth, pro, enterprise
  billing_status VARCHAR(50) DEFAULT 'active', -- active, past_due, cancelled
  videos_quota INT DEFAULT 10,
  videos_used_this_month INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_client_orgs_name ON client_orgs(name);
CREATE INDEX IF NOT EXISTS idx_client_orgs_billing ON client_orgs(billing_status);

ALTER TABLE client_orgs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages orgs" ON client_orgs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');


-- PART 4: Create client_org_members table
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES client_orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member', -- owner, admin, member
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_client_org_members_org ON client_org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_client_org_members_user ON client_org_members(user_id);

ALTER TABLE client_org_members ENABLE ROW LEVEL SECURITY;

-- Members can view their own memberships
CREATE POLICY "Users view own memberships" ON client_org_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role manages memberships" ON client_org_members
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');


-- PART 5: Create client_projects table
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES client_orgs(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active', -- active, completed, archived
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_client_projects_org ON client_projects(org_id);
CREATE INDEX IF NOT EXISTS idx_client_projects_status ON client_projects(status);

ALTER TABLE client_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages projects" ON client_projects
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Members can view projects in their orgs
CREATE POLICY "Members view org projects" ON client_projects
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM client_org_members WHERE user_id = auth.uid())
  );


-- PART 6: Add foreign keys to client_requests
-- ============================================================================

-- Add FK constraints (after tables exist)
DO $$
BEGIN
  -- Only add if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_client_requests_org'
  ) THEN
    ALTER TABLE client_requests
      ADD CONSTRAINT fk_client_requests_org
      FOREIGN KEY (org_id) REFERENCES client_orgs(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_client_requests_project'
  ) THEN
    ALTER TABLE client_requests
      ADD CONSTRAINT fk_client_requests_project
      FOREIGN KEY (project_id) REFERENCES client_projects(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_client_requests_video'
  ) THEN
    ALTER TABLE client_requests
      ADD CONSTRAINT fk_client_requests_video
      FOREIGN KEY (video_id) REFERENCES videos(id);
  END IF;
END $$;


-- PART 7: Function to calculate SLA deadline
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_sla_deadline(priority VARCHAR, created_at TIMESTAMPTZ)
RETURNS TIMESTAMPTZ AS $$
BEGIN
  CASE priority
    WHEN 'rush' THEN RETURN created_at + INTERVAL '24 hours';
    WHEN 'priority' THEN RETURN created_at + INTERVAL '48 hours';
    ELSE RETURN created_at + INTERVAL '72 hours';
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- PART 8: Trigger to auto-update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
DROP TRIGGER IF EXISTS client_requests_updated_at ON client_requests;
CREATE TRIGGER client_requests_updated_at
  BEFORE UPDATE ON client_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS client_orgs_updated_at ON client_orgs;
CREATE TRIGGER client_orgs_updated_at
  BEFORE UPDATE ON client_orgs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS client_projects_updated_at ON client_projects;
CREATE TRIGGER client_projects_updated_at
  BEFORE UPDATE ON client_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- PART 9: View for request dashboard with computed fields
-- ============================================================================

CREATE OR REPLACE VIEW client_requests_dashboard AS
SELECT
  r.*,
  o.name as org_name,
  p.name as project_name,
  u.email as client_email,
  a.email as assigned_email,
  -- SLA status computation
  CASE
    WHEN r.status IN ('completed', 'cancelled') THEN 'N/A'
    WHEN r.deadline IS NULL THEN 'No deadline'
    WHEN NOW() > r.deadline THEN 'BREACHED'
    WHEN NOW() > r.deadline - INTERVAL '4 hours' THEN 'WARNING'
    ELSE 'OK'
  END as sla_status,
  -- Hours until/past deadline
  EXTRACT(EPOCH FROM (r.deadline - NOW())) / 3600 as hours_to_deadline
FROM client_requests r
LEFT JOIN client_orgs o ON r.org_id = o.id
LEFT JOIN client_projects p ON r.project_id = p.id
LEFT JOIN auth.users u ON r.client_user_id = u.id
LEFT JOIN auth.users a ON r.assigned_to = a.id;


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
