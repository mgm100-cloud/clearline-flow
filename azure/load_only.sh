#!/usr/bin/env bash
# Data-only (re)load into the EXISTING Azure schema. No pg_dump / cldump needed —
# data comes from Supabase's REST API (service-role). Relaxes FKs + RLS, truncates,
# loads via JSON (json_populate_recordset), then restores FKs + RLS + grants.
#
#   export AZ_PW='<new azure-pg admin password>'
#   export SUPABASE_URL='https://<project-ref>.supabase.co'   # VERIFY: echo "[$SUPABASE_URL]"
#   export SUPABASE_SERVICE_ROLE_KEY='<service-role-jwt>'
#   bash azure/load_only.sh
set -uo pipefail
: "${AZ_PW:?}"; : "${SUPABASE_URL:?}"; : "${SUPABASE_SERVICE_ROLE_KEY:?}"
case "$SUPABASE_URL" in *.supabase.co) ;; *) echo "SUPABASE_URL looks wrong: [$SUPABASE_URL] (must end .supabase.co)"; exit 1;; esac
AZ="postgresql://cladmin:${AZ_PW}@clflow-pg.postgres.database.azure.com:5432/clflow?sslmode=require"
HERE="$(cd "$(dirname "$0")" && pwd)"
azq(){ psql "$AZ" -v ON_ERROR_STOP=0 -q "$@"; }

echo "== relax FKs + RLS, truncate =="
psql "$AZ" -tAc "SELECT 'ALTER TABLE '||conrelid::regclass||' DROP CONSTRAINT IF EXISTS \"'||conname||'\";' FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace" > /tmp/fk_drop.sql
psql "$AZ" -tAc "SELECT 'ALTER TABLE '||conrelid::regclass||' ADD CONSTRAINT \"'||conname||'\" '||pg_get_constraintdef(oid)||';' FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace AND confrelid::regclass::text NOT LIKE 'auth.%'" > /tmp/fk_readd.sql
psql "$AZ" -tAc "SELECT 'ALTER TABLE public.\"'||tablename||'\" ENABLE ROW LEVEL SECURITY;' FROM pg_tables WHERE schemaname='public' AND rowsecurity" > /tmp/rls_on.sql
psql "$AZ" -tAc "SELECT 'ALTER TABLE public.\"'||tablename||'\" DISABLE ROW LEVEL SECURITY;' FROM pg_tables WHERE schemaname='public'" > /tmp/rls_off.sql
psql "$AZ" -tAc "SELECT 'TRUNCATE public.\"'||tablename||'\" CASCADE;' FROM pg_tables WHERE schemaname='public'" > /tmp/trunc.sql
azq -f /tmp/fk_drop.sql; azq -f /tmp/rls_off.sql; azq -f /tmp/trunc.sql

echo "== load data (JSON via service-role REST) =="
python3 -c "import psycopg2" 2>/dev/null || pip install -q --user psycopg2-binary 2>/dev/null || pip3 install -q --user psycopg2-binary
AZ_PW="$AZ_PW" SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" python3 "$HERE/load_data.py"

echo "== restore FKs + RLS + grants =="
azq -f /tmp/fk_readd.sql; azq -f /tmp/rls_on.sql
azq -c "ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;"
psql "$AZ" -v ON_ERROR_STOP=0 <<'SQL'
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;
SQL
echo "== DONE =="; psql "$AZ" -tAc "SELECT relname||' = '||n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY relname;"
