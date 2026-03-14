-- Run this in your Supabase SQL Editor to add OAuth token storage

create table if not exists oauth_tokens (
  id text primary key, -- e.g. 'gmail_skillettsites'
  provider text not null, -- 'google' or 'microsoft'
  email text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz default now()
);

alter table oauth_tokens enable row level security;
create policy "Allow all" on oauth_tokens for all using (true) with check (true);
