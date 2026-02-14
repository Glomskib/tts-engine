CREATE TABLE IF NOT EXISTS changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT CHECK (category IN ('feature', 'improvement', 'fix', 'announcement')),
  is_major BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS but allow authenticated read
ALTER TABLE changelog ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read changelog entries
CREATE POLICY "Authenticated users can read changelog" ON changelog
  FOR SELECT TO authenticated USING (true);

-- Only service_role can insert/update/delete (admin API route uses service_role)
CREATE POLICY "Service role can manage changelog" ON changelog
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed initial data
INSERT INTO changelog (title, description, category, is_major) VALUES
('Public Script Generator', 'Generate TikTok scripts without logging in at /script-generator', 'feature', true),
('TikTok Shop Import', 'Bulk import products with AI enrichment', 'feature', true),
('Blog Launch', '4 SEO-optimized articles on TikTok content strategy', 'feature', false),
('Feedback System', 'Report bugs and request features with screenshot uploads', 'feature', false),
('Brand Retainer Tracking', 'Track video goals, payouts, and bonus tiers per brand', 'feature', true),
('Quick Start Checklist', 'New onboarding widget guides you through setup', 'improvement', false),
('Custom 404 Page', 'Friendly error pages with navigation suggestions', 'improvement', false),
('SEO Optimization', 'Sitemap, meta tags, JSON-LD schema on all public pages', 'improvement', false),
('System Status Dashboard', 'Real-time health checks on all connected services', 'feature', false),
('Privacy Policy & Terms', 'Legal pages live at /privacy and /terms', 'announcement', false);
