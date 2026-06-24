#!/usr/bin/env bash
# ============================================================================
# Clearline Flow -> Azure: FINAL migrator (no DB password).
#   Schema : pg_dump --schema-only as the temp read role cldump (RLS doesn't
#            block DDL) -> faithful live schema.
#   Data   : pulled via Supabase REST with the SERVICE-ROLE key (bypasses RLS),
#            loaded with FKs dropped + RLS disabled so order/policies don't block,
#            then FKs + RLS restored.
#
# Env (run from repo root in Cloud Shell):
#   export AZ_PW='ClearlineFlow-Az-2026x'
#   export SUPA_URI='postgresql://cldump.zdlpbpcezvpkfqbqmefw:ClearlineDump2026x@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require'
#   export SUPABASE_URL='https://zdlpbpcezvpkfqbqmefw.supabase.co'
#   export SUPABASE_SERVICE_ROLE_KEY='eyJ...'
#   bash azure/migrate_final.sh
# ============================================================================
set -uo pipefail
: "${AZ_PW:?}"; : "${SUPA_URI:?}"; : "${SUPABASE_URL:?}"; : "${SUPABASE_SERVICE_ROLE_KEY:?}"
AZ="postgresql://cladmin:${AZ_PW}@clflow-pg.postgres.database.azure.com:5432/clflow?sslmode=require"
REST="${SUPABASE_URL%/}/rest/v1"; SR="$SUPABASE_SERVICE_ROLE_KEY"
HERE="$(cd "$(dirname "$0")" && pwd)"
azq(){ psql "$AZ" -v ON_ERROR_STOP=0 -q "$@"; }

echo "==================== 1) shim (roles, auth.*, extensions schema) ===================="
psql "$AZ" -v ON_ERROR_STOP=1 -f "$HERE/sql/00_auth_compat.sql"

echo "==================== 2) faithful schema via pg_dump --schema-only ===================="
pg_dump "$SUPA_URI" --schema-only --schema=public --no-owner --no-privileges -f /tmp/flow_schema.sql || { echo "pg_dump failed"; exit 1; }
azq -f /tmp/flow_schema.sql        # 'schema public already exists' etc. are benign

echo "==================== 3) relax FKs + RLS for the load ===================="
# capture re-add statements (skip FKs that point at the auth schema -> we re-key to Entra later)
psql "$AZ" -tAc "SELECT 'ALTER TABLE '||conrelid::regclass||' DROP CONSTRAINT IF EXISTS \"'||conname||'\";' FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace" > /tmp/fk_drop.sql
psql "$AZ" -tAc "SELECT 'ALTER TABLE '||conrelid::regclass||' ADD CONSTRAINT \"'||conname||'\" '||pg_get_constraintdef(oid)||';' FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace AND confrelid::regclass::text NOT LIKE 'auth.%'" > /tmp/fk_readd.sql
psql "$AZ" -tAc "SELECT 'ALTER TABLE public.\"'||tablename||'\" ENABLE ROW LEVEL SECURITY;' FROM pg_tables WHERE schemaname='public' AND rowsecurity" > /tmp/rls_on.sql
psql "$AZ" -tAc "SELECT 'ALTER TABLE public.\"'||tablename||'\" DISABLE ROW LEVEL SECURITY;' FROM pg_tables WHERE schemaname='public'" > /tmp/rls_off.sql
azq -f /tmp/fk_drop.sql
azq -f /tmp/rls_off.sql

echo "==================== 4) data via service-role REST (JSON -> json_populate_recordset) ===================="
# JSON round-trip (not CSV): Postgres coerces each row to the table's real column types,
# so long free-text / jsonb / array columns can't break parsing.
python3 -c "import psycopg2" 2>/dev/null || pip install -q --user psycopg2-binary 2>/dev/null || pip3 install -q --user psycopg2-binary
AZ_PW="$AZ_PW" SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SR" python3 "$HERE/load_data.py"

echo "==================== 5) restore FKs + RLS, grants ===================="
azq -f /tmp/fk_readd.sql
azq -f /tmp/rls_on.sql
# user_profiles no longer references auth.users (we'll re-key id -> Entra oid later)
azq -c "ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;"
psql "$AZ" -v ON_ERROR_STOP=0 <<'SQL'
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;
SQL

echo "==================== DONE ===================="
psql "$AZ" -c "\dt public.*"
echo "Row counts:"
psql "$AZ" -tAc "SELECT relname||' = '||n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY relname;" 2>/dev/null
psql "$AZ" -c "SELECT count(*) AS tickers FROM public.tickers;" 2>/dev/null
psql "$AZ" -c "SELECT count(*) AS accounts FROM public.accounts;" 2>/dev/null
