-- rekey_user_profiles.sql — re-point user_profiles.id from Supabase UUIDs to Entra object-ids.
--
-- WHY: load_only.sh truncates + reloads every public table straight from Supabase, so
-- user_profiles.id comes back as the Supabase auth UUID. Per-user RLS (get_user_role / auth.uid())
-- resolves against the Entra oid that the token-exchange mints as `sub`, so id MUST be the Entra oid.
-- RUN THIS RIGHT AFTER EVERY azure/load_only.sh.
--
-- Idempotent and case-insensitive on email. Rows whose email isn't in the map keep their current id
-- (printed by the verify SELECT at the bottom so you can spot anyone unmapped — e.g. a new hire:
-- add them here with their Entra oid from `az ad user list`).
--
-- Run with psql against clflow-pg using the standard libpq env vars (host
-- clflow-pg.postgres.database.azure.com, user cladmin, db clflow, port 5432, sslmode require,
-- admin secret in the usual libpq password var):
--   psql -v ON_ERROR_STOP=1 -f azure/rekey_user_profiles.sql

BEGIN;

-- user_profiles.id has no inbound FK (verified 2026-06-24); safe to repoint in place.
UPDATE public.user_profiles p
SET id = v.oid::uuid
FROM (VALUES
  ('aryan@clearlinecap.com',       '8fad72a1-5d1e-49c5-9bad-9ab970e64045'),
  ('doricchio@clearlinecap.com',   'effea956-8e5c-415d-ae56-ce20bb54cc55'),
  ('dpeterson@clearlinecap.com',   '4239cd7d-c29f-41a6-8148-61c90bd75708'),
  ('eortiz@clearlinecap.com',      '2a0a20c4-b59e-486d-8384-b34cf8a6f1c6'),
  ('ganderson@clearlinecap.com',   '326df17b-7ce0-4894-a86e-2b23dbf82662'),
  ('gquigley@clearlinecap.com',    '55e10ff8-e0ab-435d-97fc-9f6477fad3f7'),
  ('hswieca@clearlinecap.com',     'd621be34-0687-4076-a56d-c43bf9c91737'),
  ('jchapman@clearlinecap.com',    '6eb68696-9667-4491-b5ca-87cb02ea3550'),
  ('kkang@clearlinecap.com',       '7f155127-31fd-4145-96b5-e4bf4ecf4edc'),
  ('klee@clearlinecap.com',        'cf0f09c3-2ee8-4cef-9fff-fbd2910a5bf3'),
  ('ltzeng@clearlinecap.com',      'f7d49baf-d984-48db-a5ed-ef2034f8342e'),
  ('mbhasin@clearlinecap.com',     '46d77749-64df-4433-89c5-c1c057e6fe22'),
  ('mhoak@clearlinecap.com',       '8a737ec8-aef1-496c-9cf0-3cc848bf0c47'),
  ('mmajzner@clearlinecap.com',    '69c86011-980a-4c0d-b2eb-57355b4389a7'),
  ('mmendelson@clearlinecap.com',  '80d2a18c-8381-45f4-8ec2-8c68acb04df6'),
  ('mschwartz@clearlinecap.com',   '5f9a64a9-5cc1-45d0-a761-4b745ded2a2d'),
  ('mshapiro@clearlinecap.com',    '27666ce0-721d-4fdd-ab9f-9685ac69d3a0'),
  ('mshen@clearlinecap.com',       '13e6d0af-e6df-43f3-8aa9-f50ffe763685'),
  ('nlee@clearlinecap.com',        '3cb0e4e2-761e-48b7-9099-2ec1f54148e7'),
  ('nturchyn@clearlinecap.com',    '1f424c27-d5cc-4610-959b-6431d877df46'),
  ('rma@clearlinecap.com',         '808882f1-88ce-42ef-bd80-9fddf7ab5af7'),
  ('rpawar@clearlinecap.com',      'e1876b87-5827-4fe6-b91b-a7574ec47612'),
  ('ssingh@clearlinecap.com',      '093294dd-645e-4167-a4ea-fdec9d152ad2'),
  ('tcagna@clearlinecap.com',      '23e65bd8-6ec8-4541-8760-b00b653d8ef7'),
  ('tmurray@clearlinecap.com',     'cfd036ba-b9e0-4546-bbc2-70297969351b')
) AS v(email, oid)
WHERE lower(p.email) = v.email
  AND p.id IS DISTINCT FROM v.oid::uuid;

COMMIT;

-- Report: any profile still on a non-Entra id is unmapped — add them to the VALUES list above.
SELECT email,
       id,
       CASE WHEN id::text ~ '^(8fad72a1|effea956|4239cd7d|2a0a20c4|326df17b|55e10ff8|d621be34|6eb68696|7f155127|cf0f09c3|f7d49baf|46d77749|8a737ec8|69c86011|80d2a18c|5f9a64a9|27666ce0|13e6d0af|3cb0e4e2|1f424c27|808882f1|e1876b87|093294dd|23e65bd8|cfd036ba)'
            THEN 'entra' ELSE 'UNMAPPED' END AS id_kind
FROM public.user_profiles
ORDER BY id_kind DESC, email;
