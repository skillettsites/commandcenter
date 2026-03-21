-- Property valuations cache table
-- Stores Zoopla estimates and Land Registry comparable sales data
CREATE TABLE IF NOT EXISTS property_valuations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id TEXT NOT NULL,
  address TEXT NOT NULL,
  zoopla_estimate NUMERIC,
  zoopla_low NUMERIC,
  zoopla_high NUMERIC,
  land_registry_comparables JSONB DEFAULT '[]'::JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT property_valuations_property_id_unique UNIQUE (property_id)
);

-- Index for quick lookups by property_id
CREATE INDEX IF NOT EXISTS idx_property_valuations_property_id ON property_valuations (property_id);

-- RLS: allow service role full access
ALTER TABLE property_valuations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON property_valuations
  FOR ALL
  USING (true)
  WITH CHECK (true);
