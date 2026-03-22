-- Affiliate click tracking (used by FindYourStay and potentially other sites)
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'expedia',
  city TEXT,
  section TEXT,
  site TEXT NOT NULL DEFAULT 'findyourstay',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by site and date
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_site_created
  ON affiliate_clicks (site, created_at DESC);

-- Enable RLS but allow inserts from anon (tracking is public)
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts" ON affiliate_clicks
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anonymous reads" ON affiliate_clicks
  FOR SELECT TO anon USING (true);
