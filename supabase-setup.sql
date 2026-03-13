-- Run this in your Supabase SQL Editor to create the tables

-- Tasks table
create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  project text not null,
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  created_at timestamptz default now(),
  completed_at timestamptz,
  notes text
);

-- Index for common queries
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_project on tasks(project);
create index if not exists idx_tasks_created_at on tasks(created_at desc);

-- Enable Row Level Security (disabled for personal use, but table is created with it)
alter table tasks enable row level security;

-- Allow all operations (no auth, personal tool)
create policy "Allow all" on tasks for all using (true) with check (true);

-- Projects table (optional, for dynamic project management)
create table if not exists projects (
  id text primary key,
  name text not null,
  url text,
  color text not null default '#6B7280'
);

alter table projects enable row level security;
create policy "Allow all" on projects for all using (true) with check (true);

-- Seed projects
insert into projects (id, name, url, color) values
  ('carcostcheck', 'CarCostCheck', 'https://carcostcheck.co.uk', '#3B82F6'),
  ('postcodecheck', 'PostcodeCheck', 'https://postcodecheck.co.uk', '#10B981'),
  ('tapwaterscore', 'TapWaterScore', 'https://tapwaterscore.vercel.app', '#06B6D4'),
  ('medcostcheck', 'MedCostCheck', 'https://medcostcheck.vercel.app', '#8B5CF6'),
  ('findyourstay', 'FindYourStay', 'https://findyourstay.com', '#F59E0B'),
  ('helpafterloss', 'HelpAfterLoss', 'https://helpafterloss.co.uk', '#EC4899'),
  ('davidskillett', 'DavidSkillett', 'https://davidskillett.com', '#6366F1'),
  ('general', 'General', '', '#6B7280')
on conflict (id) do nothing;
