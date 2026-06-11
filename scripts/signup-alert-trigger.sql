-- Signup alerts: fire a Telegram ping whenever anyone creates an account on any
-- site that uses the shared Supabase project (noxczmrnyyosgvvjlqca).
--
-- Run this ONCE in the Supabase SQL Editor for that project:
--   Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- It calls the CommandCenter endpoint /api/signup-alert, which sends the Telegram
-- message via the existing bot. The x-signup-secret must match the
-- SIGNUP_ALERT_SECRET env var set on CommandCenter in Vercel.

-- pg_net lets Postgres make outbound HTTP calls (async, won't block signups).
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_signup()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net
as $$
begin
  perform net.http_post(
    url     := 'https://commandcenter-mocha.vercel.app/api/signup-alert',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-signup-secret', '58cbf99111a3b7e1d7cbdf8c7992e6c573a1d1495f06805d'
    ),
    body    := jsonb_build_object(
      'type',   'INSERT',
      'table',  'users',
      'schema', 'auth',
      'record', to_jsonb(NEW)
    )
  );
  return NEW;
exception
  -- Never let a notification failure block an account from being created.
  when others then
    return NEW;
end;
$$;

drop trigger if exists on_auth_user_created_notify on auth.users;

create trigger on_auth_user_created_notify
  after insert on auth.users
  for each row
  execute function public.notify_new_signup();
