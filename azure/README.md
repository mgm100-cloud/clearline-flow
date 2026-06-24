# Clearline Flow → Azure migration (faithful re-host, retire Supabase)

Move Clearline Flow off Supabase + Vercel onto Azure with Microsoft Entra sign-in,
**parallel-run with a single cutover** (Supabase/Vercel stay live until we flip).

**Why this is low-churn:** every one of the ~158 data calls goes through the single
`supabase` client in `src/supabaseClient.js`. Supabase's data API is just **PostgREST**.
So we keep the schema, the RLS, and almost all app code — we only:
1. host the same Postgres on **Azure Database for PostgreSQL** (`clflow-pg`),
2. front it with **self-hosted PostgREST** (the same engine Supabase runs),
3. replace **GoTrue auth** with **Entra (MSAL)** + a tiny **token-exchange** that mints a
   PostgREST-compatible JWT, and
4. re-point `supabaseClient.js` at the new PostgREST URL with that JWT.

The 158 `supabase.from(...)` call sites do **not** change.

## Auth model (why the shim exists)
The RLS policies call `auth.uid()`, `auth.role()`, `auth.jwt()` and
`public.get_user_role()` (which reads `user_profiles.role` by `id = auth.uid()`).
Supabase provides the `auth.*` helpers; vanilla Postgres does not — so
`sql/00_auth_compat.sql` recreates them (reading `request.jwt.claims`) plus the
`anon`/`authenticated`/`authenticator` roles. The token-exchange mints
`{"role":"authenticated","sub":"<entra-oid>","email":...}`, so after we re-key
`user_profiles.id` to each user's Entra **oid**, every existing policy works unchanged.

## Components on Azure
| Piece | Azure target | Status |
|---|---|---|
| Database | Azure DB for PostgreSQL Flexible Server `clflow-pg` | provider registered ✅; create in progress |
| Data API | PostgREST (App Service Linux container `clflow-pgrst`, image `postgrest/postgrest`) | to deploy |
| Auth | Entra (MSAL.js in the SPA) + token-exchange Function `clflow-fn` | app reg `7466cfea-…` exists; consent pending |
| SPA host | Azure Static Web App `clflow-web` | to create |
| Cron/edge fns | Azure Functions (3 Vercel crons + superllm + email + 10 CRM Deno fns) | to port |
| Email | keep Resend + MS Graph (creds → Key Vault) | unchanged |
| Relay | App Service `clprism-relay` (already on Azure) | drop Supabase ticker read |

## Runbook (ordered)
1. **Create Postgres** (done by Raj — provider registered):
   `az postgres flexible-server create -n clflow-pg -g cl-tool-rg -l eastus2 --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 --admin-user cladmin --admin-password '***' --public-access 0.0.0.0`
   then add your IP: `az postgres flexible-server firewall-rule create -n clflow-pg -g cl-tool-rg --rule-name myip --start-ip-address <IP> --end-ip-address <IP>`
2. **Load schema** into `clflow-pg`/`clflow`:
   - `sql/00_auth_compat.sql` (roles + auth shim) — **first**
   - the app schema: consolidated from the repo's `*.sql` (see `sql/10_schema.md`) **or** a
     `pg_dump --schema-only` of the live Supabase DB (preferred — captures the 4 cloud-only
     RPC fns: `calculate_quarter_end_date`, `update_quarter_end_dates`,
     `get_all_analyst_codes`, `get_analyst_emails`).
   - `sql/99_grants.sql` (grant table/sequence privileges to anon/authenticated).
3. **Copy data**: `pg_dump --data-only` from Supabase → `psql` into Azure PG (needs the Supabase
   DB connection string). Set up an ongoing refresh until cutover.
4. **Re-key users**: `sql/20_seed_users.sql` — seed `auth.users` from Entra + set
   `user_profiles.id` = each user's Entra **oid** (matched by email).
5. **Deploy PostgREST** (`clflow-pgrst`) pointing at `clflow-pg` with `PGRST_JWT_SECRET`,
   `PGRST_DB_ANON_ROLE=anon`, `PGRST_DB_URI=...authenticator...`.
6. **Deploy token-exchange** (`clflow-fn`): validate the Entra/MSAL token, mint the PostgREST JWT.
7. **Re-point the client** (flag-gated `REACT_APP_BACKEND=azure|supabase`):
   `supabaseClient.js` → PostgREST URL + minted JWT; `authService.js` → MSAL.
8. **Port functions**: 3 Vercel crons + superllm + email → Azure Functions (timer/HTTP); 10 CRM
   Deno edge fns → Azure Functions (Node) using a service connection to PG.
9. **Host SPA** on `clflow-web`; secrets → Key Vault.
10. **Parity test** → **cutover** (flip `REACT_APP_BACKEND=azure` + DNS); rollback = flip back.

## Pending from admin (John)
- Grant **admin consent** for the "Clearline Flow" app (`7466cfea-…`) — for MSAL sign-in.
- Set **Entra admin** on `clflow-pg` (optional; we use PGRST_JWT_SECRET auth for PostgREST).
