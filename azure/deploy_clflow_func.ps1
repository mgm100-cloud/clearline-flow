# Deploy/redeploy the clflow-func Azure Functions app.
#
# WHY this script: `az functionapp deployment source config-zip` and `az functionapp deploy`
# both route through the SCM/Kudu endpoint, which Flex Consumption locks down (basic-auth
# disabled by default -> HTTP 403). Azure Functions Core Tools (`func ... publish`) uses your
# AAD login (the RBAC token), so it works WITHOUT re-enabling basic auth.
#
# PREREQS (one-time):
#   1. az login   (and your PIM-Contributor role on cl-tool-rg ACTIVATED)
#   2. Azure Functions Core Tools v4:   npm i -g azure-functions-core-tools@4 --unsafe-perm true
#      (check: func --version  -> 4.x)
#
# App settings (RESEND_API_KEY, PG_CONN, etc.) are NOT touched by a publish — they persist.
#
#   pwsh azure/deploy_clflow_func.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $here "clflow-func")

Write-Host "== func version =="
func --version

Write-Host "== publishing clflow-func (remote build on Flex) =="
# --no-build would ship local node_modules; default does an Oryx remote build (recommended on Flex).
func azure functionapp publish clflow-func

Write-Host ""
Write-Host "Done. Smoke test:"
Write-Host "  Invoke-WebRequest -UseBasicParsing -Method POST https://clflow-func.azurewebsites.net/api/send-email -Body '{}' -ContentType application/json"
Write-Host "  (expect 401 {\"error\":\"missing bearer token\"} = our verifier is live)"
