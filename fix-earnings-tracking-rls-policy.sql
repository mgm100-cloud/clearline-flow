-- Fix: the Earnings Tracking tab shows no rows after the RLS security work.
--
-- Root cause:
--   fix-supabase-rls-advisor.sql enabled Row Level Security on
--   public.earnings_tracking (it had been inert before). The only policy
--   on that table is still the original one from create-earnings-table.sql:
--
--       FOR ALL USING (auth.role() = 'authenticated')
--
--   Meanwhile fix-user-metadata-rls-policies.sql rewrote the tickers/todos
--   policies onto the user_profiles / "TO authenticated USING (true)"
--   pattern, so those tables keep returning rows. earnings_tracking was
--   left on auth.role(), which in this project does not evaluate to
--   'authenticated' for the app's SELECTs, so the table now returns zero
--   rows and the Earnings Tracking tab renders empty.
--
-- This realigns earnings_tracking with the same pattern as tickers/todos:
-- any authenticated user can read and write, without depending on
-- auth.role(). This preserves the table's original (fully-open to
-- authenticated users) behavior, just expressed in a way RLS enforces
-- correctly.

ALTER TABLE public.earnings_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.earnings_tracking;

CREATE POLICY "Allow all operations for authenticated users" ON public.earnings_tracking
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Optional hardening (mirrors the tickers/todos hardening): restrict writes
-- to readwrite/admin users via user_profiles, keeping reads open to all
-- authenticated users. Requires public.get_user_role() from
-- fix-user-metadata-rls-policies.sql. Uncomment to apply:
--
--   DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.earnings_tracking;
--
--   CREATE POLICY "Allow read for authenticated users" ON public.earnings_tracking
--     FOR SELECT TO authenticated USING (true);
--
--   CREATE POLICY "Enable insert for readwrite users" ON public.earnings_tracking
--     FOR INSERT TO authenticated
--     WITH CHECK (public.get_user_role() IN ('readwrite', 'admin'));
--
--   CREATE POLICY "Enable update for readwrite users" ON public.earnings_tracking
--     FOR UPDATE TO authenticated
--     USING (public.get_user_role() IN ('readwrite', 'admin'));
--
--   CREATE POLICY "Enable delete for readwrite users" ON public.earnings_tracking
--     FOR DELETE TO authenticated
--     USING (public.get_user_role() IN ('readwrite', 'admin'));
-- ---------------------------------------------------------------------------

-- Verify the resulting policies on the table:
-- SELECT policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'earnings_tracking';
