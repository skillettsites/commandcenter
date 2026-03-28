-- =============================================================================
-- CRITICAL SECURITY FIX: Enable Row Level Security on ALL tables
-- Supabase instance: noxczmrnyyosgvvjlqca
-- Generated: 2026-03-25
--
-- SEVERITY: HIGH - oauth_tokens (with live Google refresh tokens) and
-- net_worth_snapshots (financial data) are publicly readable with the anon key.
-- 34 of 35 tables return HTTP 200 to unauthenticated anon requests.
--
-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/noxczmrnyyosgvvjlqca/sql
-- =============================================================================

-- =============================================
-- STEP 1: Enable RLS on ALL tables
-- =============================================

ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appliance_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bmn_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bmn_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bmn_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bmn_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bmn_user_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bmn_user_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bmn_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dismissed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_dividends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.net_worth_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sender_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress_us ENABLE ROW LEVEL SECURITY;

-- =============================================
-- STEP 2: Drop any existing overly permissive policies
-- (safe to run even if they don't exist)
-- =============================================

-- Drop common auto-generated permissive policies if they exist
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- =============================================
-- STEP 3: Create appropriate policies per table category
-- =============================================

-- ----- CATEGORY A: HIGHLY SENSITIVE (service_role only) -----
-- oauth_tokens, net_worth_snapshots, emergency_contacts, fund_dividends,
-- conversations, messages, dismissed_emails, sender_scores, subscriptions,
-- premium_reports, forecasts

-- oauth_tokens: ONLY service_role can read/write
CREATE POLICY "service_role_all" ON public.oauth_tokens
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.net_worth_snapshots
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.emergency_contacts
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.fund_dividends
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.conversations
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.messages
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.dismissed_emails
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.sender_scores
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.subscriptions
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.premium_reports
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.forecasts
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.properties
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.property_files
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.property_valuations
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.profiles
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.projects
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.trade_checks
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.trade_credits
    FOR ALL USING (auth.role() = 'service_role');

-- ----- CATEGORY B: TRACKING/ANALYTICS (anon INSERT, service_role SELECT) -----
-- These tables receive data from public websites but should not be readable publicly.

-- affiliate_clicks: public sites insert click tracking
CREATE POLICY "anon_insert" ON public.affiliate_clicks
    FOR INSERT WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.affiliate_clicks
    FOR ALL USING (auth.role() = 'service_role');

-- searches (PostcodeCheck/CarCostCheck search logs)
CREATE POLICY "anon_insert" ON public.searches
    FOR INSERT WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.searches
    FOR ALL USING (auth.role() = 'service_role');

-- career_votes (AICareerSwap)
CREATE POLICY "anon_insert" ON public.career_votes
    FOR INSERT WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.career_votes
    FOR ALL USING (auth.role() = 'service_role');

-- newsletter_subscribers
CREATE POLICY "anon_insert" ON public.newsletter_subscribers
    FOR INSERT WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.newsletter_subscribers
    FOR ALL USING (auth.role() = 'service_role');

-- bmn_waitlist
CREATE POLICY "anon_insert" ON public.bmn_waitlist
    FOR INSERT WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.bmn_waitlist
    FOR ALL USING (auth.role() = 'service_role');

-- user_progress (quiz/progress tracking from public sites)
CREATE POLICY "anon_insert" ON public.user_progress
    FOR INSERT WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.user_progress
    FOR ALL USING (auth.role() = 'service_role');

-- user_progress_us
CREATE POLICY "anon_insert" ON public.user_progress_us
    FOR INSERT WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.user_progress_us
    FOR ALL USING (auth.role() = 'service_role');

-- ----- CATEGORY C: REFERENCE/READ-ONLY (anon SELECT, service_role full) -----
-- Public content that should be readable but not writable by anon users.

-- appliance_guides (public content)
CREATE POLICY "anon_select" ON public.appliance_guides
    FOR SELECT USING (true);
CREATE POLICY "service_role_all" ON public.appliance_guides
    FOR ALL USING (auth.role() = 'service_role');

-- bmn_sources (reference data)
CREATE POLICY "anon_select" ON public.bmn_sources
    FOR SELECT USING (true);
CREATE POLICY "service_role_all" ON public.bmn_sources
    FOR ALL USING (auth.role() = 'service_role');

-- custom_faqs (public content)
CREATE POLICY "anon_select" ON public.custom_faqs
    FOR SELECT USING (true);
CREATE POLICY "service_role_all" ON public.custom_faqs
    FOR ALL USING (auth.role() = 'service_role');

-- local_recommendations (public content)
CREATE POLICY "anon_select" ON public.local_recommendations
    FOR SELECT USING (true);
CREATE POLICY "service_role_all" ON public.local_recommendations
    FOR ALL USING (auth.role() = 'service_role');

-- ----- CATEGORY D: TASKS (anon read+write for CommandCenter mobile) -----
-- Tasks table is used from CommandCenter and possibly mobile; needs anon access.

CREATE POLICY "anon_select" ON public.tasks
    FOR SELECT USING (true);
CREATE POLICY "anon_insert" ON public.tasks
    FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update" ON public.tasks
    FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete" ON public.tasks
    FOR DELETE USING (true);
CREATE POLICY "service_role_all" ON public.tasks
    FOR ALL USING (auth.role() = 'service_role');

-- ----- CATEGORY E: BriefMyNews user tables (auth user owns their rows) -----
-- If these use Supabase Auth, users access their own rows.
-- If no auth is set up, restrict to service_role only.

CREATE POLICY "service_role_all" ON public.bmn_articles
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.bmn_digests
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.bmn_profiles
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.bmn_user_sources
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.bmn_user_topics
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- STEP 4: IMMEDIATE ACTION - Revoke the leaked Google OAuth token
-- =============================================
-- The Google access_token and refresh_token for skillettsites@gmail.com
-- were publicly exposed. After running this SQL:
-- 1. Go to https://myaccount.google.com/permissions
-- 2. Revoke access for the app that generated this token
-- 3. Re-authenticate to get a new refresh token
-- 4. Update the oauth_tokens table with the new credentials

-- =============================================
-- VERIFICATION: Run this after applying to confirm RLS is active
-- =============================================
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
-- SELECT * FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
