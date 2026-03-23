-- Add geolocation columns to searches table for IP-based location tracking
-- Used by both CarCostCheck and PostcodeCheck via Vercel IP headers
-- Run this once in Supabase SQL Editor: supabase.com/dashboard > SQL Editor

ALTER TABLE searches ADD COLUMN IF NOT EXISTS geo_city text;
ALTER TABLE searches ADD COLUMN IF NOT EXISTS geo_region text;
ALTER TABLE searches ADD COLUMN IF NOT EXISTS geo_country text;

-- Index for geo-based aggregation queries (e.g. "searches by city")
CREATE INDEX IF NOT EXISTS idx_searches_geo ON searches(geo_country, geo_city) WHERE geo_city IS NOT NULL;

-- Index for site + geo combo (e.g. "CarCostCheck searches in Manchester")
CREATE INDEX IF NOT EXISTS idx_searches_site_geo ON searches(site_id, geo_city) WHERE geo_city IS NOT NULL;
