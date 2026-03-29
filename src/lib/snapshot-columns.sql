-- Additional columns for the site_metrics table used by the snapshot route
-- Run these against Supabase to add support for new tracked data sources

ALTER TABLE site_metrics ADD COLUMN IF NOT EXISTS tracked_affiliate_clicks integer DEFAULT 0;
ALTER TABLE site_metrics ADD COLUMN IF NOT EXISTS gsc_pages_submitted integer DEFAULT 0;
ALTER TABLE site_metrics ADD COLUMN IF NOT EXISTS unique_countries integer DEFAULT 0;
ALTER TABLE site_metrics ADD COLUMN IF NOT EXISTS top_referrers text DEFAULT NULL;
