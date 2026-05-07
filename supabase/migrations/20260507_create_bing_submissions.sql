-- Track URLs submitted to Bing via daily cron, so we don't re-submit and
-- can prioritise the long tail. Also lets the cron run statelessly on
-- Vercel without local file tracking.

CREATE TABLE IF NOT EXISTS bing_submissions (
  site_id text NOT NULL,
  url text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, url)
);

CREATE INDEX IF NOT EXISTS idx_bing_submissions_site_recent
  ON bing_submissions (site_id, submitted_at DESC);
