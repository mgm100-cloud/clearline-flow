#!/usr/bin/env bash
# Deploy the Entra->PostgREST token-exchange (azure/tokenexch) as a Node webapp on the
# existing App Service plan. Pulls PGRST_JWT_SECRET straight from the PostgREST app so it
# matches (no manual secret handling). Run after deploy_postgrest.sh.
#   bash azure/deploy_tokenexch.sh
set -uo pipefail
RG=cl-tool-rg; PLAN="${PLAN:-rpawar_asp_0361}"; APP=clflow-tokenexch
TENANT=36b31f4f-e2a5-422d-a156-ec0be5c4f52f
FLOW_CLIENT_ID=7466cfea-a7e8-4722-9b7d-70b17ecbddb2
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "== read PGRST_JWT_SECRET from PostgREST (so the two match) =="
SECRET=$(az webapp config appsettings list -g "$RG" -n clflow-pgrst --query "[?name=='PGRST_JWT_SECRET'].value" -o tsv)
[ -z "$SECRET" ] && { echo "could not read PGRST_JWT_SECRET from clflow-pgrst — deploy PostgREST first"; exit 1; }

echo "== create webapp (Node 20) =="
az webapp show -g "$RG" -n "$APP" -o none 2>/dev/null || az webapp create -g "$RG" -p "$PLAN" -n "$APP" --runtime "NODE:20-lts" -o none

echo "== app settings =="
az webapp config appsettings set -g "$RG" -n "$APP" -o none --settings \
  TENANT_ID="$TENANT" FLOW_CLIENT_ID="$FLOW_CLIENT_ID" PGRST_JWT_SECRET="$SECRET" \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true
az webapp config set -g "$RG" -n "$APP" --startup-file "node server.js" -o none

echo "== zip + deploy (Oryx runs npm install) =="
( cd "$HERE/tokenexch" && rm -f /tmp/te.zip && zip -qr /tmp/te.zip server.js package.json )
az webapp deploy -g "$RG" -n "$APP" --src-path /tmp/te.zip --type zip -o none

echo "done. Health: https://${APP}.azurewebsites.net/health  (give it ~1-2 min to build)"
