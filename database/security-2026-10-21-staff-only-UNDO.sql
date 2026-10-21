-- ============================================================================
-- FLOW DATABASE: REMOVE THE STAFF-ONLY WALL  (2026-10-21)
-- Undoes database/security-2026-10-21-staff-only.sql.
-- Paste this WHOLE file into Supabase -> SQL Editor -> Run. Leave the editor's
-- role picker on "postgres", and highlight nothing before pressing Run.
-- Run it outside desk hours if you can. While it runs, Flow, the CRM Tool and
-- Prism wait for it, normally for a moment.
-- ============================================================================
--
-- WHAT THIS DOES
--   Removes the extra rule ("the wall", a policy named clearline_staff_only)
--   from every table in Flow's database that has it, then removes the check it
--   used (the function public.is_clearline_staff).
--   After this, Flow's database is back to its earlier rules - including the
--   gap the wall closed: anyone who can sign in can again read what those rules
--   allow. Only run it if the wall is causing a problem, and tell the engineer.
--
-- IT IS ALL-OR-NOTHING
--   Any error at all means nothing was changed. This file's own stops start
--   with "STOPPED". Whatever the message says, send it to the engineer.
--   When it finishes, it shows one line: how many tables the wall was removed
--   from, and a check that none is left.
--
-- No data is removed or changed by this file. Supabase may warn about
-- "destructive operations": that is the removal of the wall rule itself.
-- If it stops with "lock timeout", "deadlock detected" or "statement timeout",
-- the database was busy. Nothing was changed. Wait a few minutes and run it
-- again.
-- If the editor then says "current transaction is aborted", run just the word
-- ROLLBACK; on its own, then run this file again.
-- ============================================================================

BEGIN;

-- 2026-10-21: removing a policy locks its table until COMMIT; give up quickly (nothing changed) rather than
-- freeze the app behind this script.
SET LOCAL lock_timeout = '3s';
-- 2026-10-21: and never hold those locks for long: a statement that runs past this stops, and everything rolls back.
SET LOCAL statement_timeout = '60s';

DO $undo$
DECLARE
  v_tab        record;
  v_elsewhere  text;
  v_check      regprocedure;
  v_users      text;
  v_removed    integer := 0;
BEGIN
  -- 2026-10-21: the editor's role picker can make this run as an API role; then nothing below would work.
  IF current_user IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: this must run as the database owner (postgres), not as %. In the SQL editor, set the role picker back to postgres.', current_user;
  END IF;

  -- 2026-10-21: the check function can only go once nothing uses it. A copy of the wall outside the public
  -- schema would block that, so say so plainly instead of failing on a dependency error.
  SELECT string_agg(format('%I.%I', p.schemaname, p.tablename), ', ' ORDER BY p.schemaname, p.tablename)
    INTO v_elsewhere
  FROM pg_catalog.pg_policies p
  WHERE p.policyname = 'clearline_staff_only'
    AND p.schemaname <> 'public';
  IF v_elsewhere IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: the wall is also on tables outside the public schema (%). An engineer must remove those first.', v_elsewhere;
  END IF;

  -- Remove the wall from every public table that has it. Only the policy named clearline_staff_only is
  -- touched; every other rule on every table stays exactly as it is.
  FOR v_tab IN
    SELECT p.schemaname, p.tablename
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'public'
      AND p.policyname = 'clearline_staff_only'
    ORDER BY p.tablename
  LOOP
    EXECUTE format('DROP POLICY clearline_staff_only ON %I.%I', v_tab.schemaname, v_tab.tablename);
    v_removed := v_removed + 1;
  END LOOP;

  -- 2026-10-21: with the wall gone, anything else that still uses the check (a rule or view someone wrote on top
  -- of it) would make the removal below fail with a technical message. Name it plainly instead.
  v_check := pg_catalog.to_regprocedure('public.is_clearline_staff()');
  IF v_check IS NOT NULL THEN
    SELECT string_agg(pg_catalog.pg_describe_object(d.classid, d.objid, d.objsubid), '; ' ORDER BY 1)
      INTO v_users
    FROM pg_catalog.pg_depend d
    WHERE d.refclassid = 'pg_catalog.pg_proc'::regclass
      AND d.refobjid = v_check
      AND d.deptype = 'n';
    IF v_users IS NOT NULL THEN
      RAISE EXCEPTION 'STOPPED, nothing was changed: something else still uses the check public.is_clearline_staff(): %. An engineer must look.', v_users;
    END IF;
  END IF;

  RAISE NOTICE 'Wall removed from % table(s).', v_removed;
  -- 2026-10-21: a session setting outlives COMMIT, so the line at the end can show the number.
  PERFORM set_config('clearline.wall_undo_removed', v_removed::text, false);
END
$undo$;

-- 2026-10-21: no CASCADE - if anything still used the check, this fails and nothing is changed.
DROP FUNCTION IF EXISTS public.is_clearline_staff();

DO $undo_check$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies p WHERE p.policyname = 'clearline_staff_only') THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: a wall policy is still in place after removal.';
  END IF;
  IF to_regprocedure('public.is_clearline_staff()') IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: the check function is still in place after removal.';
  END IF;
END
$undo_check$;

COMMIT;

-- Read-only confirmation (changes nothing).
SELECT COALESCE(NULLIF(current_setting('clearline.wall_undo_removed', true), ''), 'not available in this editor session')
         AS "tables the wall was removed from",
       (SELECT count(*) FROM pg_catalog.pg_policies p WHERE p.policyname = 'clearline_staff_only')
         AS "wall rules left (should be 0)",
       (to_regprocedure('public.is_clearline_staff()') IS NOT NULL)
         AS "check function still there (should be false)";
