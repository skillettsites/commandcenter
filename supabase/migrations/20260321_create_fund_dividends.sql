-- Fund dividends cache table
-- Stores scraped dividend data from HL factsheet pages to avoid re-fetching every request
CREATE TABLE IF NOT EXISTS fund_dividends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fund_id TEXT NOT NULL,
  fund_name TEXT NOT NULL,
  yield_percent NUMERIC,
  unit_price NUMERIC,
  distributions JSONB DEFAULT '[]'::JSONB,
  ex_dividend_dates JSONB DEFAULT '[]'::JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fund_dividends_fund_id_unique UNIQUE (fund_id)
);

-- Index for quick lookups by fund_id
CREATE INDEX IF NOT EXISTS idx_fund_dividends_fund_id ON fund_dividends (fund_id);

-- RLS: allow service role full access
ALTER TABLE fund_dividends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON fund_dividends
  FOR ALL
  USING (true)
  WITH CHECK (true);
