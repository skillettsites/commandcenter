-- Page audits: structure optimization tracking for top-performing pages
CREATE TABLE page_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL,
  url text NOT NULL,
  audited_at timestamptz DEFAULT now(),
  monthly_clicks int DEFAULT 0,
  monthly_impressions int DEFAULT 0,
  has_affiliate_cta boolean DEFAULT false,
  has_structured_data boolean DEFAULT false,
  has_images boolean DEFAULT false,
  data_table_position text DEFAULT 'none', -- 'top', 'middle', 'bottom', 'none'
  internal_link_count int DEFAULT 0,
  external_link_count int DEFAULT 0,
  word_count int DEFAULT 0,
  has_h1 boolean DEFAULT false,
  heading_count int DEFAULT 0,
  issues jsonb DEFAULT '[]',
  suggestions jsonb DEFAULT '[]',
  score int DEFAULT 0, -- 0-100 optimization score
  status text DEFAULT 'pending' -- 'pending', 'optimized', 'skipped'
);

CREATE INDEX idx_page_audits_site ON page_audits(site_id);
CREATE INDEX idx_page_audits_url ON page_audits(url);
CREATE INDEX idx_page_audits_status ON page_audits(status);
CREATE INDEX idx_page_audits_audited ON page_audits(audited_at DESC);
CREATE INDEX idx_page_audits_score ON page_audits(score ASC);

-- Allow all operations (personal tool, no auth needed)
ALTER TABLE page_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all page_audits" ON page_audits FOR ALL USING (true) WITH CHECK (true);
