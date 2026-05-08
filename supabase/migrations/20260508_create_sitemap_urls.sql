-- Track every URL we've seen in any site's sitemap, with the
-- timestamp of first sighting. Lets the daily-indexing cron prioritise
-- newly-created pages even on sites whose sitemap stamps lastmod with
-- a static or daily-regenerated value (CCC, FYS, PCC).

CREATE TABLE IF NOT EXISTS sitemap_urls (
  site_id text NOT NULL,
  url text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, url)
);

CREATE INDEX IF NOT EXISTS idx_sitemap_urls_site_recent
  ON sitemap_urls (site_id, first_seen_at DESC);
