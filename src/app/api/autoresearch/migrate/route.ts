import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Temporary migration endpoint. Secured with SYNC_SECRET.
// DELETE THIS FILE after migration is complete.
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const supabase = createClient(url, key, {
    db: { schema: 'public' },
  });

  const results: { step: string; status: string; error?: string }[] = [];

  // Step 1: Create site_metrics table using raw SQL via rpc
  // Since we cannot run raw SQL, we use a workaround:
  // Create a temporary function, run it, then drop it.
  // Actually, Supabase JS v2 does not support raw SQL.
  // But we CAN call the PostgREST SQL endpoint at /pg/query with the service role.

  // Approach: Use the Supabase HTTP API directly to call the pg-meta endpoint
  const pgMetaUrl = `${url}/pg/query`;

  const sqlStatements = [
    // Create site_metrics
    `CREATE TABLE IF NOT EXISTS site_metrics (
      id bigserial PRIMARY KEY,
      site_id text NOT NULL,
      date date NOT NULL DEFAULT CURRENT_DATE,
      gsc_clicks integer DEFAULT 0,
      gsc_impressions integer DEFAULT 0,
      gsc_ctr numeric(6,4) DEFAULT 0,
      gsc_position numeric(6,2) DEFAULT 0,
      gsc_pages_indexed integer DEFAULT 0,
      ga_visitors integer DEFAULT 0,
      ga_pageviews integer DEFAULT 0,
      tracked_pageviews integer DEFAULT 0,
      tracked_searches integer DEFAULT 0,
      avg_lighthouse_score numeric(5,2),
      avg_seo_score numeric(5,2),
      pages_with_schema integer,
      pages_without_schema integer,
      changes_made integer DEFAULT 0,
      changes_kept integer DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      UNIQUE(site_id, date)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_site_metrics_site_date ON site_metrics(site_id, date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_site_metrics_date ON site_metrics(date DESC)`,
    // Create site_changes
    `CREATE TABLE IF NOT EXISTS site_changes (
      id bigserial PRIMARY KEY,
      site_id text NOT NULL,
      page_path text,
      change_type text NOT NULL,
      change_description text NOT NULL,
      before_value text,
      after_value text,
      metric_before jsonb,
      metric_after jsonb,
      status text DEFAULT 'pending',
      created_at timestamptz DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_site_changes_site ON site_changes(site_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_site_changes_status ON site_changes(status)`,
  ];

  for (const sql of sqlStatements) {
    try {
      const res = await fetch(pgMetaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          'apikey': key,
        },
        body: JSON.stringify({ query: sql }),
      });

      if (res.ok) {
        results.push({ step: sql.slice(0, 60), status: 'ok' });
      } else {
        const body = await res.text();
        results.push({ step: sql.slice(0, 60), status: 'error', error: body.slice(0, 200) });
      }
    } catch (err) {
      results.push({ step: sql.slice(0, 60), status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Also try using supabase-js to verify table exists
  const { error: testError } = await supabase.from('site_metrics').select('id').limit(1);
  const tableExists = !testError || testError.code !== 'PGRST205';

  return NextResponse.json({
    results,
    tableExists,
    testError: testError?.message || null,
  });
}
