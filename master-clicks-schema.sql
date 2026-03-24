-- Master Clicks: universal interaction tracking table for all sites
-- Run this in Supabase SQL Editor
-- Created: 2026-03-24

CREATE TABLE IF NOT EXISTS master_clicks (
  id bigserial PRIMARY KEY,
  site text NOT NULL,           -- 'findyourstay', 'carcostcheck', 'bestlondontours', etc.
  event_type text NOT NULL,     -- 'affiliate_click', 'search', 'cta_click', 'outbound_link', etc.
  provider text,                -- 'expedia', 'gyg', 'autotrader', 'ebay', 'reed', etc.
  page_url text,                -- the page the click happened on
  target_url text,              -- where the click goes
  section text,                 -- page section identifier
  city text,                    -- city context if applicable
  metadata jsonb DEFAULT '{}',  -- flexible extra data (search query, reg plate, postcode, etc.)
  geo_city text,
  geo_region text,
  geo_country text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_master_clicks_site ON master_clicks(site);
CREATE INDEX IF NOT EXISTS idx_master_clicks_created ON master_clicks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_clicks_event ON master_clicks(event_type);
CREATE INDEX IF NOT EXISTS idx_master_clicks_site_event ON master_clicks(site, event_type);
CREATE INDEX IF NOT EXISTS idx_master_clicks_provider ON master_clicks(provider);

-- Row Level Security
ALTER TABLE master_clicks ENABLE ROW LEVEL SECURITY;

-- Allow any site to insert clicks (anonymous inserts from client-side tracking)
CREATE POLICY "Anyone can insert clicks" ON master_clicks
  FOR INSERT WITH CHECK (true);

-- Allow reading clicks (for dashboard queries)
CREATE POLICY "Anyone can view clicks" ON master_clicks
  FOR SELECT USING (true);
