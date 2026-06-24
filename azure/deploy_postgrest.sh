#!/usr/bin/env bash
# Deploy PostgREST (the data API that replaces Supabase's auto-REST) on Azure App
# Service, pointed at clflow-pg. PostgREST connects as the `authenticator` role and
# SET ROLE's to anon / authenticated based on the JWT the token-exchange mints.
#
# You provide three values (GENERATE the two new ones yourself, keep them private —
# do NOT paste them in chat or commit them):
#   export AZ_PW='<clflow-pg admin password>'          # used once, to set the authenticator pw
#   export AUTH_PW='<URL-SAFE pw for authenticator>'   # letters+digits+dashes ONLY (no @ : / # ?)
#   export JWT_SECRET='<openssl rand -hex 32>'         # shared secret: PostgREST verifies, token-exchange signs
#   bash azure/deploy_postgrest.sh
set -uo pipefail
: "${AZ_PW:?}"; : "${AUTH_PW:?}"; : "${JWT_SECRET:?}"
case "$AUTH_PW" in *[!A-Za-z0-9-]*) echo "AUTH_PW must be letters/digits/dashes only (it goes in a URI)"; exit 1;; esac
RG=cl-tool-rg; PLAN=clflow-plan; APP=clflow-pgrst
export PGHOST=clflow-pg.postgres.database.azure.com PGPORT=5432 PGUSER=cladmin PGDATABASE=clflow PGSSLMODE=require PGPASSWORD="$AZ_PW"

echo "== 1) set the authenticator login password on clflow-pg =="
psql -v ON_ERROR_STOP=1 -c "ALTER ROLE authenticator WITH LOGIN PASSWORD '${AUTH_PW}';"

echo "== 2) App Service plan (Linux B1) + PostgREST container =="
az appservice plan create -g "$RG" -n "$PLAN" --is-linux --sku B1 -o none 2>/dev/null || true
az webapp create -g "$RG" -p "$PLAN" -n "$APP" --deployment-container-image-name postgrest/postgrest:latest -o none

echo "== 3) configure PostgREST (env -> app settings) =="
az webapp config appsettings set -g "$RG" -n "$APP" -o none --settings \
  PGRST_DB_URI="postgres://authenticator:${AUTH_PW}@clflow-pg.postgres.database.azure.com:5432/clflow?sslmode=require" \
  PGRST_DB_SCHEMAS="public" \
  PGRST_DB_ANON_ROLE="anon" \
  PGRST_JWT_SECRET="${JWT_SECRET}" \
  PGRST_DB_USE_LEGACY_GUCS="false" \
  PGRST_OPENAPI_SERVER_PROXY_URI="https://${APP}.azurewebsites.net" \
  WEBSITES_PORT="3000"

echo "== 4) restart =="
az webapp restart -g "$RG" -n "$APP" -o none
echo
echo "PostgREST URL: https://${APP}.azurewebsites.net  (give it ~1-2 min to pull the image)"
echo "Tests:"
echo "  curl -s https://${APP}.azurewebsites.net/         # OpenAPI root (200 once up)"
echo "  curl -s 'https://${APP}.azurewebsites.net/tickers?select=ticker&limit=1'   # anon read"
