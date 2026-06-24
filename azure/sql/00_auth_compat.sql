-- ============================================================================
-- Clearline Flow → Azure: Supabase/PostgREST auth-compat shim
-- ============================================================================
-- Run this FIRST on the fresh Azure Database for PostgreSQL (clflow-pg), before
-- restoring the application schema. It recreates the pieces Supabase provided
-- for free so the EXISTING Row-Level-Security policies keep working unchanged
-- on plain Postgres fronted by self-hosted PostgREST:
--
--   * the roles PostgREST switches between: anon / authenticated / authenticator
--   * the auth.* helpers the policies call: auth.uid(), auth.role(), auth.jwt(),
--     auth.email()  (Supabase ships these; vanilla Postgres does not)
--
-- Our Entra->JWT token-exchange (azure/functions/token-exchange) mints a JWT with
-- {"role":"authenticated","sub":"<entra-oid>","email":"<user>"} signed with the
-- PostgREST JWT secret. PostgREST puts those claims in request.jwt.claims and
-- SET ROLE authenticated; the functions below read them, so auth.uid() = the
-- user's Entra oid and auth.role() = 'authenticated' — exactly what the policies
-- (e.g. get_user_role() -> user_profiles.role) expect.
-- ============================================================================

-- 1) Roles (mirror Supabase). authenticator is the LOGIN role PostgREST connects
--    as; it can SET ROLE to anon (unauthenticated) or authenticated (valid JWT).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    -- password is set out-of-band (see azure/README.md); PostgREST uses it to connect
    CREATE ROLE authenticator NOINHERIT LOGIN;
  END IF;
  -- service_role: used by the server-side functions (crons, CRM edge fns) that bypass RLS,
  -- and referenced by some Supabase-dumped GRANTs/policies — create it so the restore is clean.
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
-- table/sequence grants are applied in 99_grants.sql AFTER the app schema loads.

-- 2) auth schema + the helper functions the RLS policies call.
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

-- Full JWT claims object (Supabase: auth.jwt()).
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

-- Current user id = the 'sub' claim (Supabase: auth.uid()). We mint sub = Entra oid.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
    COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'sub',
  '')::uuid
$$;

-- Current role = the 'role' claim (Supabase: auth.role()); defaults to 'anon'.
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
  'anon')
$$;

-- Convenience: current user email (some policies/functions may want it).
CREATE OR REPLACE FUNCTION auth.email()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
$$;

-- 3) Minimal auth.users so user_profiles' FK (id REFERENCES auth.users) still
--    resolves. GoTrue is gone, so this table is seeded from Entra (id = oid,
--    email) by azure/sql/20_seed_users.sql instead of by a signup trigger.
CREATE TABLE IF NOT EXISTS auth.users (
  id    uuid PRIMARY KEY,
  email text
);
GRANT SELECT ON auth.users TO authenticated;
