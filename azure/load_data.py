#!/usr/bin/env python3
"""Load Flow data Supabase -> Azure PG via JSON + json_populate_recordset.

Reads each public table from Supabase's REST API (service-role key, bypasses RLS)
as JSON, and inserts into Azure PG by letting Postgres coerce each JSON row to the
table's real column types. No CSV, so long free-text / jsonb / array columns can't
break parsing. Run by migrate_final.sh (schema already loaded, FKs/RLS relaxed).
"""
import os, json, sys, urllib.request, urllib.parse
import psycopg2
from psycopg2 import sql

REST = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"
SR   = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
AZ   = dict(host="clflow-pg.postgres.database.azure.com", port=5432, dbname="clflow",
            user="cladmin", password=os.environ["AZ_PW"], sslmode="require")
PAGE = 1000

def fetch(table, offset):
    url = f"{REST}/{urllib.parse.quote(table)}?select=*&limit={PAGE}&offset={offset}"
    req = urllib.request.Request(url, headers={
        "apikey": SR, "Authorization": "Bearer " + SR, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode())

conn = psycopg2.connect(**AZ); conn.autocommit = True
cur = conn.cursor()
cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
tables = [r[0] for r in cur.fetchall()]

for t in tables:
    total, off, err = 0, 0, None
    while True:
        try:
            page = fetch(t, off)
        except Exception as e:
            err = "fetch: " + str(e)[:140]; break
        if not isinstance(page, list):
            err = "not a REST table"; break
        if not page:
            break
        try:
            cur.execute(
                sql.SQL("INSERT INTO public.{} SELECT * FROM json_populate_recordset(NULL::public.{}, %s)")
                   .format(sql.Identifier(t), sql.Identifier(t)),
                [json.dumps(page)])
            total += len(page)
        except Exception as e:
            err = "insert: " + str(e).strip().replace("\n", " ")[:180]; break
        if len(page) < PAGE:
            break
        off += PAGE
    print(f"  {t:30s} {'ERROR ' + err if err else str(total) + ' rows'}", flush=True)

print("data load done")
