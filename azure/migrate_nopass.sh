#!/usr/bin/env bash
# ============================================================================
# Clearline Flow -> Azure migration WITHOUT the Postgres password.
# Schema  : rebuilt from this repo's .sql files (the schema's source of truth).
# Data    : pulled from Supabase's REST API using the SERVICE-ROLE key (bypasses
#           RLS), then \copy'd into Azure PG. No direct Supabase DB connection.
#
# Run from the repo root in Azure Cloud Shell:
#   export AZ_PW='ClearlineFlow-Az-2026x'
#   export SUPABASE_URL='https://zdlpbpcezvpkfqbqmefw.supabase.co'
#   export SUPABASE_SERVICE_ROLE_KEY='eyJ...'     # the service_role JWT
#   bash azure/migrate_nopass.sh
# ============================================================================
set -uo pipefail
: "${AZ_PW:?set AZ_PW (clflow-pg admin password)}"
: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?set SUPABASE_SERVICE_ROLE_KEY}"
AZ="postgresql://cladmin:${AZ_PW}@clflow-pg.postgres.database.azure.com:5432/clflow?sslmode=require"
REST="${SUPABASE_URL%/}/rest/v1"
SR="$SUPABASE_SERVICE_ROLE_KEY"
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/.." && pwd)"
azq(){ psql "$AZ" -v ON_ERROR_STOP=0 -q "$@"; }

echo "==================== 1) auth-compat shim ===================="
psql "$AZ" -v ON_ERROR_STOP=1 -f "$HERE/sql/00_auth_compat.sql"

echo "==================== 2) schema from repo .sql ===================="
cd "$ROOT"
# base + table creates + auth setup, in dependency order
for f in supabase-schema.sql \
         create-old-theses-table.sql \
         create-tickers-extra-info-table.sql \
         create-earnings-table.sql \
         create-todos-table.sql \
         create-todo-tasks-table.sql \
         create-earnings-display-view.sql \
         database/create-auth-setup.sql; do
  [ -f "$f" ] && { echo "  -> $f"; azq -f "$f"; }
done
# CRM schema (master runs \i for core/email/outlook/client-data/import/functions)
[ -f database/crm-schema-master.sql ] && { echo "  -> database/crm-schema-master.sql"; azq -f database/crm-schema-master.sql; }
# incremental patches (idempotent / tolerant); alphabetical is fine for these
for f in add-*.sql fix-*.sql update-*.sql expand-*.sql enable-*.sql; do
  [ -f "$f" ] && { echo "  -> $f"; azq -f "$f"; }
done
# GoTrue is gone: detach user_profiles from auth.users so data loads cleanly
azq -c "ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;"

echo "==================== 3) data via Supabase REST (service-role) ===================="
# enumerate exposed tables from the PostgREST OpenAPI root (Swagger 2.0 -> .definitions)
TABLES=$(curl -s "$REST/" -H "apikey: $SR" -H "Authorization: Bearer $SR" \
         | jq -r '.definitions | keys[]' 2>/dev/null | sort -u)
if [ -z "$TABLES" ]; then echo "  could not list tables from $REST/ — check SUPABASE_URL / key"; exit 1; fi

load_table(){   # $1=table ; returns 0 loaded, 1 deferred(FK), 9 not-a-table
  local t="$1" off=0 total=0 first=1 code lines rows hdr
  : > /tmp/t.csv
  while :; do
    code=$(curl -s -w "%{http_code}" -o /tmp/page.csv \
      "$REST/$t?select=*&limit=1000&offset=$off" \
      -H "apikey: $SR" -H "Authorization: Bearer $SR" -H "Accept: text/csv")
    [ "$code" != "200" ] && return 9
    lines=$(wc -l < /tmp/page.csv)
    [ "$lines" -le 0 ] && break
    if [ "$first" -eq 1 ]; then cat /tmp/page.csv > /tmp/t.csv; first=0; else tail -n +2 /tmp/page.csv >> /tmp/t.csv; fi
    rows=$((lines-1)); total=$((total+rows)); off=$((off+1000))
    [ "$rows" -lt 1000 ] && break
  done
  if [ "$total" -le 0 ]; then echo "0 rows"; return 0; fi
  hdr=$(head -1 /tmp/t.csv)
  # \copy is atomic: on FK/type error it loads nothing, so a later pass can retry cleanly
  if psql "$AZ" -v ON_ERROR_STOP=1 -q \
       -c "\copy public.\"$t\" ($hdr) FROM '/tmp/t.csv' WITH (FORMAT csv, HEADER true)" 2>/tmp/copyerr; then
    echo "$total rows"; return 0
  fi
  return 1
}

declare -A DONE
for pass in 1 2 3 4 5; do
  prog=0
  for t in $TABLES; do
    [ "${DONE[$t]:-}" = "1" ] && continue
    printf "  [pass %s] %-28s " "$pass" "$t"
    set +e; load_table "$t"; rc=$?; set -e 2>/dev/null
    if [ "$rc" = "0" ]; then DONE[$t]=1; prog=1
    elif [ "$rc" = "9" ]; then echo "skip (view/not a table)"; DONE[$t]=1
    else echo "deferred (fk/type) — $(head -c 120 /tmp/copyerr 2>/dev/null)"; fi
  done
  [ "$prog" = "0" ] && break
done

echo "==================== 4) grants for PostgREST roles ===================="
psql "$AZ" -v ON_ERROR_STOP=0 <<'SQL'
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
SQL

echo "==================== DONE ===================="
echo "Tables in Azure PG:"; psql "$AZ" -c "\dt public.*"
echo "Spot checks:"
psql "$AZ" -c "SELECT count(*) AS tickers FROM public.tickers;" 2>/dev/null
psql "$AZ" -c "SELECT id,email,role FROM public.user_profiles;" 2>/dev/null
echo "Re-run safe for schema; for data, TRUNCATE a table first if you want a clean reload."
