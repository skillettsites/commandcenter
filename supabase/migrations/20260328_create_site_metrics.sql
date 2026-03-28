-- Site metrics: daily snapshot of all key metrics per site
CREATE TABLE site_metrics (
  id bigserial PRIMARY KEY,
  site_id text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,

  -- GSC data
  gsc_clicks integer DEFAULT 0,
  gsc_impressions integer DEFAULT 0,
  gsc_ctr numeric(6,4) DEFAULT 0,
  gsc_position numeric(6,2) DEFAULT 0,
  gsc_pages_indexed integer DEFAULT 0,

  -- GA4 data
  ga_visitors integer DEFAULT 0,
  ga_pageviews integer DEFAULT 0,

  -- Supabase tracked data
  tracked_pageviews integer DEFAULT 0,
  tracked_searches integer DEFAULT 0,

  -- Page quality scores (from eval)
  avg_lighthouse_score numeric(5,2),
  avg_seo_score numeric(5,2),
  pages_with_schema integer,
  pages_without_schema integer,

  -- Changes made
  changes_made integer DEFAULT 0,
  changes_kept integer DEFAULT 0,

  created_at timestamptz DEFAULT now(),

  UNIQUE(site_id, date)
);

CREATE INDEX idx_site_metrics_site_date ON site_metrics(site_id, date DESC);
CREATE INDEX idx_site_metrics_date ON site_metrics(date DESC);

-- Site changes: log of every change made by AutoResearch
CREATE TABLE site_changes (
  id bigserial PRIMARY KEY,
  site_id text NOT NULL,
  page_path text,
  change_type text NOT NULL, -- 'meta_title', 'meta_description', 'schema', 'internal_link', 'content', 'heading', 'image_alt'
  change_description text NOT NULL,
  before_value text,
  after_value text,
  metric_before jsonb, -- { lighthouse: 85, seo: 72, ctr: 0.5 }
  metric_after jsonb,  -- { lighthouse: 92, seo: 85, ctr: 1.2 }
  status text DEFAULT 'pending', -- 'pending', 'deployed', 'reverted', 'confirmed'
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_site_changes_site ON site_changes(site_id, created_at DESC);
CREATE INDEX idx_site_changes_status ON site_changes(status);
