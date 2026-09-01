\set ON_ERROR_STOP on

-- Local preflight for the managed Auth/Storage COPY bridge. The restore runner
-- executes this file, the byte-exact official Storage migrations 61-64 and the
-- final validation in one transaction. Do not add BEGIN/COMMIT here.
DO $guard$
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'service compatibility must run against postgres';
  END IF;

  IF to_regclass('auth.custom_oauth_providers') IS NULL
     OR to_regclass('storage.migrations') IS NULL
     OR to_regclass('storage.buckets') IS NULL
     OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'required Auth/Storage tables are missing';
  END IF;

  IF to_regprocedure('storage.filename(text)') IS NULL
     OR to_regprocedure(
       'storage.search(text,text,integer,integer,integer,text,text,text)'
     ) IS NULL
     OR to_regprocedure(
       'storage.search_by_timestamp(text,text,integer,integer,text,text,text,text)'
     ) IS NULL
     OR to_regprocedure('storage.get_common_prefix(text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Storage migration 60 function baseline is incomplete';
  END IF;
END
$guard$;

-- Managed Auth is one additive column ahead of the pinned self-hosted image.
ALTER TABLE auth.custom_oauth_providers
  ADD COLUMN IF NOT EXISTS custom_claims_allowlist text[] NOT NULL DEFAULT '{}'::text[];

DO $auth_verify$
DECLARE
  compatible_columns integer;
BEGIN
  SELECT count(*) INTO compatible_columns
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  LEFT JOIN pg_attrdef AS default_value
    ON default_value.adrelid = attribute.attrelid
   AND default_value.adnum = attribute.attnum
  WHERE NOT attribute.attisdropped
    AND namespace.nspname = 'auth'
    AND relation.relname = 'custom_oauth_providers'
    AND attribute.attname = 'custom_claims_allowlist'
    AND attribute.atttypid = 'text[]'::regtype
    AND attribute.attnotnull
    AND pg_get_expr(default_value.adbin, default_value.adrelid) = '''{}''::text[]';

  IF compatible_columns <> 1 THEN
    RAISE EXCEPTION 'Auth compatibility column failed verification';
  END IF;
END
$auth_verify$;
