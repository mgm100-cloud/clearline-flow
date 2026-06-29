#!/usr/bin/env python3
"""verify_counts.py — confirm the Azure copy matches Supabase, table by table.

Run this RIGHT AFTER a data sync (azure/load_only.sh) to prove nothing was lost before
flipping the domain. Compares row counts: Supabase (service-role REST) vs Azure Postgres.

Env (same as load_only.sh): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for the source,
and the standard libpq vars for the Azure target (host clflow-pg.postgres.database.azure.com,
user cladmin, db clflow, port 5432, sslmode require, and the admin secret in the usual libpq
password var). Alternatively point PG_CONN at a full connection URI instead of the PG* vars.

  python3 azure/verify_counts.py
Exit code 0 = every table matches; 1 = at least one mismatch (printed).
"""
import os, sys, json, urllib.request, urllib.parse

def supa_count(table):
    url = f"{os.environ['SUPABASE_URL'].rstrip('/')}/rest/v1/{table}?select=*&limit=1"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(url, headers={
        "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        # PostgREST returns the total in Content-Range: 0-0/<total>
        cr = r.headers.get("Content-Range", "*/0")
        return int(cr.split("/")[-1])

def main():
    import psycopg2
    if os.environ.get("PG_CONN"):
        conn = psycopg2.connect(os.environ["PG_CONN"])
    else:
        conn = psycopg2.connect(
            host=os.environ.get("PGHOST", "clflow-pg.postgres.database.azure.com"),
            user=os.environ.get("PGUSER", "cladmin"),
            dbname=os.environ.get("PGDATABASE", "clflow"),
            password=os.environ["PGPASSWORD"],
            port=int(os.environ.get("PGPORT", "5432")),
            sslmode=os.environ.get("PGSSLMODE", "require"),
        )
    cur = conn.cursor()
    cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
    tables = [r[0] for r in cur.fetchall()]

    print(f"{'table':32} {'supabase':>10} {'azure':>10}  ok")
    print("-" * 60)
    mismatches = 0
    for t in tables:
        try:
            az = None
            cur.execute(f'SELECT count(*) FROM public."{t}"')
            az = cur.fetchone()[0]
            sb = supa_count(t)
            ok = "OK" if sb == az else "*** MISMATCH"
            if sb != az:
                mismatches += 1
            print(f"{t:32} {sb:>10} {az:>10}  {ok}")
        except Exception as e:
            print(f"{t:32} {'?':>10} {str(az):>10}  ERROR {str(e)[:60]}")
            mismatches += 1
    print("-" * 60)
    print("ALL MATCH" if mismatches == 0 else f"{mismatches} table(s) need attention")
    conn.close()
    sys.exit(0 if mismatches == 0 else 1)

if __name__ == "__main__":
    main()
