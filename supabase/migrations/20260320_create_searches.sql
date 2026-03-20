-- Search tracking table (shared across CarCostCheck + PostcodeCheck)
-- Run this in Supabase Dashboard > SQL Editor

create table if not exists searches (
  id uuid default gen_random_uuid() primary key,
  site_id text not null,
  search_query text not null,
  result_found boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_searches_site_created on searches(site_id, created_at desc);
create index if not exists idx_searches_created on searches(created_at desc);

-- Enable RLS but allow service role full access
alter table searches enable row level security;
create policy "service_all" on searches for all using (true);
