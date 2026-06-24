#!/usr/bin/env bash
# ============================================================================
# Clearline Flow: copy schema + data from Supabase -> Azure Database for PostgreSQL
# Run from Azure Cloud Shell (has psql + pg_dump). Safe to re-run.
#
#   export SUPA_URI='postgresql://postgres:<PW>@db.<ref>.supabase.co:5432/postgres'
#   export AZ_PW='<clflow-pg admin password>'
#   bash azure/migrate_data.sh
#
# Get SUPA_URI from: Supabase dashboard -> Project Settings -> Database ->
# Connection string -> URI (it includes the DB password).
# ============================================================================
set -uo pipefail
: "${SUPA_URI:?set SUPA_URI to the Supabase Postgres connection string}"
: "${AZ_PW:?set AZ_PW to the clflow-pg admin password}"
AZ_URI="postgresql://cladmin:${AZ_PW}@clflow-pg.postgres.database.azure.com:5432/clflow?sslmode=require"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "==> 1/5 auth-compat shim (roles + auth.* helpers + stub auth.users)"
psql "$AZ_URI" -v ON_ERROR_STOP=1 -f "$HERE/sql/00_auth_compat.sql"

echo "==> 2/5 dump + load PUBLIC schema (structure only) from Supabase"
pg_dump "$SUPA_URI" --schema-only --schema=public --no-owner --no-privileges -f /tmp/flow_schema.sql
# benign "role ... does not exist" / "already exists" notices are fine here
psql "$AZ_URI" -f /tmp/flow_schema.sql

echo "==> 3/5 detach user_profiles from auth.users FK (GoTrue is gone; we re-key to Entra oids later)"
psql "$AZ_URI" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;"

echo "==> 4/5 dump + load DATA from Supabase (public)"
pg_dump "$SUPA_URI" --data-only --schema=public --no-owner -f /tmp/flow_data.sql
psql "$AZ_URI" -v ON_ERROR_STOP=0 -f /tmp/flow_data.sql
# seed the stub auth.users from user_profiles so any remaining references resolve
psql "$AZ_URI" -v ON_ERROR_STOP=0 -c "INSERT INTO auth.users(id,email) SELECT id,email FROM public.user_profiles ON CONFLICT (id) DO NOTHING;"

echo "==> 5/5 grants for PostgREST roles"
psql "$AZ_URI" -v ON_ERROR_STOP=1 <<'SQL'
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;
SQL

echo
echo "DONE. Quick checks:"
echo "  psql \"\$AZ_URI\" -c '\\dt public.*'           # tables present"
echo "  psql \"\$AZ_URI\" -c 'SELECT count(*) FROM public.tickers;'"
echo "  psql \"\$AZ_URI\" -c 'SELECT id,email,role FROM public.user_profiles;'"
echo "Re-run anytime to refresh data (structure is idempotent; data may report dup-key notices)."
