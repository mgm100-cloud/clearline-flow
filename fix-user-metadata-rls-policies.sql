-- Rewrite the 6 RLS policies on public.tickers and public.todos that
-- read role from auth.jwt() -> 'user_metadata'. user_metadata is
-- editable by the user themselves, so it can't be trusted for
-- authorization. The replacement policies look up the role from
-- public.user_profiles via a SECURITY DEFINER function — matching
-- the existing get_user_division() pattern in
-- add-division-to-user-profiles.sql.

CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.user_profiles WHERE id = user_id;
  RETURN COALESCE(v_role, 'readonly');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_user_role
  IS 'Returns the current user''s role from user_profiles. Safe to use in RLS policies (user cannot modify their own row in user_profiles).';

-- Drop the insecure user_metadata-based policies.
DROP POLICY IF EXISTS "Enable insert for readwrite users" ON public.tickers;
DROP POLICY IF EXISTS "Enable update for readwrite users" ON public.tickers;
DROP POLICY IF EXISTS "Enable delete for readwrite users" ON public.tickers;
DROP POLICY IF EXISTS "Enable insert for readwrite users" ON public.todos;
DROP POLICY IF EXISTS "Enable update for readwrite users" ON public.todos;
DROP POLICY IF EXISTS "Enable delete for readwrite users" ON public.todos;

-- Recreate with the secure role lookup.
CREATE POLICY "Enable insert for readwrite users" ON public.tickers
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('readwrite', 'admin'));

CREATE POLICY "Enable update for readwrite users" ON public.tickers
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('readwrite', 'admin'));

CREATE POLICY "Enable delete for readwrite users" ON public.tickers
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('readwrite', 'admin'));

CREATE POLICY "Enable insert for readwrite users" ON public.todos
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('readwrite', 'admin'));

CREATE POLICY "Enable update for readwrite users" ON public.todos
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('readwrite', 'admin'));

CREATE POLICY "Enable delete for readwrite users" ON public.todos
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('readwrite', 'admin'));

-- Optional hardening: the "Allow all operations for authenticated users"
-- policies on tickers and todos are FOR ALL, so any authenticated user
-- (even readonly) can currently INSERT/UPDATE/DELETE despite the role
-- policies above — permissive policies are OR'd, and the broader one
-- always wins. To actually enforce the role restriction at the DB level,
-- narrow the catch-all to SELECT only by running:
--
--   DROP POLICY "Allow all operations for authenticated users" ON public.tickers;
--   CREATE POLICY "Allow read for authenticated users" ON public.tickers
--     FOR SELECT TO authenticated USING (true);
--
--   DROP POLICY "Allow all operations for authenticated users" ON public.todos;
--   CREATE POLICY "Allow read for authenticated users" ON public.todos
--     FOR SELECT TO authenticated USING (true);
--
-- After this change, writes on these tables require role IN ('readwrite','admin')
-- as enforced by user_profiles.
