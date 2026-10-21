-- ============================================================================
-- FLOW DATABASE: STAFF-ONLY WALL  (2026-10-21)
-- Paste this WHOLE file into Supabase -> SQL Editor -> Run. Once is enough.
-- Leave the editor's role picker on "postgres". Highlight nothing before
-- pressing Run: if part of the text is highlighted, only that part runs.
--
-- Run it outside desk hours. While it runs, every Flow, CRM Tool and Prism
-- screen waits for it. A save made at that moment can fail, and the person
-- has to save again. If the database stays busy, the script gives up on its
-- own and changes nothing.
-- ============================================================================
--
-- BEFORE YOU RUN IT
--   1. Supabase dashboard -> Authentication -> Sign In / Providers -> Email.
--      Check that "Confirm email" is ON. If it is OFF, turn it ON first.
--   2. Optional quick check. Copy just the line below, without the "--" at the
--      start, into a new SQL editor tab and run it. It should return no rows.
--      If it lists tables, send the list to the engineer. The script cannot
--      put the wall on those tables, so it would stop and change nothing.
--      select c.relname, pg_get_userbyid(c.relowner) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity and not pg_has_role(current_user,c.relowner,'USAGE');
--
-- WHAT THIS DOES
--   Until now anyone on the internet could create a Flow account (sign-up was
--   open), and Flow's own sign-up form lets that person pick their "division".
--   Many of Flow's database rules only ask "is this person signed in?", and the
--   CRM rules trust the division the person picked. So a stranger who signed
--   up could read Flow's data.
--
--   This script adds one extra rule - "the wall" - to every protected table in
--   Flow's database. A signed-in person only gets through the wall if their
--   account is a CONFIRMED @clearlinecap.com address that is not banned and not
--   deleted. All of Flow's existing rules still apply on top of the wall. The
--   wall can only take access away from outsiders. It never gives anyone new
--   access.
--
-- IT IS ALL-OR-NOTHING, AND IT TESTS ITSELF
--   - Before changing anything, it counts, table by table, how many rows these
--     test people can see: a made-up outsider, a real Clearline staff account
--     (the one that signed in most recently), a signed-out visitor, and the
--     newest real account that is not Clearline staff (if there is one).
--   - Then it adds the wall and checks again. The outsider and the non-staff
--     account must now see nothing, in every table. The staff account must
--     still pass the check, and still read every table it could read before.
--   - The rule can only remove access from accounts that fail the check. So a
--     staff account keeps exactly the rows it had. The test confirms this on
--     the most recent staff account.
--   - Any error at all means NOTHING was changed. The script's own stops start
--     with "STOPPED". Whatever the message says, send it to the engineer.
--   - When it finishes, it shows a report (see "THE REPORT" below).
--
-- YOU MUST ALSO TURN SIGN-UP OFF, AND REMOVE OUTSIDE ACCOUNTS
--   - Supabase dashboard -> Authentication -> Sign In / Providers -> turn OFF
--     "Allow new users to sign up". Keep "Confirm email" ON.
--     Without this the wall is not complete. While sign-up is open and email
--     confirmation is off, a stranger can register a made-up @clearlinecap.com
--     address (nobody checks they own that mailbox) and walk straight through.
--   - Remove every account in report section d that says "Remove it". This is
--     required, not optional. While "Confirm email" is off, an outside account
--     can change its address to a made-up @clearlinecap.com one and get in.
--   - Read report section g. Every account listed there gets through the wall.
--     Check that each one is a real colleague. If "Confirm email" was ever off
--     while sign-up was open, a stranger may already hold one of these.
--   New colleagues are then added with Authentication -> Users -> "Invite user".
--
-- WHAT THE WALL DOES NOT COVER
--   - Server functions and jobs that use the Supabase "service role" key keep
--     working: for example Flow's old CRM email, Outlook and weekly-report
--     functions, Flow's /api jobs, and the Prism server when it has that key.
--     That database role skips these rules (Postgres calls this BYPASSRLS).
--     So they are also NOT covered by the wall. Each one must check who is
--     calling. That is the separate edge-function and /api change.
--   - Screens that call the database as the signed-in person are behind the
--     wall, and keep working for staff: Flow itself, Prism's ticker and
--     earnings views, and the CRM functions that only read.
--   - Signed-out visitors, views, some functions, and tables whose row rules
--     are switched off. See report sections a, b, c, f and h.
--   - The second sign-in step (the code from the authenticator app) is checked
--     by the Flow page, not by the database. Someone with a stolen staff
--     password still gets through the wall without the code. That is a
--     separate change.
--   - File storage, and other parts of the database outside "public".
--
-- HOW TO UNDO
--   Paste database/security-2026-10-21-staff-only-UNDO.sql into the SQL editor
--   and run it. It removes the wall from every table and removes the check it
--   uses. It is all-or-nothing too.
--
-- SAFE TO RUN TWICE
--   Running it again swaps the wall for an identical copy and repeats the tests.
--
-- THE REPORT (the table you see when it finishes)
--   0. One summary line.
--   1. One line per walled table: what the outsider and the staff account could
--      see before, and what they see now.
--   a, b, c. Things the wall does NOT cover: tables whose row rules are switched
--      off, views, and functions that skip the row rules. An engineer should
--      look at each one.
--   d. Accounts that are not Clearline staff. Remove every one that says
--      "Remove it" (Authentication -> Users). This is required (see above).
--   e. Clearline addresses that never confirmed their email. They lose access
--      until they confirm. Normally this is empty. Do not remove these without
--      checking with the person.
--   f. Tables a signed-out visitor can read. The wall is for signed-in accounts
--      only, so an engineer should check these.
--   g. Every account that GETS THROUGH the wall. Check each one is a real
--      colleague.
--   h. Rules that may let a signed-out visitor add, change or remove rows. An
--      engineer should check these.
--   i. A last check, made after the wall is saved: tables with row rules but
--      without the wall. It should say "(none found)". If not, run the script
--      again.
--   j. Other database logins that are behind the wall. Normally empty, or
--      "Nothing to do".
--
-- IF IT STOPS, OR THE EDITOR ASKS YOU TO CONFIRM
--   Supabase may warn that the query has "destructive operations". That is the
--   line that swaps an older copy of this same wall for the new one
--   (DROP POLICY IF EXISTS). No data is removed or changed anywhere in this
--   file. Confirm and run it.
--   If it stops with "lock timeout", "deadlock detected" or "statement
--   timeout", the database was busy. Nothing was changed. Wait a few minutes
--   and run it again.
--   If the editor then says "current transaction is aborted", run just the word
--   ROLLBACK; on its own, then run this file again.
--
-- ----------------------------------------------------------------------------
-- NOTES FOR ENGINEERS
--   * A RESTRICTIVE policy is ANDed with the table's permissive policies: a row
--     is visible only if (some permissive policy passes) AND (every restrictive
--     policy passes). On its own a restrictive policy grants nothing, so a table
--     with no permissive policy for authenticated stays closed. That is why the
--     wall does not depend on which of Flow's many policy files are live.
--   * The wall is TO authenticated only. anon is untouched (its reads are in
--     report section f, its possible writes in section h). service_role has
--     BYPASSRLS, so policies never apply to it; the script refuses to run if
--     that ever stops being true. BYPASSRLS does not skip locks (next point).
--   * Locks: DROP/CREATE POLICY take ACCESS EXCLUSIVE on each table until COMMIT.
--     From the first wall until COMMIT, every walled table is closed to every
--     role, service_role and Realtime included. So the AFTER test is cheap (one
--     LIMIT 1 read per table and test person, plus the check itself as the
--     staff person; the signed-out visitor is not asked again), lock_timeout is
--     3s, and statement_timeout is 60s per statement from the wall on (5min for
--     the BEFORE phase, which holds only ACCESS SHARE). A deadlock with an app
--     transaction that touches two tables is possible. Postgres then cancels
--     one side, which may be the app's.
--   * Why staff access cannot change: for a caller the check accepts, the
--     restrictive policy is true, and (permissive AND true) = permissive. The
--     AFTER test confirms the premise for the most recent staff account through
--     the API role (the check says yes; each table still reads, with rows where
--     it had rows) instead of recounting every table under the lock.
--   * The check reads auth.users (only Supabase Auth writes it), never
--     public.user_profiles.division or user_metadata (the user can edit both).
--     It accepts plain ASCII addresses only (octet_length = char_length):
--     lower() folds some non-ASCII capitals (U+0130) into ASCII, which would let
--     a look-alike domain through. The BEFORE cross-check folds case with
--     translate() on the last 17 characters instead of lower().
--   * The self-test impersonates the way PostgREST v10 and later does: SET LOCAL
--     ROLE plus request.jwt.claims only. The older request.jwt.claim.* settings
--     are blanked. So an auth.uid() that reads only request.jwt.claim.sub makes
--     the guard stop, instead of a passing test and locked-out staff. The same
--     goes for auth.role() in Flow's policies, so the BEFORE counts match what
--     real traffic saw. The temp tables are only ever read or written as the
--     administrator; each answer comes back in a variable.
--   * REPEATABLE READ: every query in this transaction, catalog scans included,
--     sees one snapshot. Rows the app writes meanwhile cannot skew the
--     comparison. But a table whose row rules another session switches on
--     mid-run is neither walled nor seen; report section i looks again after
--     COMMIT, on a fresh snapshot.
--   * The report is a single SELECT because the Supabase SQL editor only shows
--     the result of the last statement.
--   * Not covered: file storage (storage.objects / buckets), other schemas, and
--     MFA. Flow asks for the TOTP code in the browser only; the wall accepts a
--     staff token that has not passed it (aal1). Requiring aal2 here is a
--     separate change, since some staff tokens in use may be single-factor.
-- ============================================================================

BEGIN;

-- 2026-10-21: one snapshot for the whole run, so "before" and "after" compare like with like.
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- 2026-10-21: adding a policy locks its table until COMMIT, and every table already walled stays locked while we wait
-- for the next one. Give up quickly (nothing changed) rather than freeze the whole app behind this script.
SET LOCAL lock_timeout = '3s';
-- 2026-10-21: the BEFORE counts hold only read locks, so they may take a while; still, never run unbounded.
SET LOCAL statement_timeout = '5min';
-- 2026-10-21: RLS-filtered reads must filter, never error, while the self-test counts rows.
SET LOCAL row_security = on;

-- ----------------------------------------------------------------------------
-- 0. Guards: refuse to start unless this can work and cannot hurt the server side.
-- ----------------------------------------------------------------------------
DO $guard$
DECLARE
  v_not_owned   text;
  v_forced      text;
  v_can_switch  boolean;
  v_probe       uuid := gen_random_uuid();
BEGIN
  -- 2026-10-21: the editor's role picker can make this run as an API role; then nothing below would work.
  IF current_user IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: this must run as the database owner (postgres), not as %. In the SQL editor, set the role picker back to postgres.', current_user;
  END IF;

  -- 2026-10-21: the CRM Tool, Prism and the jobs use the service role. It must keep skipping row rules,
  -- or the wall would lock them out too.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: the service_role database role does not have BYPASSRLS, so the wall would also block the CRM Tool, Prism and the jobs.';
  END IF;

  -- 2026-10-21: the self-test plays the two API roles; the administrator must be allowed to become them.
  -- Postgres 16 and later ask for the SET option of the membership; older versions only for membership.
  IF pg_catalog.current_setting('server_version_num')::integer >= 160000 THEN
    v_can_switch := pg_catalog.pg_has_role(current_user, 'authenticated', 'SET')
                    AND pg_catalog.pg_has_role(current_user, 'anon', 'SET');
  ELSE
    v_can_switch := pg_catalog.pg_has_role(current_user, 'authenticated', 'MEMBER')
                    AND pg_catalog.pg_has_role(current_user, 'anon', 'MEMBER');
  END IF;
  IF NOT v_can_switch THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: % cannot switch to the authenticated and anon roles, so the self-test cannot run.', current_user;
  END IF;

  -- 2026-10-21: the check reads auth.users and the report reads auth.identities. Find out now, not after COMMIT,
  -- when an error in the report would look like the whole script failed.
  IF pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regclass('auth.identities') IS NULL
     OR NOT pg_catalog.has_table_privilege(current_user, 'auth.users', 'SELECT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'auth.identities', 'SELECT') THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: % cannot read auth.users and auth.identities, which the check and the report need.', current_user;
  END IF;

  -- 2026-10-21: today's API hands over the signed-in person only in request.jwt.claims. If this project's auth.uid()
  -- does not read it there (a very old version reads only request.jwt.claim.sub), the wall would lock every staff
  -- account out. Stop instead.
  IF pg_catalog.to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: this database has no auth.uid() function. Is this the Supabase project?';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', v_probe, 'role', 'authenticated')::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  IF auth.uid() IS DISTINCT FROM v_probe THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: auth.uid() on this project does not read the signed-in person from request.jwt.claims (it may be an old version), so the wall would lock every staff account out. An engineer must look.';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);

  -- 2026-10-21: only a table's owner can add a policy to it. Say which tables are in the way, plainly.
  SELECT string_agg(format('%I.%I', n.nspname, c.relname), ', ' ORDER BY c.relname)
    INTO v_not_owned
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relrowsecurity
    AND NOT pg_catalog.pg_has_role(current_user, c.relowner, 'USAGE');
  IF v_not_owned IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: these tables belong to another database role, so this editor cannot add the wall to them: %', v_not_owned;
  END IF;

  -- 2026-10-21: a table that forces its row rules on its own owner, when that owner has the rights of authenticated
  -- and does not skip row rules, would put the owner behind the wall too - and with it Flow's own SECURITY DEFINER
  -- functions and triggers (for example the one that creates a profile for an invited colleague). No test person
  -- would notice, so stop.
  SELECT string_agg(format('%I.%I (owner %I)', n.nspname, c.relname, o.rolname), ', ' ORDER BY c.relname)
    INTO v_forced
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_roles o ON o.oid = c.relowner
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relrowsecurity
    AND c.relforcerowsecurity
    AND NOT o.rolsuper
    AND NOT o.rolbypassrls
    AND pg_catalog.pg_has_role(c.relowner, 'authenticated', 'USAGE');
  IF v_forced IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: these tables force their row rules on their owner, and the owner has the rights of the authenticated role, so the wall would also block the owner''s own functions and triggers: %. An engineer must look.', v_forced;
  END IF;
END
$guard$;

-- ----------------------------------------------------------------------------
-- 1. The check: "is the person calling a confirmed Clearline account?"
-- ----------------------------------------------------------------------------
-- 2026-10-21: reads auth.users, which only Supabase Auth writes - never user_profiles.division or
-- user_metadata, which the user can set themselves (the sign-up form asks for a division).
-- SECURITY DEFINER because the authenticated role cannot read auth.users. search_path '' so nothing a
-- user creates can stand in for auth.users or auth.uid(); every name below is schema-qualified
-- (operators such as = and ~ always resolve from pg_catalog first).
CREATE OR REPLACE FUNCTION public.is_clearline_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.id = auth.uid()
      -- 2026-10-21: set by Supabase Auth only once the mailbox owner clicks the link (or straight
      -- away when "Confirm email" is off - which is why sign-up must be off).
      AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.now())
      -- 2026-10-21: plain ASCII only (one byte per character). lower() folds some non-ASCII capitals into
      -- ASCII letters (U+0130, a capital I with a dot, becomes i), so without this a look-alike domain that
      -- someone else can register could pass.
      AND pg_catalog.octet_length(u.email) = pg_catalog.char_length(u.email)
      -- 2026-10-21: exactly one "@" and exactly this domain, so x@evil.clearlinecap.com,
      -- x@clearlinecap.com.evil.io and a@b@clearlinecap.com all fail. [.] rather than a backslash
      -- so the pattern means the same whatever standard_conforming_strings is set to.
      AND pg_catalog.lower(u.email) ~ '^[^@]+@clearlinecap[.]com$'
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.is_clearline_staff() TO authenticated, anon;

COMMENT ON FUNCTION public.is_clearline_staff() IS
  'Staff-only wall (2026-10-21). True only when the caller (auth.uid()) is an auth.users row whose email is confirmed, plain ASCII and ends exactly in @clearlinecap.com (one @), and that is not deleted and not banned. Used by the RESTRICTIVE policy clearline_staff_only on every RLS table in public. Reads auth.users (written only by Supabase Auth), never user_profiles or user_metadata (users can edit those). Undo: database/security-2026-10-21-staff-only-UNDO.sql.';

-- ----------------------------------------------------------------------------
-- Scratch space for the self-test. TEMPORARY: only this editor session sees it, and it disappears at
-- COMMIT (or at the first error). It is only ever touched as the administrator.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE clearline_wall_people (
  persona  text PRIMARY KEY,   -- outsider | staff | non_staff_account | signed_out
  db_role  text NOT NULL,      -- the database role Supabase's API would use for this person
  claims   jsonb NOT NULL,     -- what the API would put in request.jwt.claims
  label    text NOT NULL       -- who it is, in words, for the report
) ON COMMIT DROP;

CREATE TEMP TABLE clearline_wall_counts (
  table_name    text NOT NULL,     -- quoted, schema-qualified
  table_schema  text NOT NULL,
  table_rel     text NOT NULL,
  persona       text NOT NULL,
  phase         text NOT NULL CHECK (phase IN ('before', 'after')),
  -- before: rows this person can see. after: 1 = sees at least one row, 0 = sees none.
  -- Both: -1 = not allowed to read it, -2 = read failed.
  visible_rows  bigint,
  PRIMARY KEY (table_name, persona, phase)
) ON COMMIT DROP;

-- 2026-10-21: ask the database one question AS one test person, the way Supabase's API does it (switch to their
-- database role, hand over their sign-in details), then switch straight back. Only three questions exist:
--   'count' - how many rows of this table can they see? (BEFORE)
--   'any'   - can they see at least one row? 1 = yes, 0 = no. (AFTER: a LIMIT 1 read stays cheap while the new
--             wall keeps every table locked.)
--   'check' - does the staff check say yes for them? 1 = yes, 0 = no.
-- Returns -1 when the person is not allowed to read it, -2 when the read failed for another reason.
-- Plain function (NOT security definer - Postgres forbids SET ROLE inside those). Temporary: it lives in pg_temp
-- and vanishes with the editor session.
CREATE OR REPLACE FUNCTION pg_temp.clearline_wall_probe(
  p_schema text, p_table text, p_role text, p_claims jsonb, p_question text)
RETURNS bigint
LANGUAGE plpgsql
AS $helper$
DECLARE
  v_rows      bigint;
  v_sql       text;
  v_admin     text := current_user;
  v_role_was  text := current_setting('role');   -- 'none' unless someone ran SET ROLE earlier
BEGIN
  -- 2026-10-21: this helper only ever plays the two API roles, and only asks its own three questions.
  IF p_role NOT IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: the self-test was asked to play role %', p_role;
  END IF;
  v_sql := CASE p_question
             WHEN 'count' THEN format('SELECT count(*) FROM %I.%I', p_schema, p_table)
             WHEN 'any'   THEN format('SELECT count(*) FROM (SELECT 1 FROM %I.%I LIMIT 1) AS first_row', p_schema, p_table)
             WHEN 'check' THEN 'SELECT CASE WHEN (SELECT public.is_clearline_staff()) THEN 1 ELSE 0 END'
           END;
  IF v_sql IS NULL THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: the self-test was asked an unknown question (%)', p_question;
  END IF;

  -- Become the test person. 2026-10-21: only request.jwt.claims and the role, as today's API (PostgREST v10 and
  -- later) does. The older one-setting-per-claim names are blanked on purpose: an auth.uid() or auth.role() that
  -- read only those must fail here exactly as it fails for real traffic, not pass because the test filled them in.
  PERFORM set_config('request.jwt.claims', p_claims::text, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claim.email', '', true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);

  -- 2026-10-21: the EXCEPTION block runs as a subtransaction, so a table this role may not read is recorded
  -- instead of aborting the script. The role switch sits OUTSIDE the block, so the switch back below runs
  -- on every path (a caught error only undoes what happened inside the block). A busy database (lock timeout,
  -- deadlock) is not caught: it stops the whole run, which then changes nothing.
  BEGIN
    EXECUTE v_sql INTO v_rows;
  EXCEPTION
    WHEN lock_not_available OR deadlock_detected THEN
      RAISE;
    WHEN insufficient_privilege THEN
      v_rows := -1;
    WHEN OTHERS THEN
      RAISE NOTICE 'self-test: question % on %.% as % failed: % (%)',
        p_question, p_schema, p_table, COALESCE(p_claims ->> 'email', p_role), SQLERRM, SQLSTATE;
      v_rows := -2;
  END;

  -- Back to the administrator, sign-in details cleared.
  IF v_role_was = 'none' THEN
    EXECUTE 'RESET ROLE';
  ELSE
    EXECUTE format('SET LOCAL ROLE %I', v_role_was);
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);

  -- 2026-10-21: belt and braces - never carry on as the test person.
  IF current_user IS DISTINCT FROM v_admin OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: the self-test could not switch back from the test person.';
  END IF;
  RETURN v_rows;
END
$helper$;

-- 2026-10-21: turns a BEFORE count into words for the report.
CREATE OR REPLACE FUNCTION pg_temp.clearline_wall_says(p_rows bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $says$
  SELECT CASE
           WHEN p_rows IS NULL THEN 'not tested'
           WHEN p_rows = -1 THEN 'not allowed to read it'
           WHEN p_rows = -2 THEN 'read failed'
           WHEN p_rows = 1 THEN '1 row'
           ELSE p_rows::text || ' rows'
         END
$says$;

-- 2026-10-21: turns an AFTER answer (does this person see any row?) into words for the report.
CREATE OR REPLACE FUNCTION pg_temp.clearline_wall_says_now(p_any bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $saysnow$
  SELECT CASE
           WHEN p_any IS NULL THEN 'not tested'
           WHEN p_any = -1 THEN 'not allowed to read it'
           WHEN p_any = -2 THEN 'read failed'
           WHEN p_any = 0 THEN 'nothing'
           ELSE 'some rows'
         END
$saysnow$;

-- ----------------------------------------------------------------------------
-- 2. Self-test BEFORE the wall: who can see what today?
-- ----------------------------------------------------------------------------
DO $before$
DECLARE
  v_outsider    uuid;
  v_staff       record;
  v_other       record;
  v_has_other   boolean;
  v_user        record;
  v_got         boolean;
  v_tab         record;
  v_person      record;
  v_rows        bigint;
  v_tables      integer := 0;
BEGIN
  -- (b) A real staff account: the confirmed Clearline account that signed in most recently.
  SELECT u.id, u.email, u.raw_app_meta_data, u.raw_user_meta_data
    INTO v_staff
  FROM auth.users AS u
  WHERE u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now())
    AND octet_length(u.email) = char_length(u.email)
    AND lower(u.email) ~ '^[^@]+@clearlinecap[.]com$'
  ORDER BY u.last_sign_in_at DESC NULLS LAST, u.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: no confirmed @clearlinecap.com user found - stop';
  END IF;

  -- (a) An outsider: a made-up account id that is not in auth.users.
  LOOP
    v_outsider := gen_random_uuid();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = v_outsider);
  END LOOP;

  -- (c) The newest real account that is NOT staff and can still sign in (not deleted, not banned;
  -- confirmed ones first), if there is one. It shows what real outsiders, with whatever division they
  -- picked, could actually read.
  SELECT u.id, u.email, u.raw_app_meta_data, u.raw_user_meta_data
    INTO v_other
  FROM auth.users AS u
  WHERE u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now())
    AND NOT COALESCE(
          u.email_confirmed_at IS NOT NULL
          AND octet_length(u.email) = char_length(u.email)
          AND lower(u.email) ~ '^[^@]+@clearlinecap[.]com$', false)
  ORDER BY (u.email_confirmed_at IS NOT NULL) DESC, u.last_sign_in_at DESC NULLS LAST, u.created_at DESC
  LIMIT 1;
  v_has_other := FOUND;

  -- 2026-10-21: prove the new check agrees, for EVERY account that exists, with the same rule written a
  -- second, independent way (ASCII-only case folding with translate() on the last 17 characters, plus the
  -- position of the only "@"), and that it says no to an unknown account and to nobody at all. The sign-in
  -- details go in request.jwt.claims only, as real traffic does.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claim.email', '', true);
  FOR v_user IN
    SELECT u.id, u.email,
           COALESCE(
             u.email_confirmed_at IS NOT NULL
             AND u.deleted_at IS NULL
             AND COALESCE(u.banned_until <= now(), true)
             AND octet_length(u.email) = length(u.email)
             AND translate(right(u.email, 17), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = '@clearlinecap.com'
             AND strpos(u.email, '@') = length(u.email) - 16
             AND length(u.email) > 17,
           false) AS expected
    FROM auth.users AS u
  LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user.id, 'role', 'authenticated')::text, true);
    v_got := public.is_clearline_staff();
    IF v_got IS DISTINCT FROM v_user.expected THEN
      RAISE EXCEPTION 'STOPPED, nothing was changed: the staff check says % for account %, but the rule says %.',
        CASE WHEN v_got THEN 'yes' ELSE 'no' END, v_user.email, CASE WHEN v_user.expected THEN 'yes' ELSE 'no' END;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  IF public.is_clearline_staff() THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: the staff check let a made-up account through.';
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  IF public.is_clearline_staff() THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: the staff check let a signed-out visitor through.';
  END IF;

  -- The test people, with the sign-in details Supabase's API would give each of them.
  INSERT INTO pg_temp.clearline_wall_people (persona, db_role, claims, label) VALUES
    ('outsider', 'authenticated',
     jsonb_build_object(
       'sub', v_outsider, 'role', 'authenticated', 'email', 'outsider@example.invalid', 'aud', 'authenticated',
       'app_metadata', jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
       -- 2026-10-21: the worst a stranger could type into the sign-up form.
       'user_metadata', jsonb_build_object('division', 'Super', 'role', 'admin')),
     'a made-up outsider account (outsider@example.invalid)'),
    ('staff', 'authenticated',
     jsonb_build_object(
       'sub', v_staff.id, 'role', 'authenticated', 'email', v_staff.email, 'aud', 'authenticated',
       'app_metadata', COALESCE(v_staff.raw_app_meta_data, '{}'::jsonb),
       'user_metadata', COALESCE(v_staff.raw_user_meta_data, '{}'::jsonb)),
     'staff account ' || v_staff.email),
    ('signed_out', 'anon', jsonb_build_object('role', 'anon'),
     'a signed-out visitor (the public key in the web page)');
  IF v_has_other THEN
    INSERT INTO pg_temp.clearline_wall_people (persona, db_role, claims, label) VALUES
      ('non_staff_account', 'authenticated',
       jsonb_build_object(
         'sub', v_other.id, 'role', 'authenticated', 'email', COALESCE(v_other.email, ''), 'aud', 'authenticated',
         'app_metadata', COALESCE(v_other.raw_app_meta_data, '{}'::jsonb),
         'user_metadata', COALESCE(v_other.raw_user_meta_data, '{}'::jsonb)),
       'non-staff account ' || COALESCE(v_other.email, v_other.id::text));
  END IF;

  -- Count, per table and per person. The count comes back in a variable and is written down as the
  -- administrator, so the test roles never need any right on the scratch tables.
  FOR v_tab IN
    SELECT n.nspname AS table_schema, c.relname AS table_rel
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
    ORDER BY c.relname
  LOOP
    v_tables := v_tables + 1;
    FOR v_person IN SELECT p.persona, p.db_role, p.claims FROM pg_temp.clearline_wall_people p ORDER BY p.persona LOOP
      v_rows := pg_temp.clearline_wall_probe(v_tab.table_schema, v_tab.table_rel, v_person.db_role, v_person.claims, 'count');
      INSERT INTO pg_temp.clearline_wall_counts (table_name, table_schema, table_rel, persona, phase, visible_rows)
      VALUES (format('%I.%I', v_tab.table_schema, v_tab.table_rel), v_tab.table_schema, v_tab.table_rel,
              v_person.persona, 'before', v_rows);
    END LOOP;
  END LOOP;

  IF v_tables = 0 THEN
    RAISE NOTICE 'No table in the public schema has row level security switched on, so there is nothing to wall. See report section a.';
  END IF;
  RAISE NOTICE 'Before the wall: % table(s) counted. Staff test account: %. Non-staff account tested: %.',
    v_tables, v_staff.email, CASE WHEN v_has_other THEN COALESCE(v_other.email, v_other.id::text) ELSE 'none exists' END;
END
$before$;

-- 2026-10-21: from here to COMMIT every walled table is locked against every other session, the service role
-- included. If any one statement runs longer than this, it stops, and everything rolls back on its own.
SET LOCAL statement_timeout = '60s';

-- ----------------------------------------------------------------------------
-- 3. The wall: one RESTRICTIVE policy on every public table that has row level security switched on.
-- ----------------------------------------------------------------------------
DO $wall$
DECLARE
  v_tab record;
BEGIN
  FOR v_tab IN
    SELECT n.nspname AS table_schema, c.relname AS table_rel
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
    ORDER BY c.relname
  LOOP
    -- 2026-10-21: RESTRICTIVE = ANDed with whatever permissive policies the table already has, so this works
    -- without knowing which of Flow's policy files are live, and can only narrow access, never widen it.
    -- FOR ALL covers reads (USING) and writes (WITH CHECK). TO authenticated: anon is untouched and
    -- service_role skips policies (BYPASSRLS). (select ...) runs the check once per query, not once per row.
    EXECUTE format('DROP POLICY IF EXISTS clearline_staff_only ON %I.%I', v_tab.table_schema, v_tab.table_rel);
    EXECUTE format('CREATE POLICY clearline_staff_only ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.is_clearline_staff())) WITH CHECK ((select public.is_clearline_staff()))', v_tab.table_schema, v_tab.table_rel);
  END LOOP;
END
$wall$;

-- ----------------------------------------------------------------------------
-- 4. Self-test AFTER the wall. Any failure here stops everything and nothing is changed.
--    Kept cheap on purpose: every walled table is locked until COMMIT.
-- ----------------------------------------------------------------------------
DO $after$
DECLARE
  v_row          record;
  v_rows         bigint;
  v_bad          text;
  v_staff        record;
  v_has_other    boolean;
  v_other_label  text;
  v_tables       integer;
  v_open_tables  integer;
  v_open_rows    bigint;
  v_tables_json  jsonb;
  v_headline     text;
  v_summary      text;
BEGIN
  -- 2026-10-21: every RLS table in public that the BEFORE test counted now carries exactly the wall, in exactly
  -- this shape. (This reads the run's one snapshot, so a table whose row rules another session switched on
  -- mid-run is not seen here; report section i looks again after COMMIT.)
  SELECT string_agg(format('%I.%I', n.nspname, c.relname), ', ' ORDER BY c.relname)
    INTO v_bad
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relrowsecurity
    AND (
      NOT EXISTS (SELECT 1 FROM pg_temp.clearline_wall_counts k
                  WHERE k.table_schema = n.nspname AND k.table_rel = c.relname AND k.phase = 'before')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies p
                     WHERE p.schemaname = n.nspname
                       AND p.tablename = c.relname
                       AND p.policyname = 'clearline_staff_only'
                       AND p.permissive = 'RESTRICTIVE'
                       AND p.cmd = 'ALL'
                       AND p.roles = ARRAY['authenticated']::name[]
                       AND p.qual LIKE '%is_clearline_staff()%'
                       AND p.with_check LIKE '%is_clearline_staff()%'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: the wall is missing or not right on: %', v_bad;
  END IF;

  -- 2026-10-21: TEST 1 - through the API role, the staff check must say yes for the staff test person. A
  -- restrictive rule that is true leaves the table's other rules exactly as they were, so this (with TEST 3)
  -- is what keeps staff access the same, without recounting every table while they are locked.
  SELECT p.db_role, p.claims, p.label INTO v_staff FROM pg_temp.clearline_wall_people p WHERE p.persona = 'staff';
  v_rows := pg_temp.clearline_wall_probe(NULL, NULL, v_staff.db_role, v_staff.claims, 'check');
  IF v_rows IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: through the API the staff check does not say yes for the % (answer: %), so the wall would lock staff out.',
      v_staff.label, CASE v_rows WHEN 0 THEN 'no' WHEN -1 THEN 'not allowed to run the check' ELSE 'the check failed' END;
  END IF;

  -- Then one cheap read per table and person: can they see at least one row? The signed-out visitor is not
  -- asked again: the wall is for signed-in accounts only, so nothing changed for them.
  FOR v_row IN
    SELECT k.table_name, k.table_schema, k.table_rel, k.persona, p.db_role, p.claims
    FROM pg_temp.clearline_wall_counts k
    JOIN pg_temp.clearline_wall_people p ON p.persona = k.persona
    WHERE k.phase = 'before'
      AND k.persona IN ('outsider', 'non_staff_account', 'staff')
    ORDER BY k.table_name, k.persona
  LOOP
    v_rows := pg_temp.clearline_wall_probe(v_row.table_schema, v_row.table_rel, v_row.db_role, v_row.claims, 'any');
    INSERT INTO pg_temp.clearline_wall_counts (table_name, table_schema, table_rel, persona, phase, visible_rows)
    VALUES (v_row.table_name, v_row.table_schema, v_row.table_rel, v_row.persona, 'after', v_rows);
  END LOOP;

  -- 2026-10-21: TEST 2 - an outsider (made-up, or a real non-staff account) must now see nothing anywhere.
  -- "Not allowed to read it" (-1) and "read failed" (-2) also mean nothing was seen.
  SELECT string_agg(format('%s (%s: %s)', a.table_name, a.persona, pg_temp.clearline_wall_says_now(a.visible_rows)), ', ' ORDER BY a.table_name)
    INTO v_bad
  FROM pg_temp.clearline_wall_counts a
  WHERE a.phase = 'after'
    AND a.persona IN ('outsider', 'non_staff_account')
    AND a.visible_rows > 0;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: after adding the wall an outsider could still see rows in: %', v_bad;
  END IF;

  -- 2026-10-21: TEST 3 - the staff account still reads every table the way it did: rows where it had rows, none
  -- where it had none, and refused where it was refused. LEAST(before, 1) is what the AFTER answer must be.
  SELECT string_agg(format('%s (before: %s, after: %s)', b.table_name,
                           pg_temp.clearline_wall_says(b.visible_rows), pg_temp.clearline_wall_says_now(a.visible_rows)),
                    ', ' ORDER BY b.table_name)
    INTO v_bad
  FROM pg_temp.clearline_wall_counts b
  LEFT JOIN pg_temp.clearline_wall_counts a
    ON a.table_name = b.table_name AND a.persona = b.persona AND a.phase = 'after'
  WHERE b.phase = 'before'
    AND b.persona = 'staff'
    AND (a.table_name IS NULL OR a.visible_rows IS DISTINCT FROM LEAST(b.visible_rows, 1));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED, nothing was changed: the wall changed what the staff account can see in: %', v_bad;
  END IF;

  -- All tests passed. Say what was exposed, and keep a copy of the results for the report below.
  SELECT EXISTS (SELECT 1 FROM pg_temp.clearline_wall_people WHERE persona = 'non_staff_account') INTO v_has_other;
  SELECT label INTO v_other_label FROM pg_temp.clearline_wall_people WHERE persona = 'non_staff_account';

  FOR v_row IN
    SELECT b.table_name, p.label, b.visible_rows
    FROM pg_temp.clearline_wall_counts b
    JOIN pg_temp.clearline_wall_people p ON p.persona = b.persona
    WHERE b.phase = 'before'
      AND b.persona IN ('outsider', 'non_staff_account')
      AND b.visible_rows > 0
    ORDER BY b.table_name, b.persona
  LOOP
    RAISE NOTICE 'WAS EXPOSED: % - % could see % before the wall; now nothing.',
      v_row.table_name, v_row.label, pg_temp.clearline_wall_says(v_row.visible_rows);
  END LOOP;

  WITH w AS (
    SELECT k.table_name,
           max(k.visible_rows) FILTER (WHERE k.persona = 'outsider'          AND k.phase = 'before') AS outsider_before,
           max(k.visible_rows) FILTER (WHERE k.persona = 'outsider'          AND k.phase = 'after')  AS outsider_after,
           max(k.visible_rows) FILTER (WHERE k.persona = 'staff'             AND k.phase = 'before') AS staff_before,
           max(k.visible_rows) FILTER (WHERE k.persona = 'non_staff_account' AND k.phase = 'before') AS other_before,
           max(k.visible_rows) FILTER (WHERE k.persona = 'non_staff_account' AND k.phase = 'after')  AS other_after,
           max(k.visible_rows) FILTER (WHERE k.persona = 'signed_out'        AND k.phase = 'before') AS signed_out_rows
    FROM pg_temp.clearline_wall_counts k
    GROUP BY k.table_name
  )
  SELECT count(*),
         count(*) FILTER (WHERE GREATEST(w.outsider_before, w.other_before) > 0),
         COALESCE(sum(GREATEST(w.outsider_before, w.other_before)) FILTER (WHERE GREATEST(w.outsider_before, w.other_before) > 0), 0),
         COALESCE(jsonb_agg(jsonb_build_object(
           'table_name', w.table_name,
           'was_open', COALESCE(GREATEST(w.outsider_before, w.other_before) > 0, false),
           'signed_out_rows', w.signed_out_rows,
           'details', concat_ws(' | ',
              'outsider: ' || pg_temp.clearline_wall_says(w.outsider_before) || ' before, '
                           || pg_temp.clearline_wall_says_now(w.outsider_after) || ' now',
              CASE WHEN v_has_other THEN
                'non-staff account: ' || pg_temp.clearline_wall_says(w.other_before) || ' before, '
                                      || pg_temp.clearline_wall_says_now(w.other_after) || ' now'
              END,
              -- TEST 3 passed, so the staff account reads this table exactly as before.
              'staff: ' || CASE
                             WHEN w.staff_before > 0 THEN pg_temp.clearline_wall_says(w.staff_before) || ' before, the same now'
                             WHEN w.staff_before = 0 THEN 'no rows before, none now'
                             ELSE pg_temp.clearline_wall_says(w.staff_before) || ', before and now'
                           END,
              'signed-out visitor: ' || pg_temp.clearline_wall_says(w.signed_out_rows)),
           'what_to_do', concat_ws(' ',
              CASE WHEN COALESCE(GREATEST(w.outsider_before, w.other_before) > 0, false)
                   THEN 'WAS OPEN to accounts from outside Clearline. Closed now.'
                   ELSE 'Was already closed to outsiders. Nothing changed for staff.' END,
              CASE WHEN w.signed_out_rows > 0
                   THEN 'A signed-out visitor can still read it - see section f.' END)
         ) ORDER BY COALESCE(GREATEST(w.outsider_before, w.other_before) > 0, false) DESC, w.table_name), '[]'::jsonb)
    INTO v_tables, v_open_tables, v_open_rows, v_tables_json
  FROM w;

  v_headline := format('The wall is on %s table(s) and passed its tests.', v_tables);
  v_summary := format(
    'Before: accounts from outside Clearline could read %s row(s) across %s table(s). Now: none. The %s still passes the check and still reads every table it read before (the wall can only remove access from accounts that fail the check). Also tested: %s.',
    v_open_rows, v_open_tables, v_staff.label,
    COALESCE(v_other_label, 'no other non-staff account exists') || ', a made-up outsider, and a signed-out visitor');

  RAISE NOTICE '%', v_headline;
  RAISE NOTICE '%', v_summary;

  -- 2026-10-21: a session setting (not LOCAL) outlives COMMIT, so the read-only report after it can show the
  -- test results without a permanent table. If this transaction fails, the setting is rolled back with it.
  PERFORM set_config('clearline.wall_report',
                     jsonb_build_object('summary', jsonb_build_object('headline', v_headline, 'details', v_summary),
                                        'tables', v_tables_json)::text,
                     false);
END
$after$;

COMMIT;

-- ----------------------------------------------------------------------------
-- 5. The report. Read-only: it changes nothing. One result table, because the Supabase editor shows only the
--    last statement's result. Each block below is one section, with its own named columns. It runs after COMMIT,
--    on a fresh snapshot, so section i sees anything that changed while the script ran.
-- ----------------------------------------------------------------------------
WITH
self_test AS (
  -- What the self-test measured (kept by the script for this editor session only).
  SELECT NULLIF(current_setting('clearline.wall_report', true), '')::jsonb AS j
),
walled_tables AS (
  SELECT t.table_name AS walled_table, t.was_open AS was_open_to_outsiders, t.details AS rows_seen,
         t.what_to_do, t.signed_out_rows AS rows_a_signed_out_visitor_sees
  FROM self_test s,
       jsonb_to_recordset(COALESCE(s.j -> 'tables', '[]'::jsonb))
         AS t(table_name text, was_open boolean, details text, what_to_do text, signed_out_rows bigint)
),
a_rls_switched_off AS (
  -- a. Tables (and foreign tables) whose row rules are switched off but that the API roles can use.
  SELECT format('%I.%I', n.nspname, c.relname) AS table_not_covered,
         CASE c.relkind WHEN 'f' THEN 'foreign table' WHEN 'p' THEN 'partitioned table' ELSE 'table' END AS kind,
         concat_ws(', ',
           CASE WHEN has_table_privilege('anon', c.oid, 'SELECT') OR has_any_column_privilege('anon', c.oid, 'SELECT')
                THEN 'signed-out visitors can READ it' END,
           CASE WHEN has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') OR has_any_column_privilege('anon', c.oid, 'INSERT,UPDATE')
                THEN 'signed-out visitors can CHANGE it' END,
           CASE WHEN has_table_privilege('authenticated', c.oid, 'SELECT') OR has_any_column_privilege('authenticated', c.oid, 'SELECT')
                THEN 'any signed-in account can READ it' END,
           CASE WHEN has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') OR has_any_column_privilege('authenticated', c.oid, 'INSERT,UPDATE')
                THEN 'any signed-in account can CHANGE it' END) AS who_can_use_it
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'f')
    AND NOT c.relrowsecurity
    AND (   has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
         OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
         OR has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE')
         OR has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE'))
),
b_views AS (
  -- b. Views and materialized views the API roles can read. A view runs with its owner's rights (skipping
  --    row rules) unless security_invoker is set; a materialized view has no row rules at all.
  SELECT format('%I.%I', n.nspname, c.relname) AS view_name,
         CASE c.relkind WHEN 'v' THEN 'view' ELSE 'materialized view' END AS kind,
         (c.relkind = 'v' AND COALESCE(
            (SELECT lower(o.option_value) IN ('true', 'on', '1', 'yes')
             FROM pg_options_to_table(c.reloptions) o
             WHERE o.option_name = 'security_invoker'), false)) AS security_invoker_is_set,
         concat_ws(', ',
           CASE WHEN has_table_privilege('anon', c.oid, 'SELECT') THEN 'signed-out visitors' END,
           CASE WHEN has_table_privilege('authenticated', c.oid, 'SELECT') THEN 'any signed-in account' END) AS who_can_read_it
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('v', 'm')
    AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'SELECT'))
),
c_definer_functions AS (
  -- c. SECURITY DEFINER functions the API roles can call: they run with their owner's rights, skipping row rules.
  SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS function_with_arguments,
         (p.oid = 'public.is_clearline_staff()'::regprocedure) AS is_this_scripts_check,
         (p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype)) AS is_trigger_function,
         concat_ws(', ',
           CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'signed-out visitors' END,
           CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'any signed-in account' END) AS who_can_call_it
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
),
d_not_staff AS (
  -- d. Accounts that are NOT Clearline staff (the same rule as the check function).
  SELECT COALESCE(u.email, '(no email address) id ' || u.id::text) AS account,
         u.created_at, u.last_sign_in_at, u.email_confirmed_at,
         (SELECT string_agg(DISTINCT i.provider, ', ') FROM auth.identities i WHERE i.user_id = u.id) AS signed_up_with,
         CASE
           WHEN u.deleted_at IS NOT NULL THEN 2
           WHEN octet_length(u.email) = char_length(u.email) AND lower(u.email) ~ '^[^@]+@clearlinecap[.]com$' THEN 1
           ELSE 0
         END AS sort_order,
         CASE
           WHEN u.deleted_at IS NOT NULL
             THEN 'Already deleted - it cannot sign in. Nothing to do.'
           WHEN u.email IS NULL OR lower(u.email) !~ '^[^@]+@clearlinecap[.]com$'
             THEN 'Not a @clearlinecap.com address. Remove it (Authentication -> Users).'
           WHEN octet_length(u.email) <> char_length(u.email)
             THEN 'Looks like a @clearlinecap.com address but uses a letter that is not plain English, so it is a look-alike. Remove it (Authentication -> Users).'
           WHEN u.email_confirmed_at IS NULL
             THEN 'Clearline address that never confirmed its email - see section e. Check with the person before removing it.'
           WHEN u.banned_until > now()
             THEN 'Clearline address that is banned. Nothing to do unless the ban is a mistake.'
           ELSE 'Not staff. Remove it (Authentication -> Users).'
         END AS why_not_staff_and_what_to_do
  FROM auth.users u
  WHERE NOT COALESCE(
          u.email_confirmed_at IS NOT NULL
          AND u.deleted_at IS NULL
          AND (u.banned_until IS NULL OR u.banned_until <= now())
          AND octet_length(u.email) = char_length(u.email)
          AND lower(u.email) ~ '^[^@]+@clearlinecap[.]com$', false)
),
e_unconfirmed_clearline AS (
  -- e. Clearline addresses that never confirmed their email: the wall keeps them out until they do.
  SELECT u.email AS clearline_account_not_confirmed, u.created_at, u.last_sign_in_at
  FROM auth.users u
  WHERE octet_length(u.email) = char_length(u.email)
    AND lower(u.email) ~ '^[^@]+@clearlinecap[.]com$'
    AND u.email_confirmed_at IS NULL
    AND u.deleted_at IS NULL
),
g_gets_through AS (
  -- g. Every account that GETS THROUGH the wall (the same rule as the check function). An address confirmed about
  --    0 seconds after it was created was confirmed automatically: nobody clicked a link in that mailbox.
  SELECT u.email AS account_that_gets_through,
         u.created_at, u.last_sign_in_at,
         round(EXTRACT(EPOCH FROM (u.email_confirmed_at - u.created_at))) AS seconds_from_created_to_confirmed,
         (SELECT string_agg(DISTINCT i.provider, ', ') FROM auth.identities i WHERE i.user_id = u.id) AS signed_up_with
  FROM auth.users u
  WHERE u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now())
    AND octet_length(u.email) = char_length(u.email)
    AND lower(u.email) ~ '^[^@]+@clearlinecap[.]com$'
),
h_anon_write_rules AS (
  -- h. Permissive row rules a signed-out visitor falls under (TO anon, or no TO at all = PUBLIC) that allow adding,
  --    changing or removing rows, with the table rights anon has for that command. The wall does not cover anon.
  SELECT format('%I.%I', p.schemaname, p.tablename) AS table_name,
         p.policyname, p.cmd, array_to_string(p.roles, ', ') AS applies_to, p.qual AS row_test, p.with_check AS new_row_test,
         concat_ws(', ',
           CASE WHEN p.cmd IN ('INSERT', 'ALL')
                 AND (has_table_privilege('anon', c.oid, 'INSERT') OR has_any_column_privilege('anon', c.oid, 'INSERT'))
                THEN 'add rows' END,
           CASE WHEN p.cmd IN ('UPDATE', 'ALL')
                 AND (has_table_privilege('anon', c.oid, 'UPDATE') OR has_any_column_privilege('anon', c.oid, 'UPDATE'))
                THEN 'change rows' END,
           CASE WHEN p.cmd IN ('DELETE', 'ALL') AND has_table_privilege('anon', c.oid, 'DELETE')
                THEN 'remove rows' END) AS anon_table_rights
  FROM pg_catalog.pg_policies p
  JOIN pg_catalog.pg_namespace n ON n.nspname = p.schemaname
  JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = p.tablename
  WHERE p.schemaname = 'public'
    AND c.relrowsecurity
    AND p.permissive = 'PERMISSIVE'
    AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND ('anon' = ANY (p.roles) OR 'public' = ANY (p.roles))
),
i_rls_without_wall AS (
  -- i. Checked after COMMIT, on a fresh snapshot: tables with row rules switched on that do not carry the wall.
  SELECT format('%I.%I', n.nspname, c.relname) AS rls_table_without_the_wall
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies p
                    WHERE p.schemaname = n.nspname AND p.tablename = c.relname AND p.policyname = 'clearline_staff_only')
),
j_other_logins AS (
  -- j. Other logins with the rights of the authenticated role that do not skip row rules. Connecting directly,
  --    nobody is signed in, so the check says no and a walled table shows them nothing - unless they own it.
  SELECT r.rolname::text AS login_behind_the_wall,
         NOT EXISTS (SELECT 1
                     FROM pg_catalog.pg_class c
                     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = 'public'
                       AND c.relkind IN ('r', 'p')
                       AND c.relrowsecurity
                       AND (c.relforcerowsecurity OR NOT pg_has_role(r.oid, c.relowner, 'USAGE'))) AS owns_every_walled_table
  FROM pg_catalog.pg_roles r
  WHERE r.rolcanlogin
    AND NOT r.rolsuper
    AND NOT r.rolbypassrls
    AND r.rolname <> 'authenticator'
    AND pg_has_role(r.oid, 'authenticated', 'USAGE')
)
SELECT r.section AS "section", r.item AS "what", r.details AS "details", r.what_to_do AS "what to do"
FROM (
  SELECT 0 AS sort, 0 AS sub, '0. Result' AS section,
         COALESCE(s.j #>> '{summary,headline}', 'Self-test details are not available in this editor session.') AS item,
         COALESCE(s.j #>> '{summary,details}', 'If no error was shown, the wall was added and passed its tests.') AS details,
         'Make sure "Allow new users to sign up" is OFF and "Confirm email" is ON (Authentication -> Sign In / Providers). Remove every account in section d that says "Remove it". Check every account in section g. Then read the other sections.' AS what_to_do
  FROM self_test s

  UNION ALL
  SELECT 1, CASE WHEN w.was_open_to_outsiders THEN 0 ELSE 1 END, '1. Walled table',
         w.walled_table, w.rows_seen, w.what_to_do
  FROM walled_tables w

  UNION ALL
  SELECT 2, 0, 'a. NOT covered: row rules switched off',
         a.table_not_covered, a.kind || ': ' || a.who_can_use_it,
         'The wall cannot cover it because its row rules are switched off, so these roles get every row. An engineer should switch row level security on (with policies) or take the access away.'
  FROM a_rls_switched_off a
  UNION ALL
  SELECT 2, 1, 'a. NOT covered: row rules switched off', '(none found)', '', 'Nothing to do.'
  WHERE NOT EXISTS (SELECT 1 FROM a_rls_switched_off)

  UNION ALL
  SELECT 3, CASE WHEN b.security_invoker_is_set THEN 1 ELSE 0 END, 'b. View the API roles can read',
         b.view_name,
         b.kind || ', readable by ' || b.who_can_read_it || ', security_invoker: '
           || CASE WHEN b.security_invoker_is_set THEN 'yes' ELSE 'no' END,
         CASE
           WHEN b.kind = 'materialized view'
             THEN 'NOT covered: a materialized view is a stored copy with no row rules. An engineer should take the access away or move it out of the public schema.'
           WHEN b.security_invoker_is_set
             THEN 'Covered: it applies the row rules (and the wall) of the person reading it.'
           ELSE 'NOT covered: it reads its tables with its owner''s rights, skipping the wall. An engineer should set security_invoker = true on it, or take the access away.'
         END
  FROM b_views b
  UNION ALL
  SELECT 3, 2, 'b. View the API roles can read', '(none found)', '', 'Nothing to do.'
  WHERE NOT EXISTS (SELECT 1 FROM b_views)

  UNION ALL
  SELECT 4, CASE WHEN f.is_this_scripts_check THEN 2 WHEN f.is_trigger_function THEN 1 ELSE 0 END,
         'c. Function that skips row rules (SECURITY DEFINER)',
         f.function_with_arguments, 'callable by ' || f.who_can_call_it,
         CASE
           WHEN f.is_this_scripts_check
             THEN 'This script''s own check. It only answers yes or no about the caller. Expected.'
           WHEN f.is_trigger_function
             THEN 'Trigger function: the API cannot call it directly. Low risk.'
           ELSE 'Runs with its owner''s rights and skips the wall. An engineer should check what it returns or changes, and who really needs to call it.'
         END
  FROM c_definer_functions f

  UNION ALL
  SELECT 5, d.sort_order, 'd. Account that is NOT Clearline staff',
         d.account,
         concat_ws('; ',
           'created ' || COALESCE(to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC', 'unknown'),
           'last sign-in ' || COALESCE(to_char(d.last_sign_in_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC', 'never'),
           'email confirmed ' || COALESCE(to_char(d.email_confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC', 'no'),
           'signed up with ' || COALESCE(d.signed_up_with, 'unknown')),
         d.why_not_staff_and_what_to_do
  FROM d_not_staff d
  UNION ALL
  SELECT 5, 3, 'd. Account that is NOT Clearline staff', '(none found)', '', 'Nothing to do.'
  WHERE NOT EXISTS (SELECT 1 FROM d_not_staff)

  UNION ALL
  SELECT 6, 0, 'e. Clearline address NOT confirmed',
         e.clearline_account_not_confirmed,
         concat_ws('; ',
           'created ' || COALESCE(to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC', 'unknown'),
           'last sign-in ' || COALESCE(to_char(e.last_sign_in_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC', 'never')),
         'Cannot get in until the email is confirmed. Re-send the invite (Authentication -> Users), or remove it if nobody uses it.'
  FROM e_unconfirmed_clearline e
  UNION ALL
  SELECT 6, 1, 'e. Clearline address NOT confirmed', '(none found)', '', 'Nothing to do.'
  WHERE NOT EXISTS (SELECT 1 FROM e_unconfirmed_clearline)

  UNION ALL
  SELECT 7, 0, 'f. Table a signed-out visitor can read',
         w.walled_table, 'a signed-out visitor can read ' || w.rows_a_signed_out_visitor_sees || ' row(s)',
         'Not covered: the wall is for signed-in accounts. An engineer should check whether this table is meant to be public.'
  FROM walled_tables w
  WHERE w.rows_a_signed_out_visitor_sees > 0
  UNION ALL
  SELECT 7, 1, 'f. Table a signed-out visitor can read',
         CASE WHEN (SELECT j FROM self_test) IS NULL THEN '(self-test details not available)' ELSE '(none found)' END,
         '', 'Nothing to do.'
  WHERE NOT EXISTS (SELECT 1 FROM walled_tables w WHERE w.rows_a_signed_out_visitor_sees > 0)

  UNION ALL
  SELECT 8,
         CASE WHEN g.seconds_from_created_to_confirmed < 5 AND COALESCE(g.signed_up_with, '') LIKE '%email%' THEN 0 ELSE 1 END,
         'g. Account that GETS THROUGH the wall',
         g.account_that_gets_through,
         concat_ws('; ',
           'created ' || COALESCE(to_char(g.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC', 'unknown'),
           'email confirmed ' || g.seconds_from_created_to_confirmed::text || ' second(s) after it was created',
           'last sign-in ' || COALESCE(to_char(g.last_sign_in_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC', 'never'),
           'signed up with ' || COALESCE(g.signed_up_with, 'unknown')),
         CASE
           WHEN g.seconds_from_created_to_confirmed < 5 AND COALESCE(g.signed_up_with, '') LIKE '%email%'
             THEN 'Check this is a real colleague. Its email was confirmed straight away, so nobody clicked a link in that mailbox. That is normal if an admin created the account. Otherwise it may be a made-up address. If you do not know who it is, remove it (Authentication -> Users).'
           ELSE 'Check this is a real colleague. If you do not know who it is, remove it (Authentication -> Users).'
         END
  FROM g_gets_through g

  UNION ALL
  SELECT 9, CASE WHEN h.anon_table_rights <> '' THEN 0 ELSE 1 END,
         'h. Rule that may let a signed-out visitor change data',
         h.table_name || ' - rule ' || quote_ident(h.policyname),
         concat_ws('; ',
           'for ' || h.cmd || ', applies to ' || h.applies_to,
           'signed-out visitors have the table right to: ' || COALESCE(NULLIF(h.anon_table_rights, ''), 'none of it'),
           'row test: ' || COALESCE(h.row_test, '(none)'),
           'new-row test: ' || COALESCE(h.new_row_test, '(none)')),
         CASE
           WHEN h.anon_table_rights <> ''
             THEN 'Not covered: the wall is for signed-in accounts. An engineer should read the row tests and decide whether a signed-out visitor should be able to do this.'
           ELSE 'Signed-out visitors have no table right for this today, so they cannot use the rule. Low risk.'
         END
  FROM h_anon_write_rules h
  UNION ALL
  SELECT 9, 2, 'h. Rule that may let a signed-out visitor change data', '(none found)', '', 'Nothing to do.'
  WHERE NOT EXISTS (SELECT 1 FROM h_anon_write_rules)

  UNION ALL
  SELECT 10, 0, 'i. Last check: row rules on, but NO wall',
         i.rls_table_without_the_wall, 'its row rules were switched on while the script ran',
         'Run this script again: it will put the wall on this table too.'
  FROM i_rls_without_wall i
  UNION ALL
  SELECT 10, 1, 'i. Last check: row rules on, but NO wall', '(none found)', '',
         'Nothing to do. Every table with row rules has the wall.'
  WHERE NOT EXISTS (SELECT 1 FROM i_rls_without_wall)

  UNION ALL
  SELECT 11, CASE WHEN j.owns_every_walled_table THEN 1 ELSE 0 END,
         'j. Other database login behind the wall',
         j.login_behind_the_wall, 'logs in directly, with the rights of the authenticated role',
         CASE
           WHEN j.owns_every_walled_table
             THEN 'It owns Flow''s tables, so it skips their row rules. Nothing to do.'
           WHEN j.login_behind_the_wall LIKE 'supabase%'
             THEN 'One of Supabase''s own logins. Nothing to do unless it reads Flow''s tables.'
           ELSE 'When it reads a walled table directly, nobody is signed in, so it now gets no rows. An engineer should check what uses this login.'
         END
  FROM j_other_logins j
  UNION ALL
  SELECT 11, 2, 'j. Other database login behind the wall', '(none found)', '', 'Nothing to do.'
  WHERE NOT EXISTS (SELECT 1 FROM j_other_logins)
) r
ORDER BY r.sort, r.sub, r.item;
