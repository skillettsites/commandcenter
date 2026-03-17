import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/setup - One-time table creation for sender_scores
 * Safe to call multiple times (uses IF NOT EXISTS pattern via upsert)
 */
export async function GET() {
  const supabase = getServiceClient();

  // Test if table exists by trying a select
  const { error: testError } = await supabase
    .from('sender_scores')
    .select('id')
    .limit(1);

  if (testError && testError.code === 'PGRST204') {
    // Table doesn't exist - we can't create it via REST API
    // User needs to run this SQL in Supabase dashboard:
    return NextResponse.json({
      error: 'Table sender_scores does not exist',
      sql: `CREATE TABLE sender_scores (
  id serial primary key,
  sender_email text unique not null,
  sender_domain text,
  sender_name text,
  score integer default 0,
  total_actions integer default 0,
  classification text,
  last_action text,
  last_action_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
ALTER TABLE sender_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all" ON sender_scores FOR ALL USING (true);`,
      instructions: 'Run this SQL in Supabase Dashboard > SQL Editor',
    });
  }

  return NextResponse.json({ ok: true, message: 'sender_scores table exists' });
}
