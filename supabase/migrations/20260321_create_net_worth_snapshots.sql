-- Net worth history tracking table
-- Run this in Supabase Dashboard > SQL Editor

create table if not exists net_worth_snapshots (
  id uuid default gen_random_uuid() primary key,
  date date not null unique,
  total numeric not null,
  investments numeric not null default 0,
  property_equity numeric not null default 0,
  cash numeric not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_nw_snapshots_date on net_worth_snapshots(date desc);

-- Enable RLS but allow service role full access
alter table net_worth_snapshots enable row level security;
create policy "service_all" on net_worth_snapshots for all using (true);
