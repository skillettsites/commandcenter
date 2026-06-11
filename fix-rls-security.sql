-- =============================================================================
-- CRITICAL SECURITY FIX: Enable Row Level Security on ALL public tables
-- Supabase instance: noxczmrnyyosgvvjlqca  (skillettsites's Project)
-- Regenerated: 2026-06-03  (supersedes 2026-03-25 version, which was never applied)
--
-- SEVERITY: HIGH - the anon key currently returns HTTP 200 + live rows for
-- tasks (149), email_verifications (22), clearout_items (61), price_scans (164),
-- promo_events (3838), trip_itineraries (59), site_metrics (60) and others.
-- Supabase advisor: rls_disabled_in_public.
--
-- Strategy:
--   1. Enable RLS on EVERY table in public (dynamic - also covers future tables).
--   2. Give service_role full access on every table (all backend API routes use
--      the service_role key, so they are unaffected).
--   3. Grant narrow anon access ONLY where public sites genuinely need it
--      (tracking inserts, public content reads, CommandCenter tasks).
--   Everything else defaults to deny-for-anon, which is the secure default.
--
-- Apply in the SQL Editor:
--   https://supabase.com/dashboard/project/noxczmrnyyosgvvjlqca/sql
-- =============================================================================

-- =============================================================================
-- STEP 1: Enable RLS on every base table in the public schema
-- =============================================================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;

-- =============================================================================
-- STEP 2: Drop ALL existing policies (clean slate, safe to re-run)
-- =============================================================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- =============================================================================
-- STEP 3: service_role full access on EVERY table (backends keep working)
-- =============================================================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'CREATE POLICY "service_role_all" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
      r.tablename
    );
  END LOOP;
END $$;

-- =============================================================================
-- STEP 4: Narrow anon access for public-facing tables only
-- =============================================================================

-- ----- 4a. PUBLIC INSERT (tracking, signups, lead capture from live sites) -----
-- anon may INSERT but NOT read/update/delete. service_role already has full access.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'affiliate_clicks','searches','career_votes','newsletter_subscribers',
    'bmn_waitlist','user_progress','user_progress_us','conversion_events',
    'pageviews','mot_reminders','price_watches','price_watch_emails',
    'email_verifications','mms_email_leads','mms_job_clicks','mms_search_logs',
    'promo_events','autocheck_calls'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('CREATE POLICY "anon_insert" ON public.%I FOR INSERT TO anon WITH CHECK (true);', t);
    END IF;
  END LOOP;
END $$;

-- ----- 4b. PUBLIC SELECT (public content / reference data) -----
-- anon may read but NOT write.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appliance_guides','bmn_sources','custom_faqs','local_recommendations',
    'mms_featured_jobs','mms_employers'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('CREATE POLICY "anon_select" ON public.%I FOR SELECT TO anon USING (true);', t);
    END IF;
  END LOOP;
END $$;

-- ----- 4c. TASKS: CommandCenter syncs the tasks table with the anon key -----
-- (per the CommandCenter workflow). Full anon CRUD is required here.
CREATE POLICY "anon_select" ON public.tasks FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert" ON public.tasks FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update" ON public.tasks FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete" ON public.tasks FOR DELETE TO anon USING (true);

-- =============================================================================
-- Everything NOT listed in step 4 (oauth_tokens, net_worth_snapshots,
-- properties, subscriptions, profiles, premium_reports, clearout_items,
-- price_scans, trip_itineraries, stay_analyses, hmlr_*, tribunal_*, etc.)
-- is now reachable ONLY via the service_role key. The anon key is locked out.
-- =============================================================================

-- =============================================================================
-- VERIFICATION (run after applying)
-- =============================================================================
-- 1. Every table should have rowsecurity = true:
--    SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity;
--    -> expect 0 rows
-- 2. Inspect policies:
--    SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname='public' ORDER BY tablename;
