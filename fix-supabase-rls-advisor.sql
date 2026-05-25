-- Fix Supabase security advisor findings.
--
-- Part 1 (safe to run): Enable Row Level Security on tables that already
-- have an "Allow all operations for authenticated users" policy.
-- These tables had RLS turned off in the database despite the policies
-- being present, so the policies were inert and the tables were
-- effectively wide open to PostgREST callers.
--
-- The existing permissive policy continues to allow all authenticated
-- access, so enabling RLS does NOT change app behavior.

ALTER TABLE public.tickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings_tracking ENABLE ROW LEVEL SECURITY;

-- temp_sf_accounts has no policies. Enabling RLS will lock it down to
-- the service_role only. If the table is still in use, add a policy
-- first; if it's leftover from an import, drop it instead. Uncomment
-- ONE of the following:
--
--   ALTER TABLE public.temp_sf_accounts ENABLE ROW LEVEL SECURITY;
--   DROP TABLE public.temp_sf_accounts;

-- Part 2 (discovery): Run this and share the output so the
-- user_metadata-referencing policies can be rewritten safely.
-- These policies are flagged because user_metadata is editable by the
-- user themselves, so authorization decisions based on it can be
-- bypassed. Replacement policies should read role/division from
-- public.user_profiles via the existing get_user_division() pattern.
--
-- SELECT schemaname, tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND (qual ILIKE '%user_metadata%' OR with_check ILIKE '%user_metadata%');
